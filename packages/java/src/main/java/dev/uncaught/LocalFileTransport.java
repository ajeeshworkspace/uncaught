// ---------------------------------------------------------------------------
// dev.uncaught — local file transport
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;

/**
 * Writes events to the {@code .uncaught/} directory with the same structure as
 * the TypeScript SDK:
 *
 * <pre>
 * .uncaught/
 *   events/
 *     {fingerprint}/
 *       event-{timestamp}.json
 *       latest.json
 *   fix-prompts/
 *     {fingerprint}.md
 *   issues.json
 * </pre>
 *
 * <p>All writes are atomic: data is written to a {@code .tmp} file first, then
 * renamed using {@link java.nio.file.Files#move} with {@code ATOMIC_MOVE}.
 */
public class LocalFileTransport {

    private final Path baseDir;
    private boolean initialised = false;

    /**
     * @param baseDir the root directory for the local store (e.g. ".uncaught")
     */
    public LocalFileTransport(Path baseDir) {
        this.baseDir = baseDir;
    }

    /**
     * Create a transport using the default directory ({@code cwd/.uncaught}).
     */
    public LocalFileTransport() {
        this(Paths.get(System.getProperty("user.dir"), ".uncaught"));
    }

    /**
     * Create a transport using a string path.
     */
    public LocalFileTransport(String baseDir) {
        this(Paths.get(baseDir));
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Persist an event to disk.
     * <p>
     * Never throws — all errors are silently swallowed to avoid crashing
     * the host application.
     */
    public void send(Types.UncaughtEvent event) {
        try {
            ensureInitialised();

            String fp = event.getFingerprint();
            Path eventDir = baseDir.resolve("events").resolve(fp);
            Files.createDirectories(eventDir);

            // --- Write timestamped event file (atomic: .tmp -> rename) ------
            String ts = event.getTimestamp().replaceAll("[:.]+", "-");
            String eventFile = "event-" + ts + ".json";
            Path eventPath = eventDir.resolve(eventFile);
            atomicWrite(eventPath, JsonUtil.toJson(event));

            // --- Write / overwrite latest.json ------------------------------
            Path latestPath = eventDir.resolve("latest.json");
            atomicWrite(latestPath, JsonUtil.toJson(event));

            // --- Write fix-prompt Markdown file ----------------------------
            String promptFile = fp + ".md";
            Path promptPath = baseDir.resolve("fix-prompts").resolve(promptFile);
            atomicWrite(promptPath, event.getFixPrompt() != null ? event.getFixPrompt() : "");

            // --- Update issues.json index ----------------------------------
            updateIssuesIndex(event, eventFile, promptFile);

        } catch (Exception e) {
            // Never crash the host app.
        }
    }

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    private synchronized void ensureInitialised() throws IOException {
        if (initialised) return;

        Files.createDirectories(baseDir.resolve("events"));
        Files.createDirectories(baseDir.resolve("fix-prompts"));

        // Auto-add .uncaught/ to .gitignore
        ensureGitignore();

        initialised = true;
    }

    private void ensureGitignore() {
        try {
            Path cwd = Paths.get(System.getProperty("user.dir"));
            Path gitignorePath = cwd.resolve(".gitignore");

            String content = "";
            if (Files.exists(gitignorePath)) {
                content = new String(Files.readAllBytes(gitignorePath), StandardCharsets.UTF_8);
            }

            if (!content.contains(".uncaught")) {
                String line = "\n# Uncaught local error store\n.uncaught/\n";
                Files.write(
                        gitignorePath,
                        (content + line).getBytes(StandardCharsets.UTF_8)
                );
            }
        } catch (Exception e) {
            // Non-critical — swallow.
        }
    }

    // -----------------------------------------------------------------------
    // Atomic file writes
    // -----------------------------------------------------------------------

    /**
     * Write content to a file atomically (write to .tmp, then rename).
     */
    private void atomicWrite(Path target, String content) throws IOException {
        Path tmp = target.resolveSibling(target.getFileName() + ".tmp");
        try (BufferedWriter writer = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
            writer.write(content);
        }
        try {
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            // Fallback to non-atomic move (some filesystems don't support ATOMIC_MOVE)
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    // -----------------------------------------------------------------------
    // Issues index
    // -----------------------------------------------------------------------

    /**
     * Read, update, and atomically write the {@code issues.json} index.
     */
    private synchronized void updateIssuesIndex(Types.UncaughtEvent event,
                                                 String eventFile,
                                                 String promptFile) {
        try {
            Path indexPath = baseDir.resolve("issues.json");

            List<Types.IssueEntry> issues;
            if (Files.exists(indexPath)) {
                String raw = new String(Files.readAllBytes(indexPath), StandardCharsets.UTF_8);
                issues = JsonUtil.parseIssueEntries(raw);
            } else {
                issues = new java.util.ArrayList<>();
            }

            // Find existing entry for this fingerprint
            Types.IssueEntry existing = null;
            for (Types.IssueEntry issue : issues) {
                if (event.getFingerprint().equals(issue.getFingerprint())) {
                    existing = issue;
                    break;
                }
            }

            String userId = "anonymous";
            if (event.getUser() != null) {
                if (event.getUser().getId() != null) {
                    userId = event.getUser().getId();
                } else if (event.getUser().getEmail() != null) {
                    userId = event.getUser().getEmail();
                }
            }

            if (existing != null) {
                existing.setCount(existing.getCount() + 1);
                existing.setLastSeen(event.getTimestamp());
                existing.setLatestEventFile(eventFile);
                existing.setFixPromptFile(promptFile);
                if (!existing.getAffectedUsers().contains(userId)) {
                    existing.getAffectedUsers().add(userId);
                }
                // Re-open if previously resolved
                if (Types.STATUS_RESOLVED.equals(existing.getStatus())) {
                    existing.setStatus(Types.STATUS_OPEN);
                }
            } else {
                Types.IssueEntry entry = new Types.IssueEntry();
                entry.setFingerprint(event.getFingerprint());
                entry.setTitle(event.getError().getMessage());
                entry.setErrorType(event.getError().getType());
                entry.setCount(1);
                entry.setAffectedUsers(new java.util.ArrayList<>());
                entry.getAffectedUsers().add(userId);
                entry.setFirstSeen(event.getTimestamp());
                entry.setLastSeen(event.getTimestamp());
                entry.setStatus(Types.STATUS_OPEN);
                entry.setFixPromptFile(promptFile);
                entry.setLatestEventFile(eventFile);
                entry.setRelease(event.getRelease());
                if (event.getEnvironment() != null) {
                    entry.setEnvironment(event.getEnvironment().getDeploy());
                }
                issues.add(entry);
            }

            // Write index
            atomicWrite(indexPath, JsonUtil.toPrettyJson(issues));

        } catch (Exception e) {
            // Never crash the host app.
        }
    }
}
