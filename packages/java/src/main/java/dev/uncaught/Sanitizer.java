// ---------------------------------------------------------------------------
// dev.uncaught — PII / secret sanitizer
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Deep-clone and sanitise objects, redacting values whose keys match
 * sensitive patterns.
 * <p>
 * Handles:
 * <ul>
 *   <li>Circular references (returns {@code "[Circular]"}).</li>
 *   <li>Truncation of strings longer than 2048 characters.</li>
 *   <li>Maps, Lists, and primitive types.</li>
 * </ul>
 * Never mutates the original object.
 */
public final class Sanitizer {

    private Sanitizer() { /* utility class */ }

    /** Default key patterns that are always redacted. */
    private static final List<String> DEFAULT_SENSITIVE_KEYS = Arrays.asList(
            "password", "passwd", "secret", "token", "apikey", "api_key",
            "authorization", "credit_card", "creditcard", "card_number",
            "cvv", "ssn", "social_security", "private_key",
            "access_token", "refresh_token", "session_id", "cookie"
    );

    /** Headers that are always stripped regardless of key matching. */
    private static final Set<String> SENSITIVE_HEADERS = new HashSet<>(Arrays.asList(
            "authorization", "cookie", "set-cookie"
    ));

    private static final String REDACTED = "[REDACTED]";
    private static final int MAX_STRING_LENGTH = 2048;

    /**
     * Deep-sanitise an object (a Map or List tree), returning a new structure
     * with sensitive values redacted.
     *
     * @param obj            the value to sanitise
     * @param additionalKeys extra key patterns to redact on top of defaults
     * @return sanitised deep copy
     */
    @SuppressWarnings("unchecked")
    public static <T> T sanitize(T obj, List<String> additionalKeys) {
        Pattern pattern = buildKeyPattern(additionalKeys);
        Set<Object> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        return (T) walk(obj, null, pattern, seen);
    }

    public static <T> T sanitize(T obj) {
        return sanitize(obj, null);
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Build a single regex that matches any of the sensitive key patterns
     * (case-insensitive).
     */
    private static Pattern buildKeyPattern(List<String> additionalKeys) {
        List<String> all = new ArrayList<>(DEFAULT_SENSITIVE_KEYS);
        if (additionalKeys != null) {
            all.addAll(additionalKeys);
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < all.size(); i++) {
            if (i > 0) sb.append('|');
            sb.append(Pattern.quote(all.get(i)));
        }
        return Pattern.compile(sb.toString(), Pattern.CASE_INSENSITIVE);
    }

    @SuppressWarnings("unchecked")
    private static Object walk(Object value, String key, Pattern pattern, Set<Object> seen) {
        // Redact if the current key is sensitive
        if (key != null && pattern.matcher(key).find()) {
            return REDACTED;
        }

        // Nulls
        if (value == null) {
            return null;
        }

        // Strings — truncate if too long
        if (value instanceof String) {
            String s = (String) value;
            if (s.length() > MAX_STRING_LENGTH) {
                return s.substring(0, MAX_STRING_LENGTH) + "...[truncated]";
            }
            return s;
        }

        // Numbers and booleans pass through
        if (value instanceof Number || value instanceof Boolean) {
            return value;
        }

        // Lists
        if (value instanceof List) {
            List<Object> list = (List<Object>) value;
            if (seen.contains(list)) return "[Circular]";
            seen.add(list);

            List<Object> result = new ArrayList<>(list.size());
            for (Object item : list) {
                result.add(walk(item, null, pattern, seen));
            }

            seen.remove(list);
            return result;
        }

        // Maps (the primary "object" type in Java SDK data models)
        if (value instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) value;
            if (seen.contains(map)) return "[Circular]";
            seen.add(map);

            Map<String, Object> result = new HashMap<>();
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                String k = entry.getKey();
                // Always strip sensitive headers
                if (SENSITIVE_HEADERS.contains(k.toLowerCase())) {
                    result.put(k, REDACTED);
                    continue;
                }
                result.put(k, walk(entry.getValue(), k, pattern, seen));
            }

            seen.remove(map);
            return result;
        }

        // For typed objects (like our Types.* classes), convert to Map, sanitize, then rebuild
        // This handles the UncaughtEvent and its nested types
        if (value instanceof Types.UncaughtEvent) {
            return sanitizeEvent((Types.UncaughtEvent) value, pattern, seen);
        }

        if (value instanceof Types.RequestInfo) {
            return sanitizeRequestInfo((Types.RequestInfo) value, pattern, seen);
        }

