// ---------------------------------------------------------------------------
// uncaught-go — utility helpers
// ---------------------------------------------------------------------------

package uncaught

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"
)

// GenerateUUID generates a UUID v4 string using crypto/rand.
func GenerateUUID() string {
	uuid := make([]byte, 16)
	_, err := rand.Read(uuid)
	if err != nil {
		// Fallback: return a zero UUID rather than panic
		return "00000000-0000-4000-8000-000000000000"
	}

	// Set version 4 bits
	uuid[6] = (uuid[6] & 0x0f) | 0x40
	// Set variant bits
	uuid[8] = (uuid[8] & 0x3f) | 0x80

	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		uuid[0:4], uuid[4:6], uuid[6:8], uuid[8:10], uuid[10:16])
}

// ISOTimestamp returns the current date/time as an ISO 8601 string.
func ISOTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

// SafeStringify safely serialises a value to JSON, handling errors gracefully.
func SafeStringify(obj interface{}) string {
	data, err := json.Marshal(obj)
	if err != nil {
		return `"[Unserializable]"`
	}
	return string(data)
}

// SafeStringifyIndent safely serialises a value to indented JSON.
func SafeStringifyIndent(obj interface{}) string {
	data, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return `"[Unserializable]"`
	}
	return string(data)
}

// Truncate truncates a string to maxLen characters, appending "..." when truncated.
func Truncate(str string, maxLen int) string {
	if maxLen <= 0 {
		maxLen = 200
	}
	if len(str) <= maxLen {
		return str
	}
	if maxLen <= 3 {
		return str[:maxLen]
	}
	return str[:maxLen-3] + "..."
}

// BoolPtr returns a pointer to the given bool value.
// Useful for setting Config.Enabled.
func BoolPtr(b bool) *bool {
	return &b
}
