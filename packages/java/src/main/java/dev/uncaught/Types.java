// ---------------------------------------------------------------------------
// dev.uncaught — shared type definitions (Java 11 compatible)
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * All data-model classes used by the Uncaught Java SDK.
 * <p>
 * These mirror the TypeScript types in {@code @uncaughtdev/core} so that the
 * JSON written to {@code .uncaught/} is identical across SDKs.
 * <p>
 * Designed for Java 11 compatibility (no records).
 */
public final class Types {

    private Types() { /* utility class */ }

    // -----------------------------------------------------------------------
    // Severity level
    // -----------------------------------------------------------------------

    public static final String LEVEL_FATAL   = "fatal";
    public static final String LEVEL_ERROR   = "error";
    public static final String LEVEL_WARNING = "warning";
    public static final String LEVEL_INFO    = "info";
    public static final String LEVEL_DEBUG   = "debug";

    // -----------------------------------------------------------------------
    // Breadcrumb types
    // -----------------------------------------------------------------------

    public static final String BREADCRUMB_CLICK      = "click";
    public static final String BREADCRUMB_NAVIGATION = "navigation";
    public static final String BREADCRUMB_API_CALL   = "api_call";
    public static final String BREADCRUMB_DB_QUERY   = "db_query";
    public static final String BREADCRUMB_AUTH       = "auth";
    public static final String BREADCRUMB_CONSOLE    = "console";
    public static final String BREADCRUMB_WEB_VITAL  = "web_vital";
    public static final String BREADCRUMB_CUSTOM     = "custom";

    // -----------------------------------------------------------------------
    // Issue status
    // -----------------------------------------------------------------------

    public static final String STATUS_OPEN     = "open";
    public static final String STATUS_RESOLVED = "resolved";
    public static final String STATUS_IGNORED  = "ignored";

    // -----------------------------------------------------------------------
    // ErrorInfo
    // -----------------------------------------------------------------------

    public static class ErrorInfo {
        private String message;
        private String type;
        private String stack;
        private String resolvedStack;
        private String componentStack;

        public ErrorInfo() {}

        public ErrorInfo(String message, String type, String stack) {
            this.message = message;
            this.type = type;
            this.stack = stack;
        }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getStack() { return stack; }
        public void setStack(String stack) { this.stack = stack; }

        public String getResolvedStack() { return resolvedStack; }
        public void setResolvedStack(String resolvedStack) { this.resolvedStack = resolvedStack; }

        public String getComponentStack() { return componentStack; }
        public void setComponentStack(String componentStack) { this.componentStack = componentStack; }
    }

    // -----------------------------------------------------------------------
    // Breadcrumb
    // -----------------------------------------------------------------------

    public static class Breadcrumb {
        private String type;
        private String category;
        private String message;
        private String timestamp;
        private Map<String, Object> data;
        private String level;

        public Breadcrumb() {}

        public Breadcrumb(String type, String category, String message) {
            this.type = type;
            this.category = category;
            this.message = message;
        }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }

        public String getTimestamp() { return timestamp; }
        public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

        public Map<String, Object> getData() { return data; }
        public void setData(Map<String, Object> data) { this.data = data; }

        public String getLevel() { return level; }
        public void setLevel(String level) { this.level = level; }

