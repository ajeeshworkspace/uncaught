// ---------------------------------------------------------------------------
// Uncaught — runtime / platform environment detector
// ---------------------------------------------------------------------------

using System.Runtime.InteropServices;

namespace Uncaught;

/// <summary>
/// Detects the current .NET runtime environment.
/// Result is cached after the first invocation.
/// </summary>
public static class EnvironmentDetector
{
    private static EnvironmentInfo? _cached;
    private static readonly object _lock = new();

    /// <summary>
    /// Detect the current runtime environment. Result is cached.
    /// </summary>
    public static EnvironmentInfo Detect()
    {
        if (_cached != null) return _cached;

        lock (_lock)
        {
            if (_cached != null) return _cached;
            _cached = DetectInner();
            return _cached;
        }
    }

    /// <summary>
    /// Reset the cached environment (useful for testing).
    /// </summary>
    public static void ResetCache()
    {
        lock (_lock)
        {
            _cached = null;
        }
    }

    private static EnvironmentInfo DetectInner()
    {
        var info = new EnvironmentInfo();

        try
        {
            // Runtime
            info.Runtime = "dotnet";
            info.RuntimeVersion = RuntimeInformation.FrameworkDescription;
            info.Platform = RuntimeInformation.OSArchitecture.ToString().ToLower();
            info.Os = DetectOS();

            // Timezone
            try
            {
                info.Timezone = TimeZoneInfo.Local.Id;
            }
            catch
            {
                // Silent
            }

            // Locale
            try
            {
                info.Locale = System.Globalization.CultureInfo.CurrentCulture.Name;
            }
            catch
            {
                // Silent
            }

            // Framework detection
            DetectFramework(info);

            // Hosting platform markers
            if (!string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("VERCEL")))
            {
                info.Platform = "vercel";
            }
            else if (!string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("RAILWAY_PROJECT_ID")))
            {
                info.Platform = "railway";
            }
            else if (!string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("FLY_APP_NAME")))
            {
                info.Platform = "fly";
            }
            else if (!string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("AWS_LAMBDA_FUNCTION_NAME")))
            {
                info.Platform = "aws-lambda";
            }
            else if (!string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("GOOGLE_CLOUD_PROJECT")))
            {
                info.Platform = "gcp";
            }
            else if (!string.IsNullOrEmpty(System.Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME")))
            {
                info.Platform = "azure";
            }
        }
        catch
        {
            // Silent — environment detection must never throw.
        }

        return info;
    }

    private static string DetectOS()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX)) return "macOS";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return "Windows";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux)) return "Linux";
        return RuntimeInformation.OSDescription;
    }

    private static void DetectFramework(EnvironmentInfo info)
    {
        try
        {
            // Check for ASP.NET Core
            var aspnetAssembly = AppDomain.CurrentDomain
                .GetAssemblies()
                .FirstOrDefault(a => a.GetName().Name == "Microsoft.AspNetCore");

            if (aspnetAssembly != null)
            {
                info.Framework = "aspnet-core";
                info.FrameworkVersion = aspnetAssembly.GetName().Version?.ToString();
                return;
            }

            // Check for Blazor
            var blazorAssembly = AppDomain.CurrentDomain
                .GetAssemblies()
                .FirstOrDefault(a => a.GetName().Name == "Microsoft.AspNetCore.Components");

            if (blazorAssembly != null)
            {
                info.Framework = "blazor";
                info.FrameworkVersion = blazorAssembly.GetName().Version?.ToString();
                return;
            }

            // Check for MAUI
            var mauiAssembly = AppDomain.CurrentDomain
                .GetAssemblies()
                .FirstOrDefault(a => a.GetName().Name == "Microsoft.Maui");

            if (mauiAssembly != null)
            {
                info.Framework = "maui";
                info.FrameworkVersion = mauiAssembly.GetName().Version?.ToString();
                return;
            }
        }
        catch
        {
            // Silent
        }
    }
}
