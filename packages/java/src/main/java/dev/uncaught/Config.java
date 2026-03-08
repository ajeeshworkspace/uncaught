// ---------------------------------------------------------------------------
// dev.uncaught — configuration (builder pattern)
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Configuration for the Uncaught Java SDK.
 * <p>
 * Use the fluent builder methods for a concise setup:
 * <pre>{@code
 * Config config = new Config()
 *     .projectKey("my-project")
 *     .environment("production")
 *     .release("1.2.3")
 *     .debug(true);
 * }</pre>
 */
public class Config {

    private String projectKey;
    private String endpoint;
    private String environment;
    private String release;
    private boolean debug = false;
    private boolean enabled = true;
    private int maxBreadcrumbs = 20;
    private int maxEventsPerMinute = 30;
    private List<String> sanitizeKeys = new ArrayList<>();
    private List<Pattern> ignoreErrors = new ArrayList<>();
    private String localOutputDir;
    private String webhookUrl;
    private Function<Types.UncaughtEvent, Types.UncaughtEvent> beforeSend;

    // -----------------------------------------------------------------------
    // Builder-style setters (return this for chaining)
    // -----------------------------------------------------------------------

    public Config projectKey(String projectKey) {
        this.projectKey = projectKey;
        return this;
    }

    public Config endpoint(String endpoint) {
        this.endpoint = endpoint;
        return this;
    }

    public Config environment(String environment) {
        this.environment = environment;
        return this;
    }

    public Config release(String release) {
        this.release = release;
        return this;
    }

    public Config debug(boolean debug) {
        this.debug = debug;
        return this;
    }

    public Config enabled(boolean enabled) {
        this.enabled = enabled;
        return this;
    }

    public Config maxBreadcrumbs(int maxBreadcrumbs) {
        this.maxBreadcrumbs = maxBreadcrumbs;
        return this;
    }

    public Config maxEventsPerMinute(int maxEventsPerMinute) {
        this.maxEventsPerMinute = maxEventsPerMinute;
        return this;
    }

    public Config sanitizeKeys(List<String> sanitizeKeys) {
        this.sanitizeKeys = sanitizeKeys != null ? new ArrayList<>(sanitizeKeys) : new ArrayList<>();
        return this;
    }

    public Config addSanitizeKey(String key) {
        this.sanitizeKeys.add(key);
        return this;
    }

    public Config ignoreErrors(List<Pattern> ignoreErrors) {
        this.ignoreErrors = ignoreErrors != null ? new ArrayList<>(ignoreErrors) : new ArrayList<>();
        return this;
    }

    public Config addIgnoreError(String substring) {
        this.ignoreErrors.add(Pattern.compile(Pattern.quote(substring)));
        return this;
    }

    public Config addIgnoreError(Pattern pattern) {
        this.ignoreErrors.add(pattern);
        return this;
    }

    public Config localOutputDir(String localOutputDir) {
        this.localOutputDir = localOutputDir;
        return this;
    }

    public Config webhookUrl(String webhookUrl) {
        this.webhookUrl = webhookUrl;
        return this;
    }

    /**
     * Lifecycle hook invoked just before an event is sent.
     * Return {@code null} from the function to discard the event.
     */
    public Config beforeSend(Function<Types.UncaughtEvent, Types.UncaughtEvent> beforeSend) {
        this.beforeSend = beforeSend;
        return this;
    }

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    public String getProjectKey() { return projectKey; }
    public String getEndpoint() { return endpoint; }
    public String getEnvironment() { return environment; }
    public String getRelease() { return release; }
    public boolean isDebug() { return debug; }
    public boolean isEnabled() { return enabled; }
    public int getMaxBreadcrumbs() { return maxBreadcrumbs; }
    public int getMaxEventsPerMinute() { return maxEventsPerMinute; }
    public List<String> getSanitizeKeys() { return Collections.unmodifiableList(sanitizeKeys); }
    public List<Pattern> getIgnoreErrors() { return Collections.unmodifiableList(ignoreErrors); }
    public String getLocalOutputDir() { return localOutputDir; }
    public String getWebhookUrl() { return webhookUrl; }
    public Function<Types.UncaughtEvent, Types.UncaughtEvent> getBeforeSend() { return beforeSend; }
}
