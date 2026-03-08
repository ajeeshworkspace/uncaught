// ---------------------------------------------------------------------------
// uncaught-go — PII / secret sanitizer
// ---------------------------------------------------------------------------
//
// Sanitizes UncaughtEvent payloads by redacting values whose keys match
// sensitive patterns. Uses encoding/json for deep traversal via
// marshal/unmarshal through map[string]interface{}.
// ---------------------------------------------------------------------------

package uncaught

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Default sensitive key patterns that are always redacted.
var defaultSensitiveKeys = []string{
	"password",
	"passwd",
	"secret",
	"token",
	"apikey",
	"api_key",
	"authorization",
	"credit_card",
	"creditcard",
	"card_number",
	"cvv",
	"ssn",
	"social_security",
	"private_key",
	"access_token",
	"refresh_token",
	"session_id",
	"cookie",
}

// Headers that are always stripped regardless of key matching.
var sensitiveHeaders = map[string]bool{
	"authorization": true,
	"cookie":        true,
	"set-cookie":    true,
}

const redactedValue = "[REDACTED]"
const maxStringLength = 2048

// Sanitize deep-clones and sanitises an arbitrary value by marshalling it to
// JSON, walking the resulting map structure to redact sensitive keys, and
// returning the sanitised map/slice/value.
//
// - Handles nested structures.
// - Truncates strings longer than 2048 characters.
// - Never mutates the original object.
func Sanitize(obj interface{}, additionalKeys []string) interface{} {
	pattern := buildKeyPattern(additionalKeys)

	// Marshal to JSON, then unmarshal to generic map
	data, err := json.Marshal(obj)
	if err != nil {
		return obj
	}

	var generic interface{}
	if err := json.Unmarshal(data, &generic); err != nil {
		return obj
	}

	return sanitizeWalk(generic, pattern, "")
}

// SanitizeEvent sanitises an UncaughtEvent by marshalling to JSON,
// walking the map to redact sensitive keys, and unmarshalling back.
func SanitizeEvent(event *UncaughtEvent, additionalKeys []string) *UncaughtEvent {
	pattern := buildKeyPattern(additionalKeys)

	// Marshal event to JSON
	data, err := json.Marshal(event)
	if err != nil {
		return event
	}

	// Unmarshal to generic map
	var generic map[string]interface{}
	if err := json.Unmarshal(data, &generic); err != nil {
		return event
	}

	// Walk and sanitize
	sanitized := sanitizeWalk(generic, pattern, "")

	// Marshal back to JSON
	sanitizedData, err := json.Marshal(sanitized)
	if err != nil {
		return event
	}

	// Unmarshal back to UncaughtEvent
	var result UncaughtEvent
	if err := json.Unmarshal(sanitizedData, &result); err != nil {
		return event
	}

	return &result
}

// buildKeyPattern builds a single regex that matches any of the sensitive key patterns.
func buildKeyPattern(additionalKeys []string) *regexp.Regexp {
	all := make([]string, 0, len(defaultSensitiveKeys)+len(additionalKeys))
	all = append(all, defaultSensitiveKeys...)
	all = append(all, additionalKeys...)

	escaped := make([]string, len(all))
	for i, k := range all {
		escaped[i] = regexp.QuoteMeta(k)
	}

	return regexp.MustCompile("(?i)" + strings.Join(escaped, "|"))
}

func sanitizeWalk(value interface{}, pattern *regexp.Regexp, key string) interface{} {
	// Redact if the current key is sensitive
	if key != "" && pattern.MatchString(key) {
		return redactedValue
	}

	// Check sensitive headers
	if key != "" && sensitiveHeaders[strings.ToLower(key)] {
		return redactedValue
	}

	if value == nil {
		return nil
	}

	switch v := value.(type) {
	case string:
		if len(v) > maxStringLength {
			return v[:maxStringLength] + "...[truncated]"
		}
		return v

	case float64:
		return v

	case bool:
		return v

	case []interface{}:
		result := make([]interface{}, len(v))
		for i, item := range v {
			result[i] = sanitizeWalk(item, pattern, "")
		}
		return result

	case map[string]interface{}:
		result := make(map[string]interface{})
		for k, val := range v {
			result[k] = sanitizeWalk(val, pattern, k)
		}
		return result

	default:
		return v
	}
}
