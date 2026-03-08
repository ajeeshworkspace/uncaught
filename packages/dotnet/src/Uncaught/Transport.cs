// ---------------------------------------------------------------------------
// Uncaught — transport layer (local file transport)
// ---------------------------------------------------------------------------

using System.Text.Json;

namespace Uncaught;

/// <summary>
/// Local file transport — writes events to .uncaught/ directory.
/// </summary>
public sealed class LocalFileTransport
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    private readonly string _baseDir;
    private readonly bool _debug;
    private bool _initialised;

    public LocalFileTransport(UncaughtConfig config)
    {
        _baseDir = config.LocalOutputDir
            ?? Path.Combine(Directory.GetCurrentDirectory(), ".uncaught");
        _debug = config.Debug;
    }

    /// <summary>
    /// Send an event to the local file system.
    /// </summary>
    public void Send(UncaughtEvent uncaughtEvent)
    {
        try
        {
            EnsureInit();

            var fp = uncaughtEvent.Fingerprint;
            var eventDir = Path.Combine(_baseDir, "events", fp);
            Directory.CreateDirectory(eventDir);

            // Serialize event
            var json = JsonSerializer.Serialize(uncaughtEvent, JsonOptions);

            // Write timestamped event file (atomic: .tmp -> rename)
            var ts = uncaughtEvent.Timestamp
                .Replace(":", "-")
                .Replace(".", "-");
            var eventFile = $"event-{ts}.json";
            var eventPath = Path.Combine(eventDir, eventFile);
            var tmpEventPath = eventPath + ".tmp";
            File.WriteAllText(tmpEventPath, json);
            File.Move(tmpEventPath, eventPath, overwrite: true);

            // Write / overwrite latest.json
            var latestPath = Path.Combine(eventDir, "latest.json");
            var tmpLatestPath = latestPath + ".tmp";
            File.WriteAllText(tmpLatestPath, json);
            File.Move(tmpLatestPath, latestPath, overwrite: true);

            // Write fix-prompt Markdown file
            var promptFile = $"{fp}.md";
            var promptPath = Path.Combine(_baseDir, "fix-prompts", promptFile);
            var tmpPromptPath = promptPath + ".tmp";
            File.WriteAllText(tmpPromptPath, uncaughtEvent.FixPrompt ?? "");
            File.Move(tmpPromptPath, promptPath, overwrite: true);

            // Update issues.json index
            UpdateIssuesIndex(uncaughtEvent, eventFile, promptFile);
        }
        catch (Exception ex)
        {
            if (_debug)
            {
                Console.Error.WriteLine($"[uncaught] Transport error: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Flush queued events. Local file transport writes synchronously; this is a no-op.
    /// </summary>
    public void Flush()
    {
        // Local file transport writes synchronously per-event; nothing to flush.
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    private void EnsureInit()
    {
        if (_initialised) return;

        Directory.CreateDirectory(Path.Combine(_baseDir, "events"));
        Directory.CreateDirectory(Path.Combine(_baseDir, "fix-prompts"));

        EnsureGitignore();

        _initialised = true;
    }

    private void EnsureGitignore()
    {
        try
        {
            var parentDir = Directory.GetParent(_baseDir)?.FullName;
            if (parentDir == null) return;

            var gitignorePath = Path.Combine(parentDir, ".gitignore");
            var content = File.Exists(gitignorePath)
                ? File.ReadAllText(gitignorePath)
                : "";

            if (!content.Contains(".uncaught"))
            {
                var line = "\n# Uncaught local error store\n.uncaught/\n";
                File.WriteAllText(gitignorePath, content + line);
            }
        }
        catch
        {
            // Non-critical — swallow.
        }
    }

    private void UpdateIssuesIndex(UncaughtEvent uncaughtEvent, string eventFile, string promptFile)
    {
        var indexPath = Path.Combine(_baseDir, "issues.json");

        List<IssueEntry> issues;
        try
        {
            if (File.Exists(indexPath))
            {
                var raw = File.ReadAllText(indexPath);
                issues = JsonSerializer.Deserialize<List<IssueEntry>>(raw, JsonOptions)
                    ?? new List<IssueEntry>();
            }
            else
            {
                issues = new List<IssueEntry>();
            }
        }
        catch
        {
            issues = new List<IssueEntry>();
        }

        var userId = uncaughtEvent.User?.Id
            ?? uncaughtEvent.User?.Email
            ?? "anonymous";

        var existing = issues.Find(i => i.Fingerprint == uncaughtEvent.Fingerprint);

        if (existing != null)
        {
            existing.Count++;
            existing.LastSeen = uncaughtEvent.Timestamp;
            existing.LatestEventFile = eventFile;
            existing.FixPromptFile = promptFile;
            if (!existing.AffectedUsers.Contains(userId))
            {
                existing.AffectedUsers.Add(userId);
            }
            if (existing.Status == IssueStatus.Resolved)
            {
                existing.Status = IssueStatus.Open;
            }
        }
        else
        {
            issues.Add(new IssueEntry
            {
                Fingerprint = uncaughtEvent.Fingerprint,
                Title = uncaughtEvent.Error.Message,
                ErrorType = uncaughtEvent.Error.Type,
                Count = 1,
                AffectedUsers = new List<string> { userId },
                FirstSeen = uncaughtEvent.Timestamp,
                LastSeen = uncaughtEvent.Timestamp,
                Status = IssueStatus.Open,
                FixPromptFile = promptFile,
                LatestEventFile = eventFile,
                Release = uncaughtEvent.Release,
                Environment = uncaughtEvent.Environment?.Deploy
            });
        }

        // Atomic write
        var tmpIndexPath = indexPath + ".tmp";
        var issuesJson = JsonSerializer.Serialize(issues, JsonOptions);
        File.WriteAllText(tmpIndexPath, issuesJson);
        File.Move(tmpIndexPath, indexPath, overwrite: true);
    }
}
