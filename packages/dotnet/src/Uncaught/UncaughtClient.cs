// ---------------------------------------------------------------------------
// Uncaught — UncaughtClient (SDK entry-point for .NET)
// ---------------------------------------------------------------------------

using System.Text.Json;

namespace Uncaught;

/// <summary>
/// Main client for the Uncaught error monitoring SDK.
/// Thread-safe singleton pattern.
/// </summary>
public sealed class UncaughtClient
{
    private const string SdkName = "uncaught-dotnet";
    private const string SdkVersion = "0.1.0";

    private static UncaughtClient? _instance;
    private static readonly object _lock = new();

    private readonly UncaughtConfig _config;
    private readonly BreadcrumbStore _breadcrumbs;
    private readonly LocalFileTransport _transport;
    private readonly RateLimiter _rateLimiter;
    private readonly string _sessionId;
    private readonly HashSet<string> _seenFingerprints = new();
    private UserInfo? _user;

    /// <summary>
    /// Initialise the Uncaught SDK. Calling this more than once replaces
    /// the previous client instance.
    /// </summary>
    public static UncaughtClient Init(UncaughtConfig? config = null)
    {
        lock (_lock)
        {
            _instance = new UncaughtClient(config ?? new UncaughtConfig());
            return _instance;
        }
    }

    /// <summary>
    /// Return the current singleton client, or null if Init() has not been called.
    /// </summary>
    public static UncaughtClient? GetClient()
    {
        lock (_lock)
        {
            return _instance;
        }
    }

    private UncaughtClient(UncaughtConfig config)
    {
        _config = config;
        _breadcrumbs = new BreadcrumbStore(config.MaxBreadcrumbs);
        _transport = new LocalFileTransport(config);
        _rateLimiter = new RateLimiter(config.MaxEventsPerMinute, 5);
        _sessionId = Guid.NewGuid().ToString();
    }

    /// <summary>
    /// Return the current SDK configuration.
    /// </summary>
    public UncaughtConfig GetConfig() => _config;

    /// <summary>
    /// Capture an exception and send it through the transport pipeline.
    /// Returns the event ID, or null if the event was dropped.
    /// </summary>
    public string? CaptureException(Exception exception, CaptureContext? context = null)
    {
        try
        {
            if (!_config.Enabled) return null;

            var ctx = context ?? new CaptureContext();

            // Normalise error
            var errorInfo = NormaliseException(exception);

            // Check ignoreErrors
            if (ShouldIgnore(errorInfo.Message))
            {
                DebugLog("Event ignored by ignoreErrors filter");
                return null;
            }

            // Generate fingerprint
            var fingerprint = Fingerprint.Generate(
                errorInfo.Type, errorInfo.Message, errorInfo.Stack);

            // Rate limit
            if (!_rateLimiter.ShouldAllow(fingerprint))
            {
                DebugLog($"Rate-limited: {fingerprint}");
                return null;
            }

            // Collect breadcrumbs
            var crumbs = _breadcrumbs.GetAll();

            // Detect environment
            var environment = EnvironmentDetector.Detect();
            if (_config.Environment != null)
            {
                environment.Deploy = _config.Environment;
            }

            // Build user info
            var user = _user != null
                ? new UserInfo
                {
                    Id = _user.Id,
                    Email = _user.Email,
                    Username = _user.Username,
                    SessionId = _sessionId
                }
                : new UserInfo { SessionId = _sessionId };

            // Build event
            var eventId = Guid.NewGuid().ToString();
            var uncaughtEvent = new UncaughtEvent
            {
                EventId = eventId,
                Timestamp = DateTime.UtcNow.ToString("o"),
                ProjectKey = _config.ProjectKey,
                Level = ctx.Level ?? SeverityLevel.Error,
                Fingerprint = fingerprint,
                Release = _config.Release,
                Error = errorInfo,
                Breadcrumbs = crumbs,
                Request = ctx.Request,
                Operation = ctx.Operation,
                Environment = environment,
                User = user,
                FixPrompt = "",
                Sdk = new SdkInfo { Name = SdkName, Version = SdkVersion }
            };

            // Sanitize
            uncaughtEvent = Sanitizer.Sanitize(uncaughtEvent, _config.SanitizeKeys);

            // Build fix prompt
            uncaughtEvent.FixPrompt = PromptBuilder.Build(uncaughtEvent);

            // beforeSend hook
            if (_config.BeforeSend != null)
            {
                var result = _config.BeforeSend(uncaughtEvent);
                if (result == null)
                {
                    DebugLog("Event dropped by beforeSend");
                    return null;
                }
                uncaughtEvent = result;
            }

            // Send
            _transport.Send(uncaughtEvent);
            DebugLog($"Captured event: {eventId} ({fingerprint})");

            // Track seen fingerprints
            lock (_seenFingerprints)
            {
                _seenFingerprints.Add(fingerprint);
            }

            return eventId;
        }
        catch (Exception ex)
        {
            DebugLog($"CaptureException failed: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Capture a plain message.
    /// </summary>
    public string? CaptureMessage(string message, SeverityLevel level = SeverityLevel.Info)
    {
        try
        {
            return CaptureException(
                new Exception(message),
                new CaptureContext { Level = level });
        }
        catch (Exception ex)
        {
            DebugLog($"CaptureMessage failed: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Add a breadcrumb to the ring buffer.
    /// </summary>
    public void AddBreadcrumb(
        BreadcrumbType type,
        string category,
        string message,
        Dictionary<string, object>? data = null,
        SeverityLevel? level = null)
    {
        if (!_config.Enabled) return;

        _breadcrumbs.Add(new Breadcrumb
        {
            Type = type,
            Category = category,
            Message = message,
            Timestamp = DateTime.UtcNow.ToString("o"),
            Data = data,
            Level = level
        });
    }

    /// <summary>
    /// Set user context.
    /// </summary>
    public void SetUser(UserInfo? user) => _user = user;

    /// <summary>
    /// Flush all queued events.
    /// </summary>
    public void Flush() => _transport.Flush();

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static ErrorInfo NormaliseException(Exception ex)
    {
        return new ErrorInfo
        {
            Message = ex.Message ?? ex.ToString(),
            Type = ex.GetType().Name,
            Stack = ex.StackTrace
        };
    }

    private bool ShouldIgnore(string message)
    {
        foreach (var pattern in _config.IgnoreErrors)
        {
            if (message.Contains(pattern, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    private void DebugLog(string msg)
    {
        if (_config.Debug)
        {
            Console.Error.WriteLine($"[uncaught] {msg}");
        }
    }
}
