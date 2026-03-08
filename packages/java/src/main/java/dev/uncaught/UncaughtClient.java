// ---------------------------------------------------------------------------
// dev.uncaught — UncaughtClient (SDK entry-point)
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Main client for the Uncaught error monitoring SDK.
 * <p>
 * Captures errors through a pipeline:
 * normalise error -> generate fingerprint -> rate-limit -> collect breadcrumbs
 * -> detect environment -> sanitise -> build fix prompt -> transport.send
 * <p>
 * Thread-safe: can be shared across threads.
 */
public class UncaughtClient {

    private static final String SDK_NAME = "dev.uncaught/java";
    private static final String SDK_VERSION = "0.1.0";

    private final Config config;
    private final BreadcrumbStore breadcrumbs;
    private final LocalFileTransport transport;
    private final RateLimiter rateLimiter;
    private final String sessionId;
    private final Set<String> seenFingerprints = new HashSet<>();

    private volatile Types.UserInfo user;

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    public UncaughtClient(Config config) {
        this.config = config != null ? config : new Config();
        this.breadcrumbs = new BreadcrumbStore(this.config.getMaxBreadcrumbs());
        this.rateLimiter = new RateLimiter(this.config.getMaxEventsPerMinute());
        this.sessionId = UUID.randomUUID().toString();

        // Determine transport output directory
        String outputDir = this.config.getLocalOutputDir();
        if (outputDir != null && !outputDir.isEmpty()) {
            this.transport = new LocalFileTransport(outputDir);
        } else {
            this.transport = new LocalFileTransport();
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Return the current SDK configuration.
     */
    public Config getConfig() {
        return config;
    }

    /**
     * Capture a {@link Throwable} and send it through the transport pipeline.
     *
     * @param error   the throwable to capture
     * @param context optional context (request, operation, severity)
     * @return the event ID, or {@code null} if the event was dropped
     */
    public String captureError(Throwable error, CaptureContext context) {
        try {
            if (!config.isEnabled()) return null;

            // --- Normalise error ---
            Types.ErrorInfo errorInfo = normaliseError(error);

            if (context != null && context.getComponentStack() != null) {
                errorInfo.setComponentStack(context.getComponentStack());
            }

            // --- Check ignoreErrors ---
            if (shouldIgnore(errorInfo.getMessage())) {
                debugLog("Event ignored by ignoreErrors filter");
                return null;
            }

            // --- Fingerprint ---
            String fingerprint = Fingerprint.generate(
                    errorInfo.getType(),
                    errorInfo.getMessage(),
                    errorInfo.getStack()
            );

            // --- Rate limit ---
            if (!rateLimiter.shouldAllow(fingerprint)) {
                debugLog("Rate-limited: " + fingerprint);
                return null;
            }

            // --- Collect breadcrumbs ---
            List<Types.Breadcrumb> crumbs = breadcrumbs.getAll();

            // --- Detect environment ---
            Types.EnvironmentInfo environment = EnvironmentDetector.detect();

            // Attach deployment environment from config
            if (config.getEnvironment() != null) {
                // Create a copy to avoid mutating the cached instance
                Types.EnvironmentInfo envCopy = new Types.EnvironmentInfo();
                envCopy.setFramework(environment.getFramework());
                envCopy.setFrameworkVersion(environment.getFrameworkVersion());
                envCopy.setRuntime(environment.getRuntime());
                envCopy.setRuntimeVersion(environment.getRuntimeVersion());
                envCopy.setPlatform(environment.getPlatform());
                envCopy.setOs(environment.getOs());
                envCopy.setLocale(environment.getLocale());
                envCopy.setTimezone(environment.getTimezone());
                envCopy.setDeploy(config.getEnvironment());
                environment = envCopy;
            }

            // --- Build event ---
            String eventId = UUID.randomUUID().toString();
            Types.UncaughtEvent event = new Types.UncaughtEvent();
            event.setEventId(eventId);
            event.setTimestamp(Instant.now().toString());
            event.setProjectKey(config.getProjectKey());
            event.setLevel(context != null && context.getLevel() != null
                    ? context.getLevel()
                    : Types.LEVEL_ERROR);
            event.setFingerprint(fingerprint);
            event.setRelease(config.getRelease());
            event.setError(errorInfo);
            event.setBreadcrumbs(crumbs);
            event.setRequest(context != null ? context.getRequest() : null);
            event.setOperation(context != null ? context.getOperation() : null);
            event.setEnvironment(environment);

            // User info
            Types.UserInfo currentUser = this.user;
            if (currentUser != null) {
                Types.UserInfo userCopy = currentUser.copy();
                userCopy.putExtra("sessionId", sessionId);
                event.setUser(userCopy);
            } else {
                Types.UserInfo anon = new Types.UserInfo();
                anon.putExtra("sessionId", sessionId);
                event.setUser(anon);
            }

            event.setFixPrompt(""); // will be set below
            event.setSdk(new Types.SdkInfo(SDK_NAME, SDK_VERSION));

            // --- Sanitise ---
            event = Sanitizer.sanitize(event, config.getSanitizeKeys());

            // --- Build fix prompt ---
            event.setFixPrompt(PromptBuilder.buildFixPrompt(event));

            // --- beforeSend hook ---
            Function<Types.UncaughtEvent, Types.UncaughtEvent> beforeSend = config.getBeforeSend();
            if (beforeSend != null) {
                Types.UncaughtEvent result = beforeSend.apply(event);
                if (result == null) {
                    debugLog("Event dropped by beforeSend");
                    return null;
                }
                event = result;
            }

            // --- Send ---
            transport.send(event);
            debugLog("Captured event: " + eventId + " (" + fingerprint + ")");

            // Track seen fingerprints
            synchronized (seenFingerprints) {
                seenFingerprints.add(fingerprint);
            }

            return eventId;

        } catch (Exception e) {
            debugLog("captureError failed: " + e.getMessage());
            return null;
        }
    }

    /**
     * Capture a {@link Throwable} with default context.
     */
    public String captureError(Throwable error) {
        return captureError(error, null);
    }

    /**
     * Capture a plain message (not backed by a Throwable).
     */
    public String captureMessage(String message, String level) {
        try {
            return captureError(new Exception(message),
                    new CaptureContext().level(level != null ? level : Types.LEVEL_INFO));
        } catch (Exception e) {
            debugLog("captureMessage failed: " + e.getMessage());
            return null;
        }
    }

    public String captureMessage(String message) {
        return captureMessage(message, Types.LEVEL_INFO);
    }

    /**
     * Add a breadcrumb to the ring buffer.
     */
    public void addBreadcrumb(Types.Breadcrumb crumb) {
        try {
            if (!config.isEnabled()) return;
            breadcrumbs.add(crumb);
        } catch (Exception e) {
            debugLog("addBreadcrumb failed: " + e.getMessage());
        }
    }

    /**
     * Convenience method to add a breadcrumb.
     */
    public void addBreadcrumb(String type, String category, String message) {
        addBreadcrumb(new Types.Breadcrumb(type, category, message));
    }

    /**
     * Set user context that will be attached to subsequent events.
     */
    public void setUser(Types.UserInfo user) {
        this.user = user != null ? user.copy() : null;
    }

    /**
     * Clear user context.
     */
    public void clearUser() {
        this.user = null;
    }

    // -----------------------------------------------------------------------
    // Error normalisation
    // -----------------------------------------------------------------------

    private static Types.ErrorInfo normaliseError(Throwable error) {
        Types.ErrorInfo info = new Types.ErrorInfo();

        if (error == null) {
            info.setMessage("Unknown error");
            info.setType("UnknownError");
            return info;
        }

        info.setMessage(error.getMessage() != null ? error.getMessage() : error.toString());
        info.setType(error.getClass().getSimpleName());

        // Convert stack trace to string
        StringWriter sw = new StringWriter();
        error.printStackTrace(new PrintWriter(sw));
        info.setStack(sw.toString());

        return info;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private boolean shouldIgnore(String message) {
        if (message == null) return false;
        List<Pattern> patterns = config.getIgnoreErrors();
        if (patterns == null || patterns.isEmpty()) return false;

        for (Pattern pattern : patterns) {
            if (pattern.matcher(message).find()) return true;
        }

        return false;
    }

    private void debugLog(String msg) {
        if (config.isDebug()) {
            System.err.println("[uncaught] " + msg);
        }
    }

    // -----------------------------------------------------------------------
    // CaptureContext — optional context for captureError
    // -----------------------------------------------------------------------

    /**
     * Optional context to attach to a captured error.
     */
    public static class CaptureContext {
        private Types.RequestInfo request;
        private Types.OperationInfo operation;
        private String componentStack;
        private String level;

        public CaptureContext request(Types.RequestInfo request) {
            this.request = request;
            return this;
        }

        public CaptureContext operation(Types.OperationInfo operation) {
            this.operation = operation;
            return this;
        }

        public CaptureContext componentStack(String componentStack) {
            this.componentStack = componentStack;
            return this;
        }

        public CaptureContext level(String level) {
            this.level = level;
            return this;
        }

        public Types.RequestInfo getRequest() { return request; }
        public Types.OperationInfo getOperation() { return operation; }
        public String getComponentStack() { return componentStack; }
        public String getLevel() { return level; }
    }
}
