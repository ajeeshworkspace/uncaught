// ---------------------------------------------------------------------------
// dev.uncaught — fix-prompt builder
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Build a structured Markdown prompt that can be pasted into an AI assistant
 * to diagnose and fix the production error described by an event.
 * <p>
 * Empty sections are omitted to keep the prompt concise.
 */
public final class PromptBuilder {

    private PromptBuilder() { /* utility class */ }

    /** V8 format: "    at fn (file:line:col)" */
    private static final Pattern V8_LOCATION = Pattern.compile(
            "at\\s+(?:.+?\\s+\\()?(.+?:\\d+:\\d+)\\)?");

    /** SpiderMonkey / JSC: "fn@file:line:col" */
    private static final Pattern SM_LOCATION = Pattern.compile(
            "@(.+?:\\d+:\\d+)");

    /** Java format: "at com.example.Class.method(File.java:42)" */
    private static final Pattern JAVA_LOCATION = Pattern.compile(
            "at\\s+([\\w.$]+\\([^)]+?:\\d+\\))");

    /**
     * Build the fix prompt for the given event.
     *
     * @param event the captured event
     * @return a Markdown string suitable for AI assistance
     */
    public static String buildFixPrompt(Types.UncaughtEvent event) {
        List<String> sections = new ArrayList<>();

        // ----- Intro -------------------------------------------------------
        sections.add("I have a production bug in my application that I need help diagnosing and fixing.\n");

        // ----- Error -------------------------------------------------------
        if (event.getError() != null) {
            Types.ErrorInfo err = event.getError();
            String location = extractLocation(err.getStack());
            List<String> lines = new ArrayList<>();
            lines.add("## Error");
            lines.add("");
            lines.add("- **Type:** " + (err.getType() != null ? err.getType() : "Error"));
            lines.add("- **Message:** " + (err.getMessage() != null ? err.getMessage() : "(no message)"));
            if (location != null) {
                lines.add("- **Location:** " + location);
            }
            sections.add(String.join("\n", lines));
        }

        // ----- Stack Trace -------------------------------------------------
        if (event.getError() != null) {
            String stackSource = event.getError().getResolvedStack() != null
                    ? event.getError().getResolvedStack()
                    : event.getError().getStack();
            if (stackSource != null && !stackSource.isEmpty()) {
                String[] allLines = stackSource.split("\n");
                StringBuilder frames = new StringBuilder();
                int limit = Math.min(15, allLines.length);
                for (int i = 0; i < limit; i++) {
                    if (i > 0) frames.append('\n');
                    frames.append(allLines[i].stripTrailing());
                }
                String label = event.getError().getResolvedStack() != null
                        ? "Stack Trace (source-mapped)"
                        : "Stack Trace";
                sections.add("## " + label + "\n\n```\n" + frames.toString() + "\n```");
            }
        }

        // ----- Failed Operation --------------------------------------------
        if (event.getOperation() != null) {
            sections.add(formatOperation(event.getOperation()));
        }

        // ----- HTTP Request Context ----------------------------------------
        if (event.getRequest() != null) {
            sections.add(formatRequest(event.getRequest()));
        }

        // ----- User Session (last 5 breadcrumbs) ---------------------------
        if (event.getBreadcrumbs() != null && !event.getBreadcrumbs().isEmpty()) {
            sections.add(formatBreadcrumbs(event.getBreadcrumbs()));
        }

        // ----- Environment -------------------------------------------------
        if (event.getEnvironment() != null) {
            sections.add(formatEnvironment(event.getEnvironment()));
        }

        // ----- Component Stack ---------------------------------------------
        if (event.getError() != null && event.getError().getComponentStack() != null) {
            sections.add("## Component Stack\n\n```\n"
                    + event.getError().getComponentStack().trim() + "\n```");
        }

        // ----- What I need -------------------------------------------------
        sections.add(String.join("\n",
                "## What I need",
                "",
                "1. **Root cause analysis** — explain why this error is occurring.",
                "2. **A fix** — provide the corrected code with an explanation of the changes.",
                "3. **Prevention** — suggest any guards or tests to prevent this from happening again."
        ));

        return String.join("\n\n", sections) + "\n";
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Extract the top-most location (file:line:col) from a stack trace string.
     */
    private static String extractLocation(String stack) {
        if (stack == null || stack.isEmpty()) return null;

        for (String line : stack.split("\n")) {
            String trimmed = line.trim();

            // V8
            Matcher v8 = V8_LOCATION.matcher(trimmed);
            if (v8.find()) return v8.group(1);

            // SpiderMonkey / JSC
            Matcher sm = SM_LOCATION.matcher(trimmed);
            if (sm.find()) return sm.group(1);

            // Java
            Matcher java = JAVA_LOCATION.matcher(trimmed);
            if (java.find()) return java.group(1);
        }

        return null;
    }

    private static String formatOperation(Types.OperationInfo op) {
        List<String> lines = new ArrayList<>();
        lines.add("## Failed Operation");
        lines.add("");
        lines.add("- **Provider:** " + op.getProvider());
        lines.add("- **Type:** " + op.getType());
        lines.add("- **Method:** " + op.getMethod());
        if (op.getParams() != null) {
            lines.add("- **Params:**");
            lines.add("```json");
            lines.add(JsonUtil.toJson(op.getParams()));
            lines.add("```");
        }
        if (op.getErrorCode() != null) {
            lines.add("- **Error Code:** " + op.getErrorCode());
        }
        if (op.getErrorDetails() != null) {
            lines.add("- **Error Details:** " + op.getErrorDetails());
        }
        return String.join("\n", lines);
    }

    private static String formatRequest(Types.RequestInfo req) {
        List<String> lines = new ArrayList<>();
        lines.add("## HTTP Request Context");
        lines.add("");
        if (req.getMethod() != null) lines.add("- **Method:** " + req.getMethod());
        if (req.getUrl() != null) lines.add("- **URL:** " + req.getUrl());
        if (req.getBody() != null) {
            lines.add("- **Body:**");
            lines.add("```json");
            lines.add(req.getBody() instanceof String
                    ? (String) req.getBody()
                    : JsonUtil.toJson(req.getBody()));
            lines.add("```");
        }
        return String.join("\n", lines);
    }

    private static String formatBreadcrumbs(List<Types.Breadcrumb> crumbs) {
        // Take the last 5
        int start = Math.max(0, crumbs.size() - 5);
        List<Types.Breadcrumb> recent = crumbs.subList(start, crumbs.size());
        List<String> lines = new ArrayList<>();
        lines.add("## User Session");
        lines.add("");

        for (Types.Breadcrumb crumb : recent) {
            String time = formatTime(crumb.getTimestamp());
            lines.add("- `" + time + "` **[" + crumb.getType() + "]** " + crumb.getMessage());
        }

        return String.join("\n", lines);
    }

    /**
     * Extract HH:MM:SS from an ISO timestamp.
     */
    private static String formatTime(String iso) {
        if (iso == null || iso.isEmpty()) return "";
        try {
            Instant instant = Instant.parse(iso);
            return DateTimeFormatter.ofPattern("HH:mm:ss")
                    .withZone(ZoneId.systemDefault())
                    .format(instant);
        } catch (Exception e) {
            return iso;
        }
    }

    private static String formatEnvironment(Types.EnvironmentInfo env) {
        List<String> lines = new ArrayList<>();
        lines.add("## Environment");
        lines.add("");

        addIfPresent(lines, "Deploy Environment", env.getDeploy());
        addIfPresent(lines, "Framework", env.getFramework());
        addIfPresent(lines, "Framework Version", env.getFrameworkVersion());
        addIfPresent(lines, "Runtime", env.getRuntime());
        addIfPresent(lines, "Runtime Version", env.getRuntimeVersion());
        addIfPresent(lines, "Platform", env.getPlatform());
        addIfPresent(lines, "OS", env.getOs());
        addIfPresent(lines, "Locale", env.getLocale());
        addIfPresent(lines, "Timezone", env.getTimezone());

        return String.join("\n", lines);
    }

    private static void addIfPresent(List<String> lines, String label, String value) {
        if (value != null && !value.isEmpty()) {
            lines.add("- **" + label + ":** " + value);
        }
    }
}
