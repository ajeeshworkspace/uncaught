// ---------------------------------------------------------------------------
// dev.uncaught — minimal JSON serialiser (zero external dependencies)
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.ArrayList;
import java.util.Collection;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collections;

/**
 * Minimal JSON serialiser that handles:
 * <ul>
 *   <li>Maps, Lists, Strings, Numbers, Booleans, nulls</li>
 *   <li>The SDK's typed objects ({@link Types.UncaughtEvent}, etc.)</li>
 *   <li>Circular reference detection</li>
 *   <li>Pretty-printing with 2-space indentation</li>
 * </ul>
 * <p>
 * This avoids pulling in Gson / Jackson as a required dependency.
 */
public final class JsonUtil {

    private JsonUtil() { /* utility class */ }

    private static final int MAX_DEPTH = 10;

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Serialise an object to a JSON string (compact).
     */
    public static String toJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        Set<Object> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        write(sb, obj, seen, 0, false, 0);
        return sb.toString();
    }

    /**
     * Serialise an object to a pretty-printed JSON string (2-space indent).
     */
    public static String toPrettyJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        Set<Object> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        write(sb, obj, seen, 0, true, 0);
        return sb.toString();
    }

    // -----------------------------------------------------------------------
    // Serialisation engine
    // -----------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static void write(StringBuilder sb, Object value, Set<Object> seen, int depth,
                              boolean pretty, int indent) {
        if (depth > MAX_DEPTH) {
            sb.append("\"[Max Depth]\"");
            return;
        }

        if (value == null) {
            sb.append("null");
            return;
        }

        if (value instanceof String) {
            writeString(sb, (String) value);
            return;
        }

        if (value instanceof Number) {
            sb.append(value);
            return;
        }

        if (value instanceof Boolean) {
            sb.append(value);
            return;
        }

        // --- Lists / Collections ---
        if (value instanceof Collection) {
            Collection<?> list = (Collection<?>) value;
            if (seen.contains(value)) {
                sb.append("\"[Circular]\"");
                return;
            }
            seen.add(value);
            writeList(sb, new ArrayList<>(list), seen, depth, pretty, indent);
            seen.remove(value);
            return;
        }

        // --- Maps ---
        if (value instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) value;
            if (seen.contains(value)) {
                sb.append("\"[Circular]\"");
                return;
            }
            seen.add(value);
            writeMap(sb, map, seen, depth, pretty, indent);
            seen.remove(value);
            return;
        }

        // --- SDK typed objects: convert to Map then serialise ---
        if (value instanceof Types.UncaughtEvent) {
            writeEvent(sb, (Types.UncaughtEvent) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.ErrorInfo) {
            writeErrorInfo(sb, (Types.ErrorInfo) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.Breadcrumb) {
            writeBreadcrumb(sb, (Types.Breadcrumb) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.RequestInfo) {
            writeRequestInfo(sb, (Types.RequestInfo) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.OperationInfo) {
            writeOperationInfo(sb, (Types.OperationInfo) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.EnvironmentInfo) {
            writeEnvironmentInfo(sb, (Types.EnvironmentInfo) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.UserInfo) {
            writeUserInfo(sb, (Types.UserInfo) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.SdkInfo) {
            writeSdkInfo(sb, (Types.SdkInfo) value, seen, depth, pretty, indent);
            return;
        }
        if (value instanceof Types.IssueEntry) {
            writeIssueEntry(sb, (Types.IssueEntry) value, seen, depth, pretty, indent);
            return;
        }

        // Fallback: toString
        writeString(sb, value.toString());
    }

    // -----------------------------------------------------------------------
    // Primitives
    // -----------------------------------------------------------------------

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    // -----------------------------------------------------------------------
    // Collections
    // -----------------------------------------------------------------------

    private static void writeList(StringBuilder sb, List<?> list, Set<Object> seen,
                                  int depth, boolean pretty, int indent) {
        sb.append('[');
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) sb.append(',');
            if (pretty) { sb.append('\n'); writeIndent(sb, indent + 1); }
            write(sb, list.get(i), seen, depth + 1, pretty, indent + 1);
        }
        if (pretty && !list.isEmpty()) { sb.append('\n'); writeIndent(sb, indent); }
        sb.append(']');
    }

    private static void writeMap(StringBuilder sb, Map<String, Object> map, Set<Object> seen,
                                 int depth, boolean pretty, int indent) {
        sb.append('{');
        boolean first = true;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            if (pretty) { sb.append('\n'); writeIndent(sb, indent + 1); }
            writeString(sb, entry.getKey());
            sb.append(':');
            if (pretty) sb.append(' ');
            write(sb, entry.getValue(), seen, depth + 1, pretty, indent + 1);
        }
        if (pretty && !map.isEmpty()) { sb.append('\n'); writeIndent(sb, indent); }
        sb.append('}');
    }

    // -----------------------------------------------------------------------
    // SDK typed object serialisers
    // -----------------------------------------------------------------------

    private static void writeEvent(StringBuilder sb, Types.UncaughtEvent e, Set<Object> seen,
                                   int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.put("eventId", e.getEventId());
        map.put("timestamp", e.getTimestamp());
        map.putIfNotNull("projectKey", e.getProjectKey());
        map.put("level", e.getLevel());
        map.put("fingerprint", e.getFingerprint());
        map.putIfNotNull("release", e.getRelease());
        map.put("error", e.getError());
        map.put("breadcrumbs", e.getBreadcrumbs());
        map.putIfNotNull("request", e.getRequest());
        map.putIfNotNull("operation", e.getOperation());
        map.putIfNotNull("environment", e.getEnvironment());
        map.putIfNotNull("user", e.getUser());
        map.putIfNotNull("userFeedback", e.getUserFeedback());
        map.put("fixPrompt", e.getFixPrompt());
        map.put("sdk", e.getSdk());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeErrorInfo(StringBuilder sb, Types.ErrorInfo e, Set<Object> seen,
                                       int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.put("message", e.getMessage());
        map.put("type", e.getType());
        map.putIfNotNull("stack", e.getStack());
        map.putIfNotNull("resolvedStack", e.getResolvedStack());
        map.putIfNotNull("componentStack", e.getComponentStack());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeBreadcrumb(StringBuilder sb, Types.Breadcrumb b, Set<Object> seen,
                                        int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.put("type", b.getType());
        map.put("category", b.getCategory());
        map.put("message", b.getMessage());
        map.put("timestamp", b.getTimestamp());
        map.putIfNotNull("data", b.getData());
        map.putIfNotNull("level", b.getLevel());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeRequestInfo(StringBuilder sb, Types.RequestInfo r, Set<Object> seen,
                                         int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.putIfNotNull("method", r.getMethod());
        map.putIfNotNull("url", r.getUrl());
        map.putIfNotNull("headers", r.getHeaders());
        map.putIfNotNull("body", r.getBody());
        map.putIfNotNull("query", r.getQuery());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeOperationInfo(StringBuilder sb, Types.OperationInfo o, Set<Object> seen,
                                           int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.put("provider", o.getProvider());
        map.put("type", o.getType());
        map.put("method", o.getMethod());
        map.putIfNotNull("params", o.getParams());
        map.putIfNotNull("errorCode", o.getErrorCode());
        map.putIfNotNull("errorDetails", o.getErrorDetails());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeEnvironmentInfo(StringBuilder sb, Types.EnvironmentInfo e, Set<Object> seen,
                                             int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.putIfNotNull("framework", e.getFramework());
        map.putIfNotNull("frameworkVersion", e.getFrameworkVersion());
        map.putIfNotNull("runtime", e.getRuntime());
        map.putIfNotNull("runtimeVersion", e.getRuntimeVersion());
        map.putIfNotNull("platform", e.getPlatform());
        map.putIfNotNull("os", e.getOs());
        map.putIfNotNull("browser", e.getBrowser());
        map.putIfNotNull("browserVersion", e.getBrowserVersion());
        map.putIfNotNull("deviceType", e.getDeviceType());
        map.putIfNotNull("locale", e.getLocale());
        map.putIfNotNull("timezone", e.getTimezone());
        map.putIfNotNull("url", e.getUrl());
        map.putIfNotNull("deploy", e.getDeploy());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeUserInfo(StringBuilder sb, Types.UserInfo u, Set<Object> seen,
                                      int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.putIfNotNull("id", u.getId());
        map.putIfNotNull("email", u.getEmail());
        map.putIfNotNull("username", u.getUsername());
        // Add extra fields
        for (Map.Entry<String, Object> entry : u.getExtra().entrySet()) {
            map.put(entry.getKey(), entry.getValue());
        }
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeSdkInfo(StringBuilder sb, Types.SdkInfo s, Set<Object> seen,
                                     int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.put("name", s.getName());
        map.put("version", s.getVersion());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    private static void writeIssueEntry(StringBuilder sb, Types.IssueEntry e, Set<Object> seen,
                                        int depth, boolean pretty, int indent) {
        OrderedMap map = new OrderedMap();
        map.put("fingerprint", e.getFingerprint());
        map.put("title", e.getTitle());
        map.put("errorType", e.getErrorType());
        map.put("count", e.getCount());
        map.put("affectedUsers", e.getAffectedUsers());
        map.put("firstSeen", e.getFirstSeen());
        map.put("lastSeen", e.getLastSeen());
        map.put("status", e.getStatus());
        map.put("fixPromptFile", e.getFixPromptFile());
        map.put("latestEventFile", e.getLatestEventFile());
        map.putIfNotNull("release", e.getRelease());
        map.putIfNotNull("environment", e.getEnvironment());
        writeOrderedMap(sb, map, seen, depth, pretty, indent);
    }

    // -----------------------------------------------------------------------
    // OrderedMap helper (preserves insertion order)
    // -----------------------------------------------------------------------

    private static void writeOrderedMap(StringBuilder sb, OrderedMap map, Set<Object> seen,
                                        int depth, boolean pretty, int indent) {
        sb.append('{');
        boolean first = true;
        for (int i = 0; i < map.keys.size(); i++) {
            if (!first) sb.append(',');
            first = false;
            if (pretty) { sb.append('\n'); writeIndent(sb, indent + 1); }
            writeString(sb, map.keys.get(i));
            sb.append(':');
            if (pretty) sb.append(' ');
            write(sb, map.values.get(i), seen, depth + 1, pretty, indent + 1);
        }
        if (pretty && !map.keys.isEmpty()) { sb.append('\n'); writeIndent(sb, indent); }
        sb.append('}');
    }

    private static void writeIndent(StringBuilder sb, int level) {
        for (int i = 0; i < level * 2; i++) {
            sb.append(' ');
        }
    }

    /**
     * Simple insertion-ordered key-value list for deterministic JSON output.
     */
    static class OrderedMap {
        final List<String> keys = new ArrayList<>();
        final List<Object> values = new ArrayList<>();

        void put(String key, Object value) {
            keys.add(key);
            values.add(value);
        }

        void putIfNotNull(String key, Object value) {
            if (value != null) {
                keys.add(key);
                values.add(value);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Minimal JSON parser (for reading issues.json)
    // -----------------------------------------------------------------------

    /**
     * Parse a JSON array of issue entries from a string.
     * This is a minimal parser sufficient for reading the issues.json file.
     *
     * @param json the JSON string to parse
     * @return list of IssueEntry objects, or empty list on parse failure
     */
    public static List<Types.IssueEntry> parseIssueEntries(String json) {
        List<Types.IssueEntry> result = new ArrayList<>();
        if (json == null || json.trim().isEmpty()) return result;

        try {
            // Minimal tokenised parsing for an array of objects
            json = json.trim();
            if (!json.startsWith("[")) return result;

            int pos = 1; // skip '['
            while (pos < json.length()) {
                pos = skipWhitespace(json, pos);
                if (pos >= json.length() || json.charAt(pos) == ']') break;
                if (json.charAt(pos) == ',') { pos++; continue; }
                if (json.charAt(pos) == '{') {
                    int objStart = pos;
                    int objEnd = findMatchingBrace(json, pos);
                    if (objEnd < 0) break;
                    String objStr = json.substring(objStart, objEnd + 1);
                    Types.IssueEntry entry = parseIssueEntry(objStr);
                    if (entry != null) result.add(entry);
                    pos = objEnd + 1;
                } else {
                    pos++;
                }
            }
        } catch (Exception e) {
            // Parse failure — return what we have so far
        }

        return result;
    }

    private static Types.IssueEntry parseIssueEntry(String json) {
        Types.IssueEntry entry = new Types.IssueEntry();
        entry.setFingerprint(extractStringField(json, "fingerprint"));
        entry.setTitle(extractStringField(json, "title"));
        entry.setErrorType(extractStringField(json, "errorType"));
        entry.setCount(extractIntField(json, "count"));
        entry.setFirstSeen(extractStringField(json, "firstSeen"));
        entry.setLastSeen(extractStringField(json, "lastSeen"));
        entry.setStatus(extractStringField(json, "status"));
        entry.setFixPromptFile(extractStringField(json, "fixPromptFile"));
        entry.setLatestEventFile(extractStringField(json, "latestEventFile"));
        entry.setRelease(extractStringField(json, "release"));
        entry.setEnvironment(extractStringField(json, "environment"));

        // Parse affectedUsers array
        List<String> users = extractStringArray(json, "affectedUsers");
        entry.setAffectedUsers(users);

        return entry;
    }

    private static String extractStringField(String json, String field) {
        String pattern = "\"" + field + "\"";
        int idx = json.indexOf(pattern);
        if (idx < 0) return null;
        int colonIdx = json.indexOf(':', idx + pattern.length());
        if (colonIdx < 0) return null;
        int valStart = skipWhitespace(json, colonIdx + 1);
        if (valStart >= json.length()) return null;
        if (json.charAt(valStart) == 'n') return null; // null
        if (json.charAt(valStart) != '"') return null;
        return readString(json, valStart);
    }

    private static int extractIntField(String json, String field) {
        String pattern = "\"" + field + "\"";
        int idx = json.indexOf(pattern);
        if (idx < 0) return 0;
        int colonIdx = json.indexOf(':', idx + pattern.length());
        if (colonIdx < 0) return 0;
        int valStart = skipWhitespace(json, colonIdx + 1);
        if (valStart >= json.length()) return 0;
        StringBuilder numStr = new StringBuilder();
        for (int i = valStart; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c >= '0' && c <= '9') {
                numStr.append(c);
            } else {
                break;
            }
        }
        if (numStr.length() == 0) return 0;
        return Integer.parseInt(numStr.toString());
    }

    private static List<String> extractStringArray(String json, String field) {
        List<String> result = new ArrayList<>();
        String pattern = "\"" + field + "\"";
        int idx = json.indexOf(pattern);
        if (idx < 0) return result;
        int colonIdx = json.indexOf(':', idx + pattern.length());
        if (colonIdx < 0) return result;
        int arrStart = json.indexOf('[', colonIdx);
        if (arrStart < 0) return result;
        int arrEnd = json.indexOf(']', arrStart);
        if (arrEnd < 0) return result;
        String arrStr = json.substring(arrStart + 1, arrEnd);
        int pos = 0;
        while (pos < arrStr.length()) {
            pos = skipWhitespace(arrStr, pos);
            if (pos >= arrStr.length()) break;
            if (arrStr.charAt(pos) == '"') {
                String s = readString(arrStr, pos);
                if (s != null) result.add(s);
                // advance past this string
                pos = arrStr.indexOf('"', pos + 1); // find closing quote
                if (pos < 0) break;
                pos++; // past closing quote
            } else {
                pos++;
            }
        }
        return result;
    }

    private static String readString(String json, int start) {
        if (start >= json.length() || json.charAt(start) != '"') return null;
        StringBuilder sb = new StringBuilder();
        for (int i = start + 1; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '\\' && i + 1 < json.length()) {
                char next = json.charAt(i + 1);
                switch (next) {
                    case '"': sb.append('"'); i++; break;
                    case '\\': sb.append('\\'); i++; break;
                    case 'n': sb.append('\n'); i++; break;
                    case 't': sb.append('\t'); i++; break;
                    case 'r': sb.append('\r'); i++; break;
                    default: sb.append(next); i++; break;
                }
            } else if (c == '"') {
                return sb.toString();
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static int skipWhitespace(String json, int pos) {
        while (pos < json.length() && Character.isWhitespace(json.charAt(pos))) {
            pos++;
        }
        return pos;
    }

    private static int findMatchingBrace(String json, int start) {
        int depth = 0;
        boolean inString = false;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (inString) {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }
            if (c == '"') { inString = true; continue; }
            if (c == '{') depth++;
            if (c == '}') { depth--; if (depth == 0) return i; }
        }
        return -1;
    }
}