        /** Shallow copy for thread-safe retrieval from the ring buffer. */
        public Breadcrumb copy() {
            Breadcrumb b = new Breadcrumb();
            b.type = this.type;
            b.category = this.category;
            b.message = this.message;
            b.timestamp = this.timestamp;
            b.data = this.data != null ? new HashMap<>(this.data) : null;
            b.level = this.level;
            return b;
        }
    }

    // -----------------------------------------------------------------------
    // RequestInfo
    // -----------------------------------------------------------------------

    public static class RequestInfo {
        private String method;
        private String url;
        private Map<String, String> headers;
        private Object body;
        private Map<String, String> query;

        public RequestInfo() {}

        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public Map<String, String> getHeaders() { return headers; }
        public void setHeaders(Map<String, String> headers) { this.headers = headers; }

        public Object getBody() { return body; }
        public void setBody(Object body) { this.body = body; }

        public Map<String, String> getQuery() { return query; }
        public void setQuery(Map<String, String> query) { this.query = query; }
    }

    // -----------------------------------------------------------------------
    // OperationInfo
    // -----------------------------------------------------------------------

    public static class OperationInfo {
        private String provider;
        private String type;
        private String method;
        private Map<String, Object> params;
        private String errorCode;
        private String errorDetails;

        public OperationInfo() {}

        public String getProvider() { return provider; }
        public void setProvider(String provider) { this.provider = provider; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }

        public Map<String, Object> getParams() { return params; }
        public void setParams(Map<String, Object> params) { this.params = params; }

        public String getErrorCode() { return errorCode; }
        public void setErrorCode(String errorCode) { this.errorCode = errorCode; }

        public String getErrorDetails() { return errorDetails; }
        public void setErrorDetails(String errorDetails) { this.errorDetails = errorDetails; }
    }

    // -----------------------------------------------------------------------
    // EnvironmentInfo
    // -----------------------------------------------------------------------

    public static class EnvironmentInfo {
        private String framework;
        private String frameworkVersion;
        private String runtime;
        private String runtimeVersion;
        private String platform;
        private String os;
        private String browser;
        private String browserVersion;
        private String deviceType;
        private String locale;
        private String timezone;
        private String url;
        private String deploy;

        public EnvironmentInfo() {}

        public String getFramework() { return framework; }
        public void setFramework(String framework) { this.framework = framework; }

        public String getFrameworkVersion() { return frameworkVersion; }
        public void setFrameworkVersion(String frameworkVersion) { this.frameworkVersion = frameworkVersion; }

        public String getRuntime() { return runtime; }
        public void setRuntime(String runtime) { this.runtime = runtime; }

        public String getRuntimeVersion() { return runtimeVersion; }
        public void setRuntimeVersion(String runtimeVersion) { this.runtimeVersion = runtimeVersion; }

        public String getPlatform() { return platform; }
        public void setPlatform(String platform) { this.platform = platform; }

        public String getOs() { return os; }
        public void setOs(String os) { this.os = os; }

        public String getBrowser() { return browser; }
        public void setBrowser(String browser) { this.browser = browser; }

        public String getBrowserVersion() { return browserVersion; }
        public void setBrowserVersion(String browserVersion) { this.browserVersion = browserVersion; }

        public String getDeviceType() { return deviceType; }
        public void setDeviceType(String deviceType) { this.deviceType = deviceType; }

        public String getLocale() { return locale; }
        public void setLocale(String locale) { this.locale = locale; }

        public String getTimezone() { return timezone; }
        public void setTimezone(String timezone) { this.timezone = timezone; }

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public String getDeploy() { return deploy; }
        public void setDeploy(String deploy) { this.deploy = deploy; }
    }

    // -----------------------------------------------------------------------
    // UserInfo
    // -----------------------------------------------------------------------

    public static class UserInfo {
        private String id;
        private String email;
        private String username;
        private final Map<String, Object> extra = new HashMap<>();

        public UserInfo() {}

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public Map<String, Object> getExtra() { return extra; }
        public void putExtra(String key, Object value) { extra.put(key, value); }

        /** Copy for immutability. */
        public UserInfo copy() {
            UserInfo u = new UserInfo();
            u.id = this.id;
            u.email = this.email;
            u.username = this.username;
            u.extra.putAll(this.extra);
            return u;
        }
    }

    // -----------------------------------------------------------------------
    // SdkInfo
    // -----------------------------------------------------------------------

    public static class SdkInfo {
        private final String name;
        private final String version;

        public SdkInfo(String name, String version) {
            this.name = name;
            this.version = version;
        }

        public String getName() { return name; }
        public String getVersion() { return version; }
    }

    // -----------------------------------------------------------------------
    // UncaughtEvent — the canonical event payload
    // -----------------------------------------------------------------------

    public static class UncaughtEvent {
        private String eventId;
        private String timestamp;
        private String projectKey;
        private String level;
        private String fingerprint;
        private String release;
        private ErrorInfo error;
        private List<Breadcrumb> breadcrumbs;
        private RequestInfo request;
        private OperationInfo operation;
        private EnvironmentInfo environment;
        private UserInfo user;
        private String userFeedback;
        private String fixPrompt;
        private SdkInfo sdk;

        public UncaughtEvent() {}

        public String getEventId() { return eventId; }
        public void setEventId(String eventId) { this.eventId = eventId; }

        public String getTimestamp() { return timestamp; }
        public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

        public String getProjectKey() { return projectKey; }
        public void setProjectKey(String projectKey) { this.projectKey = projectKey; }

        public String getLevel() { return level; }
        public void setLevel(String level) { this.level = level; }

        public String getFingerprint() { return fingerprint; }
        public void setFingerprint(String fingerprint) { this.fingerprint = fingerprint; }

        public String getRelease() { return release; }
        public void setRelease(String release) { this.release = release; }

        public ErrorInfo getError() { return error; }
        public void setError(ErrorInfo error) { this.error = error; }

        public List<Breadcrumb> getBreadcrumbs() { return breadcrumbs; }
        public void setBreadcrumbs(List<Breadcrumb> breadcrumbs) { this.breadcrumbs = breadcrumbs; }

        public RequestInfo getRequest() { return request; }
        public void setRequest(RequestInfo request) { this.request = request; }

        public OperationInfo getOperation() { return operation; }
        public void setOperation(OperationInfo operation) { this.operation = operation; }

        public EnvironmentInfo getEnvironment() { return environment; }
        public void setEnvironment(EnvironmentInfo environment) { this.environment = environment; }

        public UserInfo getUser() { return user; }
        public void setUser(UserInfo user) { this.user = user; }

        public String getUserFeedback() { return userFeedback; }
        public void setUserFeedback(String userFeedback) { this.userFeedback = userFeedback; }

        public String getFixPrompt() { return fixPrompt; }
        public void setFixPrompt(String fixPrompt) { this.fixPrompt = fixPrompt; }

        public SdkInfo getSdk() { return sdk; }
        public void setSdk(SdkInfo sdk) { this.sdk = sdk; }
    }

    // -----------------------------------------------------------------------
    // IssueEntry — issues.json index entry
    // -----------------------------------------------------------------------

    public static class IssueEntry {
        private String fingerprint;
        private String title;
        private String errorType;
        private int count;
        private List<String> affectedUsers;
        private String firstSeen;
        private String lastSeen;
        private String status;
        private String fixPromptFile;
        private String latestEventFile;
        private String release;
        private String environment;

        public IssueEntry() {
            this.affectedUsers = new ArrayList<>();
        }

        public String getFingerprint() { return fingerprint; }
        public void setFingerprint(String fingerprint) { this.fingerprint = fingerprint; }

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }

        public String getErrorType() { return errorType; }
        public void setErrorType(String errorType) { this.errorType = errorType; }

        public int getCount() { return count; }
        public void setCount(int count) { this.count = count; }

        public List<String> getAffectedUsers() { return affectedUsers; }
        public void setAffectedUsers(List<String> affectedUsers) { this.affectedUsers = affectedUsers; }

        public String getFirstSeen() { return firstSeen; }
        public void setFirstSeen(String firstSeen) { this.firstSeen = firstSeen; }

        public String getLastSeen() { return lastSeen; }
        public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public String getFixPromptFile() { return fixPromptFile; }
        public void setFixPromptFile(String fixPromptFile) { this.fixPromptFile = fixPromptFile; }

        public String getLatestEventFile() { return latestEventFile; }
        public void setLatestEventFile(String latestEventFile) { this.latestEventFile = latestEventFile; }

        public String getRelease() { return release; }
        public void setRelease(String release) { this.release = release; }

        public String getEnvironment() { return environment; }
        public void setEnvironment(String environment) { this.environment = environment; }
    }
}
