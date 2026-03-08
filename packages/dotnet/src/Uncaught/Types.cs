// ---------------------------------------------------------------------------
// Uncaught — shared type definitions for .NET
// ---------------------------------------------------------------------------

using System.Text.Json.Serialization;

namespace Uncaught;

/// <summary>
/// Severity levels mirroring syslog.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SeverityLevel
{
    Fatal,
    Error,
    Warning,
    Info,
    Debug
}

/// <summary>
/// Breadcrumb categories.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BreadcrumbType
{
    Click,
    Navigation,
    ApiCall,
    DbQuery,
    Auth,
    Console,
    WebVital,
    Custom
}

/// <summary>
/// Issue statuses.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum IssueStatus
{
    Open,
    Resolved,
    Ignored
}

/// <summary>
/// Configuration object for the Uncaught SDK.
/// </summary>
public class UncaughtConfig
{
    public string? ProjectKey { get; set; }
    public string? Endpoint { get; set; }
    public string? Environment { get; set; }
    public string? Release { get; set; }
    public bool Debug { get; set; } = false;
    public bool Enabled { get; set; } = true;
    public int MaxBreadcrumbs { get; set; } = 20;
    public int MaxEventsPerMinute { get; set; } = 30;
    public List<string> SanitizeKeys { get; set; } = new();
    public List<string> IgnoreErrors { get; set; } = new();
    public string? LocalOutputDir { get; set; }
    public Func<UncaughtEvent, UncaughtEvent?>? BeforeSend { get; set; }
}

/// <summary>
/// Structured representation of a captured error.
/// </summary>
public class ErrorInfo
{
    [JsonPropertyName("message")]
    public string Message { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "Error";

    [JsonPropertyName("stack")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Stack { get; set; }

    [JsonPropertyName("resolvedStack")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ResolvedStack { get; set; }

    [JsonPropertyName("componentStack")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ComponentStack { get; set; }
}

/// <summary>
/// Contextual HTTP request information.
/// </summary>
public class RequestInfo
{
    [JsonPropertyName("method")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Method { get; set; }

    [JsonPropertyName("url")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Url { get; set; }

    [JsonPropertyName("headers")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, string>? Headers { get; set; }

    [JsonPropertyName("query")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, string>? Query { get; set; }
}

/// <summary>
/// Information about a failed external operation.
/// </summary>
public class OperationInfo
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = "";

    [JsonPropertyName("type")]
    public string OperationType { get; set; } = "";

    [JsonPropertyName("method")]
    public string Method { get; set; } = "";

    [JsonPropertyName("params")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object>? Params { get; set; }

    [JsonPropertyName("errorCode")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ErrorCode { get; set; }

    [JsonPropertyName("errorDetails")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ErrorDetails { get; set; }
}

/// <summary>
/// User context attached to events.
/// </summary>
public class UserInfo
{
    [JsonPropertyName("id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Id { get; set; }

    [JsonPropertyName("email")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Email { get; set; }

    [JsonPropertyName("username")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Username { get; set; }

    [JsonPropertyName("sessionId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SessionId { get; set; }
}

/// <summary>
/// SDK metadata shipped with every event.
/// </summary>
public class SdkInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("version")]
    public string Version { get; set; } = "";
}

/// <summary>
/// A single breadcrumb entry.
/// </summary>
public class Breadcrumb
{
    [JsonPropertyName("type")]
    public BreadcrumbType Type { get; set; }

    [JsonPropertyName("category")]
    public string Category { get; set; } = "";

    [JsonPropertyName("message")]
    public string Message { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";

    [JsonPropertyName("data")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object>? Data { get; set; }

    [JsonPropertyName("level")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public SeverityLevel? Level { get; set; }
}

/// <summary>
/// Detected runtime / platform information.
/// </summary>
public class EnvironmentInfo
{
    [JsonPropertyName("framework")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Framework { get; set; }

    [JsonPropertyName("frameworkVersion")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? FrameworkVersion { get; set; }

    [JsonPropertyName("runtime")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Runtime { get; set; }

    [JsonPropertyName("runtimeVersion")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RuntimeVersion { get; set; }

    [JsonPropertyName("platform")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Platform { get; set; }

    [JsonPropertyName("os")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Os { get; set; }

    [JsonPropertyName("browser")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Browser { get; set; }

    [JsonPropertyName("browserVersion")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? BrowserVersion { get; set; }

    [JsonPropertyName("deviceType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DeviceType { get; set; }

    [JsonPropertyName("locale")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Locale { get; set; }

    [JsonPropertyName("timezone")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Timezone { get; set; }

    [JsonPropertyName("url")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Url { get; set; }

    [JsonPropertyName("deploy")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Deploy { get; set; }
}

/// <summary>
/// The canonical event payload sent to transports.
/// </summary>
public class UncaughtEvent
{
    [JsonPropertyName("eventId")]
    public string EventId { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";

    [JsonPropertyName("projectKey")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ProjectKey { get; set; }

    [JsonPropertyName("level")]
    public SeverityLevel Level { get; set; } = SeverityLevel.Error;

    [JsonPropertyName("fingerprint")]
    public string Fingerprint { get; set; } = "";

    [JsonPropertyName("release")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Release { get; set; }

    [JsonPropertyName("error")]
    public ErrorInfo Error { get; set; } = new();

    [JsonPropertyName("breadcrumbs")]
    public List<Breadcrumb> Breadcrumbs { get; set; } = new();

    [JsonPropertyName("request")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public RequestInfo? Request { get; set; }

    [JsonPropertyName("operation")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public OperationInfo? Operation { get; set; }

    [JsonPropertyName("environment")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public EnvironmentInfo? Environment { get; set; }

    [JsonPropertyName("user")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public UserInfo? User { get; set; }

    [JsonPropertyName("userFeedback")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? UserFeedback { get; set; }

    [JsonPropertyName("fixPrompt")]
    public string FixPrompt { get; set; } = "";

    [JsonPropertyName("sdk")]
    public SdkInfo Sdk { get; set; } = new();
}

/// <summary>
/// Issue entry in the issues.json index.
/// </summary>
public class IssueEntry
{
    [JsonPropertyName("fingerprint")]
    public string Fingerprint { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("errorType")]
    public string ErrorType { get; set; } = "";

    [JsonPropertyName("count")]
    public long Count { get; set; }

    [JsonPropertyName("affectedUsers")]
    public List<string> AffectedUsers { get; set; } = new();

    [JsonPropertyName("firstSeen")]
    public string FirstSeen { get; set; } = "";

    [JsonPropertyName("lastSeen")]
    public string LastSeen { get; set; } = "";

    [JsonPropertyName("status")]
    public IssueStatus Status { get; set; } = IssueStatus.Open;

    [JsonPropertyName("fixPromptFile")]
    public string FixPromptFile { get; set; } = "";

    [JsonPropertyName("latestEventFile")]
    public string LatestEventFile { get; set; } = "";

    [JsonPropertyName("release")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Release { get; set; }

    [JsonPropertyName("environment")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Environment { get; set; }
}

/// <summary>
/// Context for capturing an error with additional metadata.
/// </summary>
public class CaptureContext
{
    public RequestInfo? Request { get; set; }
    public OperationInfo? Operation { get; set; }
    public string? ComponentStack { get; set; }
    public SeverityLevel? Level { get; set; }
}
