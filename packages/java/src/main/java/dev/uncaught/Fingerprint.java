// ---------------------------------------------------------------------------
// dev.uncaught — error fingerprinting
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Generate a stable fingerprint for an error so that duplicate occurrences
 * of the same bug are grouped together.
 * <p>
 * The fingerprint is an 8-character hex string derived from:
 * <ol>
 *   <li>The normalised error message (volatile parts stripped).</li>
 *   <li>The top 3 stack frames (file + function name, no line/col numbers).</li>
 * </ol>
 * <p>
 * Uses the DJB2 hash function. Java {@code int} is signed 32-bit and wraps
 * naturally, identical to JavaScript's {@code | 0} behaviour.
 */
public final class Fingerprint {

    private Fingerprint() { /* utility class */ }

    // -- Regex patterns for message normalisation ----------------------------

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern HEX_PATTERN = Pattern.compile(
            "\\b[0-9a-f]{8,}\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern NUM_PATTERN = Pattern.compile(
            "\\b\\d{4,}\\b");

    private static final Pattern TIMESTAMP_PATTERN = Pattern.compile(
            "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[.\\d]*Z?");

    private static final Pattern HASHED_FILE_PATTERN = Pattern.compile(
            "([/\\\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\\.(js|ts|mjs|cjs|jsx|tsx)");

    // -- Regex patterns for stack frame extraction ---------------------------

    /** V8 format: "    at FunctionName (file:line:col)" */
    private static final Pattern V8_FRAME = Pattern.compile(
            "at\\s+(?:(.+?)\\s+\\()?(?:(.+?):\\d+:\\d+)\\)?");

    /** SpiderMonkey / JSC: "functionName@file:line:col" */
    private static final Pattern SM_FRAME = Pattern.compile(
            "^(.+?)@(.+?):\\d+:\\d+");

    /** Java stack frame: "    at com.example.Class.method(File.java:42)" */
    private static final Pattern JAVA_FRAME = Pattern.compile(
            "at\\s+([\\w.$]+)\\(([^)]+?)(?::\\d+)?\\)");

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Generate an 8-character hex fingerprint for an error.
     *
     * @param type    error type / class name (e.g. "NullPointerException")
     * @param message error message
     * @param stack   full stack trace string (may be null)
     * @return 8-character lowercase hex fingerprint
     */
    public static String generate(String type, String message, String stack) {
        String normalisedMessage = normaliseMessage(message != null ? message : "");
        List<String> frames = extractTopFrames(stack != null ? stack : "", 3);

        StringBuilder input = new StringBuilder();
        input.append(type != null ? type : "Error");
        input.append('\n');
        input.append(normalisedMessage);
        for (String frame : frames) {
            input.append('\n');
            input.append(frame);
        }

        return djb2(input.toString());
    }

    // -----------------------------------------------------------------------
    // DJB2 hash
    // -----------------------------------------------------------------------

    /**
     * DJB2 hash producing an 8-character lowercase hex string.
     * <p>
     * Java {@code int} is signed 32-bit; the shift-and-add arithmetic wraps
     * naturally, producing the same bit pattern as JavaScript's {@code | 0}.
     * We then convert to an unsigned representation for the hex output.
     */
    public static String djb2(String s) {
        int hash = 5381;
        for (int i = 0; i < s.length(); i++) {
            hash = ((hash << 5) + hash) + (int) s.charAt(i);
        }
        return String.format("%08x", Integer.toUnsignedLong(hash));
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Strip volatile substrings from an error message so that trivially-different
     * occurrences of the same bug hash identically.
     */
    static String normaliseMessage(String msg) {
        String result = msg;
        result = UUID_PATTERN.matcher(result).replaceAll("<UUID>");
        result = HEX_PATTERN.matcher(result).replaceAll("<HEX>");
        result = NUM_PATTERN.matcher(result).replaceAll("<NUM>");
        result = TIMESTAMP_PATTERN.matcher(result).replaceAll("<TIMESTAMP>");
        result = HASHED_FILE_PATTERN.matcher(result).replaceAll("$1<FILE>.$3");
        return result.trim();
    }

    /**
     * Extract the top N stack frames as normalised "file:function" strings.
     * Supports V8, SpiderMonkey/JSC, and Java stack trace formats.
     */
    static List<String> extractTopFrames(String stack, int count) {
        if (stack == null || stack.isEmpty()) {
            return new ArrayList<>();
        }

        String[] lines = stack.split("\n");
        List<String> frames = new ArrayList<>();

        for (String line : lines) {
            if (frames.size() >= count) break;
            String trimmed = line.trim();

            // V8 format
            Matcher v8 = V8_FRAME.matcher(trimmed);
            if (v8.find()) {
                String fn = v8.group(1) != null ? v8.group(1) : "<anonymous>";
                String file = normalisePath(v8.group(2) != null ? v8.group(2) : "<unknown>");
                frames.add(file + ":" + fn);
                continue;
            }

            // SpiderMonkey / JSC format
            Matcher sm = SM_FRAME.matcher(trimmed);
            if (sm.find()) {
                String fn = sm.group(1) != null ? sm.group(1) : "<anonymous>";
                String file = normalisePath(sm.group(2) != null ? sm.group(2) : "<unknown>");
                frames.add(file + ":" + fn);
                continue;
            }

            // Java stack frame format
            Matcher java = JAVA_FRAME.matcher(trimmed);
            if (java.find()) {
                String fn = java.group(1) != null ? java.group(1) : "<unknown>";
                String file = java.group(2) != null ? java.group(2) : "<unknown>";
                frames.add(file + ":" + fn);
                continue;
            }
        }

        return frames;
    }

    /**
     * Normalise a file path by stripping query strings / hashes and collapsing
     * absolute filesystem prefixes.
     */
    static String normalisePath(String p) {
        String result = p;
        // Strip query / hash
        result = result.replaceAll("[?#].*$", "");
        // Collapse deep node_modules paths
        result = result.replaceAll("^.*[/\\\\]node_modules[/\\\\]", "node_modules/");
        // Strip origin in URLs
        result = result.replaceAll("^https?://[^/]+", "");
        // Keep only filename
        result = result.replaceAll("^.*[/\\\\]", "");
        return result;
    }
}
