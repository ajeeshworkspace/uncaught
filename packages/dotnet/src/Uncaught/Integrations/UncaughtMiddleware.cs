// ---------------------------------------------------------------------------
// Uncaught — ASP.NET Core middleware
// ---------------------------------------------------------------------------

using Microsoft.AspNetCore.Http;

namespace Uncaught.Integrations;

/// <summary>
/// ASP.NET Core middleware that:
///   1. Adds a navigation breadcrumb for each request.
///   2. Captures unhandled exceptions with HTTP request context.
///
/// Usage in Program.cs / Startup.cs:
///   app.UseUncaught();
/// </summary>
public class UncaughtMiddleware
{
    private readonly RequestDelegate _next;

    public UncaughtMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var client = UncaughtClient.GetClient();
        if (client == null)
        {
            await _next(context);
            return;
        }

        // Add navigation breadcrumb
        var path = context.Request.Path.Value ?? "/";
        var method = context.Request.Method;
        client.AddBreadcrumb(
            BreadcrumbType.Navigation,
            "http",
            $"{method} {path}",
            new Dictionary<string, object>
            {
                ["method"] = method,
                ["url"] = GetRequestUrl(context.Request),
                ["remoteIp"] = context.Connection.RemoteIpAddress?.ToString() ?? "unknown"
            });

        try
        {
            await _next(context);

            // Capture 5xx errors as warnings
            if (context.Response.StatusCode >= 500)
            {
                client.AddBreadcrumb(
                    BreadcrumbType.ApiCall,
                    "http.response",
                    $"HTTP {context.Response.StatusCode}",
                    new Dictionary<string, object>
                    {
                        ["status"] = context.Response.StatusCode
                    });
            }
        }
        catch (Exception ex)
        {
            // Build request context
            var requestInfo = new RequestInfo
            {
                Method = method,
                Url = GetRequestUrl(context.Request),
                Headers = SanitizeHeaders(context.Request.Headers),
                Query = context.Request.Query
                    .ToDictionary(q => q.Key, q => q.Value.ToString())
            };

            // Capture with request context
            client.CaptureException(ex, new CaptureContext
            {
                Request = requestInfo
            });

            throw;
        }
    }

    private static string GetRequestUrl(HttpRequest request)
    {
        return $"{request.Scheme}://{request.Host}{request.Path}{request.QueryString}";
    }

    private static readonly HashSet<string> SafeHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Host", "User-Agent", "Accept", "Accept-Language",
        "Accept-Encoding", "Content-Type", "Content-Length",
        "Referer", "Origin", "X-Requested-With"
    };

    private static Dictionary<string, string> SanitizeHeaders(IHeaderDictionary headers)
    {
        var result = new Dictionary<string, string>();
        foreach (var header in headers)
        {
            if (SafeHeaders.Contains(header.Key))
            {
                result[header.Key] = header.Value.ToString();
            }
        }
        return result;
    }
}