        // Fallback: return as-is
        return value;
    }

    /**
     * Sanitize an UncaughtEvent in place (returns a new copy).
     */
    private static Types.UncaughtEvent sanitizeEvent(Types.UncaughtEvent event, Pattern pattern, Set<Object> seen) {
        if (seen.contains(event)) return event;
        seen.add(event);

        Types.UncaughtEvent result = new Types.UncaughtEvent();
        result.setEventId(event.getEventId());
        result.setTimestamp(event.getTimestamp());
        result.setProjectKey(event.getProjectKey());
        result.setLevel(event.getLevel());
        result.setFingerprint(event.getFingerprint());
        result.setRelease(event.getRelease());
        result.setFixPrompt(event.getFixPrompt());
        result.setSdk(event.getSdk());
        result.setUserFeedback(event.getUserFeedback());

        // Sanitise error info
        if (event.getError() != null) {
            Types.ErrorInfo e = event.getError();
            Types.ErrorInfo se = new Types.ErrorInfo();
            se.setMessage(e.getMessage());
            se.setType(e.getType());
            se.setStack(e.getStack());
            se.setResolvedStack(e.getResolvedStack());
            se.setComponentStack(e.getComponentStack());
            result.setError(se);
        }

        // Sanitise request
        if (event.getRequest() != null) {
            result.setRequest(sanitizeRequestInfo(event.getRequest(), pattern, seen));
        }

        // Sanitise operation
        if (event.getOperation() != null) {
            Types.OperationInfo op = event.getOperation();
            Types.OperationInfo sop = new Types.OperationInfo();
            sop.setProvider(op.getProvider());
            sop.setType(op.getType());
            sop.setMethod(op.getMethod());
            sop.setErrorCode(op.getErrorCode());
            sop.setErrorDetails(op.getErrorDetails());
            if (op.getParams() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> sanitizedParams = (Map<String, Object>) walk(op.getParams(), null, pattern, seen);
                sop.setParams(sanitizedParams);
            }
            result.setOperation(sop);
        }

        // Copy environment
        result.setEnvironment(event.getEnvironment());

        // Sanitise user — redact sensitive user fields
        if (event.getUser() != null) {
            Types.UserInfo u = event.getUser();
            Types.UserInfo su = new Types.UserInfo();
            su.setId(u.getId());
            su.setEmail(u.getEmail());
            su.setUsername(u.getUsername());
            for (Map.Entry<String, Object> entry : u.getExtra().entrySet()) {
                String k = entry.getKey();
                if (pattern.matcher(k).find()) {
                    su.putExtra(k, REDACTED);
                } else {
                    su.putExtra(k, entry.getValue());
                }
            }
            result.setUser(su);
        }

        // Copy breadcrumbs (already copied via BreadcrumbStore)
        if (event.getBreadcrumbs() != null) {
            result.setBreadcrumbs(new ArrayList<>(event.getBreadcrumbs()));
        }

        seen.remove(event);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Types.RequestInfo sanitizeRequestInfo(Types.RequestInfo req, Pattern pattern, Set<Object> seen) {
        Types.RequestInfo result = new Types.RequestInfo();
        result.setMethod(req.getMethod());
        result.setUrl(req.getUrl());

        // Sanitise headers
        if (req.getHeaders() != null) {
            Map<String, String> sanitizedHeaders = new HashMap<>();
            for (Map.Entry<String, String> entry : req.getHeaders().entrySet()) {
                String k = entry.getKey();
                if (SENSITIVE_HEADERS.contains(k.toLowerCase()) || pattern.matcher(k).find()) {
                    sanitizedHeaders.put(k, REDACTED);
                } else {
                    sanitizedHeaders.put(k, entry.getValue());
                }
            }
            result.setHeaders(sanitizedHeaders);
        }

        // Sanitise body (if it's a Map)
        if (req.getBody() instanceof Map) {
            result.setBody(walk(req.getBody(), null, pattern, seen));
        } else {
            result.setBody(req.getBody());
        }

        // Sanitise query
        if (req.getQuery() != null) {
            Map<String, String> sanitizedQuery = new HashMap<>();
            for (Map.Entry<String, String> entry : req.getQuery().entrySet()) {
                String k = entry.getKey();
                if (pattern.matcher(k).find()) {
                    sanitizedQuery.put(k, REDACTED);
                } else {
                    sanitizedQuery.put(k, entry.getValue());
                }
            }
            result.setQuery(sanitizedQuery);
        }

        return result;
    }
}
