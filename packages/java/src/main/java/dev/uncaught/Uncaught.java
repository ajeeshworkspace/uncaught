// ---------------------------------------------------------------------------
// dev.uncaught — static init / global singleton
// ---------------------------------------------------------------------------

package dev.uncaught;

/**
 * Static entry point for the Uncaught Java SDK.
 * <p>
 * Manages a global singleton {@link UncaughtClient} and provides convenience
 * methods for common operations.
 *
 * <pre>{@code
 * // Initialise once at application startup
 * UncaughtClient client = Uncaught.init(new Config()
 *     .projectKey("my-project")
 *     .environment("production")
 *     .release("1.2.3"));
 *
 * // Capture errors anywhere
 * try {
 *     riskyOperation();
 * } catch (Exception e) {
 *     Uncaught.captureError(e);
 * }
 *
 * // Add breadcrumbs
 * Uncaught.addBreadcrumb("navigation", "http", "GET /api/users");
 * }</pre>
 */
public final class Uncaught {

    private Uncaught() { /* utility class */ }

    private static volatile UncaughtClient client;

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /**
     * Initialise the Uncaught SDK with the given configuration.
     * <p>
     * Calling this more than once replaces the previous client instance.
     *
     * @param config SDK configuration
     * @return the newly created client
     */
    public static UncaughtClient init(Config config) {
        client = new UncaughtClient(config);
        return client;
    }

    /**
     * Initialise the SDK with default configuration.
     */
    public static UncaughtClient init() {
        return init(new Config());
    }

    // -----------------------------------------------------------------------
    // Client access
    // -----------------------------------------------------------------------

    /**
     * Return the current singleton client, or {@code null} if {@link #init}
     * has not been called.
     */
    public static UncaughtClient getClient() {
        return client;
    }

    // -----------------------------------------------------------------------
    // Convenience static methods (delegate to singleton)
    // -----------------------------------------------------------------------

    /**
     * Capture a {@link Throwable} using the global client.
     *
     * @return event ID, or {@code null} if dropped or client not initialised
     */
    public static String captureError(Throwable error) {
        UncaughtClient c = client;
        if (c == null) return null;
        return c.captureError(error);
    }

    /**
     * Capture a {@link Throwable} with context using the global client.
     */
    public static String captureError(Throwable error, UncaughtClient.CaptureContext context) {
        UncaughtClient c = client;
        if (c == null) return null;
        return c.captureError(error, context);
    }

    /**
     * Capture a plain message using the global client.
     */
    public static String captureMessage(String message) {
        UncaughtClient c = client;
        if (c == null) return null;
        return c.captureMessage(message);
    }

    /**
     * Capture a plain message with a severity level.
     */
    public static String captureMessage(String message, String level) {
        UncaughtClient c = client;
        if (c == null) return null;
        return c.captureMessage(message, level);
    }

    /**
     * Add a breadcrumb using the global client.
     */
    public static void addBreadcrumb(Types.Breadcrumb crumb) {
        UncaughtClient c = client;
        if (c != null) c.addBreadcrumb(crumb);
    }

    /**
     * Add a breadcrumb using the global client (convenience overload).
     */
    public static void addBreadcrumb(String type, String category, String message) {
        UncaughtClient c = client;
        if (c != null) c.addBreadcrumb(type, category, message);
    }

    /**
     * Set user context on the global client.
     */
    public static void setUser(Types.UserInfo user) {
        UncaughtClient c = client;
        if (c != null) c.setUser(user);
    }

    /**
     * Clear user context on the global client.
     */
    public static void clearUser() {
        UncaughtClient c = client;
        if (c != null) c.clearUser();
    }

    /**
     * Install a global uncaught exception handler that captures errors
     * via the Uncaught SDK before delegating to the original handler.
     */
    public static void installUncaughtExceptionHandler() {
        Thread.UncaughtExceptionHandler original = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                UncaughtClient c = client;
                if (c != null) {
                    c.captureError(throwable, new UncaughtClient.CaptureContext()
                            .level(Types.LEVEL_FATAL));
                }
            } catch (Exception e) {
                // Never prevent the original handler from running.
            }
            if (original != null) {
                original.uncaughtException(thread, throwable);
            }
        });
    }
}
