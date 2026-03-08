// ---------------------------------------------------------------------------
// Uncaught — fix-prompt builder
// ---------------------------------------------------------------------------

using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Uncaught;

/// <summary>
/// Builds structured Markdown prompts for AI assistants to diagnose and fix errors.
/// </summary>
public static class PromptBuilder
{
    /// <summary>
    /// Build a structured Markdown prompt for the given event.
    /// </summary>
    public static string Build(UncaughtEvent ev)
    {
        var sections = new List<string>();

        // Intro
        sections.Add(
            "I have a production bug in my application that I need help diagnosing and fixing.\n");

        // Error section
        if (ev.Error != null)
        {
            var location = ExtractLocation(ev.Error.Stack);
            var lines = new List<string> { "## Error", "" };
            lines.Add($"- **Type:** {ev.Error.Type ?? "Error"}");
            lines.Add($"- **Message:** {ev.Error.Message ?? "(no message)"}");
            if (location != null)
            {
                lines.Add($"- **Location:** {location}");
            }
            sections.Add(string.Join("\n", lines));
        }

        // Stack Trace
        var stackSource = ev.Error?.ResolvedStack ?? ev.Error?.Stack;
        if (!string.IsNullOrEmpty(stackSource))
        {
            var frames = stackSource.Split('\n')
                .Take(15)
                .Select(l => l.TrimEnd());
            var label = ev.Error?.ResolvedStack != null
                ? "Stack Trace (source-mapped)"
                : "Stack Trace";
            sections.Add($"## {label}\n\n```\n{string.Join("\n", frames)}\n```");
        }

        // Failed Operation
        if (ev.Operation != null)
        {
            sections.Add(FormatOperation(ev.Operation));
        }

        // HTTP Request Context
        if (ev.Request != null)
        {
            sections.Add(FormatRequest(ev.Request));
        }

        // User Session (last 5 breadcrumbs)
        if (ev.Breadcrumbs?.Count > 0)
        {
            sections.Add(FormatBreadcrumbs(ev.Breadcrumbs));
        }

        // Environment
        if (ev.Environment != null)
        {
            sections.Add(FormatEnvironment(ev.Environment));
        }

        // What I need
        sections.Add(string.Join("\n", new[]
        {
            "## What I need",
            "",
            "1. **Root cause analysis** — explain why this error is occurring.",
            "2. **A fix** — provide the corrected code with an explanation of the changes.",
            "3. **Prevention** — suggest any guards or tests to prevent this from happening again."
        }));

        return string.Join("\n\n", sections) + "\n";
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static readonly Regex ReDotnetLocation = new(
        @"^\s*at\s+.+?\s+in\s+(.+?:line\s+\d+)",
        RegexOptions.Compiled);

    private static readonly Regex ReV8Location = new(
        @"at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?",
        RegexOptions.Compiled);

    private static string? ExtractLocation(string? stack)
    {
        if (string.IsNullOrEmpty(stack)) return null;

        foreach (var line in stack.Split('\n'))
        {
            var trimmed = line.Trim();

            var dotnetMatch = ReDotnetLocation.Match(trimmed);
            if (dotnetMatch.Success)
            {
                return dotnetMatch.Groups[1].Value;
            }

            var v8Match = ReV8Location.Match(trimmed);
            if (v8Match.Success)
            {
                return v8Match.Groups[1].Value;
            }
        }

        return null;
    }

    private static string FormatOperation(OperationInfo op)
    {
        var lines = new List<string> { "## Failed Operation", "" };
        lines.Add($"- **Provider:** {op.Provider}");
        lines.Add($"- **Type:** {op.OperationType}");
        lines.Add($"- **Method:** {op.Method}");
        if (op.Params != null)
        {
            lines.Add("- **Params:**");
            lines.Add("```json");
            lines.Add(JsonSerializer.Serialize(op.Params, new JsonSerializerOptions { WriteIndented = true }));
            lines.Add("```");
        }
        if (op.ErrorCode != null)
        {
            lines.Add($"- **Error Code:** {op.ErrorCode}");
        }
        if (op.ErrorDetails != null)
        {
            lines.Add($"- **Error Details:** {op.ErrorDetails}");
        }
        return string.Join("\n", lines);
    }

    private static string FormatRequest(RequestInfo req)
    {
        var lines = new List<string> { "## HTTP Request Context", "" };
        if (req.Method != null) lines.Add($"- **Method:** {req.Method}");
        if (req.Url != null) lines.Add($"- **URL:** {req.Url}");
        return string.Join("\n", lines);
    }

    private static string FormatBreadcrumbs(List<Breadcrumb> crumbs)
    {
        var recent = crumbs.TakeLast(5);
        var lines = new List<string> { "## User Session", "" };

        foreach (var crumb in recent)
        {
            var time = FormatTime(crumb.Timestamp);
            lines.Add($"- `{time}` **[{crumb.Type.ToString().ToLower()}]** {crumb.Message}");
        }

        return string.Join("\n", lines);
    }

    private static string FormatTime(string iso)
    {
        try
        {
            var dt = DateTimeOffset.Parse(iso);
            return dt.ToString("HH:mm:ss");
        }
        catch
        {
            return iso;
        }
    }

    private static string FormatEnvironment(EnvironmentInfo env)
    {
        var lines = new List<string> { "## Environment", "" };

        var entries = new (string Label, string? Value)[]
        {
            ("Deploy Environment", env.Deploy),
            ("Framework", env.Framework),
            ("Framework Version", env.FrameworkVersion),
            ("Runtime", env.Runtime),
            ("Runtime Version", env.RuntimeVersion),
            ("Platform", env.Platform),
            ("Browser", env.Browser != null
                ? $"{env.Browser} {env.BrowserVersion ?? ""}".Trim()
                : null),
            ("OS", env.Os),
            ("Device", env.DeviceType),
            ("Locale", env.Locale),
            ("Timezone", env.Timezone),
            ("URL", env.Url),
        };

        foreach (var (label, value) in entries)
        {
            if (!string.IsNullOrEmpty(value))
            {
                lines.Add($"- **{label}:** {value}");
            }
        }

        return string.Join("\n", lines);
    }
}
