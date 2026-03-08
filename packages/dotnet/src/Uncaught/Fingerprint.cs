// ---------------------------------------------------------------------------
// Uncaught — error fingerprinting (DJB2)
// ---------------------------------------------------------------------------

using System.Text.RegularExpressions;

namespace Uncaught;

/// <summary>
/// Generates stable fingerprints for error grouping using DJB2 hashing.
/// </summary>
public static class Fingerprint
{
    /// <summary>
    /// Generate a stable fingerprint for an error.
    /// </summary>
    public static string Generate(string errorType, string message, string? stack)
    {
        var normalisedMessage = NormaliseMessage(message ?? "");
        var frames = ExtractTopFrames(stack ?? "", 3);

        var parts = new List<string> { errorType ?? "Error", normalisedMessage };
        parts.AddRange(frames);
        var input = string.Join("\n", parts);

        return Djb2(input);
    }

    /// <summary>
    /// DJB2 hash -> 8-character lowercase hex string.
    /// Uses unchecked signed 32-bit arithmetic to produce identical results
    /// to the TypeScript reference implementation.
    /// </summary>
    public static string Djb2(string s)
    {
        int hash = 5381;
        foreach (char c in s)
        {
            hash = unchecked(((hash << 5) + hash) + (int)c);
        }
        return ((uint)hash).ToString("x8");
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static readonly Regex ReUuid = new(
        @"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex ReHex = new(
        @"\b[0-9a-f]{8,}\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex ReNum = new(
        @"\b\d{4,}\b",
        RegexOptions.Compiled);

    private static readonly Regex ReTimestamp = new(
        @"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?",
        RegexOptions.Compiled);

    private static readonly Regex ReHashedFile = new(
        @"([/\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\.(js|ts|mjs|cjs|jsx|tsx)",
        RegexOptions.Compiled);

    /// <summary>
    /// Strip volatile substrings from an error message.
    /// </summary>
    private static string NormaliseMessage(string msg)
    {
        var result = ReUuid.Replace(msg, "<UUID>");
        result = ReHex.Replace(result, "<HEX>");
        result = ReNum.Replace(result, "<NUM>");
        result = ReTimestamp.Replace(result, "<TIMESTAMP>");
        result = ReHashedFile.Replace(result, "$1<FILE>.$3");
        return result.Trim();
    }

    private static readonly Regex ReDotnetFrame = new(
        @"^\s*at\s+(.+?)(?:\s+in\s+(.+?):line\s+(\d+))?$",
        RegexOptions.Compiled);

    private static readonly Regex ReV8Frame = new(
        @"at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?",
        RegexOptions.Compiled);

    /// <summary>
    /// Extract the top N stack frames as normalised "file:function" strings.
    /// </summary>
    private static List<string> ExtractTopFrames(string stack, int count)
    {
        if (string.IsNullOrEmpty(stack)) return new List<string>();

        var frames = new List<string>();
        var lines = stack.Split('\n');

        foreach (var line in lines)
        {
            if (frames.Count >= count) break;

            var trimmed = line.Trim();

            // .NET format: "   at Namespace.Class.Method(params) in /path/file.cs:line 42"
            var dotnetMatch = ReDotnetFrame.Match(trimmed);
            if (dotnetMatch.Success)
            {
                var func = dotnetMatch.Groups[1].Value;
                var file = dotnetMatch.Groups[2].Success
                    ? NormalisePath(dotnetMatch.Groups[2].Value)
                    : "<unknown>";
                // Strip params from function
                var parenIdx = func.IndexOf('(');
                if (parenIdx > 0) func = func[..parenIdx];
                frames.Add($"{file}:{func}");
                continue;
            }

            // V8 format
            var v8Match = ReV8Frame.Match(trimmed);
            if (v8Match.Success)
            {
                var func = v8Match.Groups[1].Success ? v8Match.Groups[1].Value : "<anonymous>";
                var file = v8Match.Groups[2].Success
                    ? NormalisePath(v8Match.Groups[2].Value)
                    : "<unknown>";
                frames.Add($"{file}:{func}");
                continue;
            }
        }

        return frames;
    }

    private static readonly Regex ReQuery = new(@"[?#].*$", RegexOptions.Compiled);
    private static readonly Regex ReNuget = new(@"^.*[/\\]packages[/\\]", RegexOptions.Compiled);
    private static readonly Regex ReOrigin = new(@"^https?://[^/]+", RegexOptions.Compiled);
    private static readonly Regex ReDir = new(@"^.*[/\\]", RegexOptions.Compiled);

    /// <summary>
    /// Normalise a file path.
    /// </summary>
    private static string NormalisePath(string path)
    {
        var result = ReQuery.Replace(path, "");
        result = ReNuget.Replace(result, "packages/");
        result = ReOrigin.Replace(result, "");
        result = ReDir.Replace(result, "");
        return result;
    }
}
