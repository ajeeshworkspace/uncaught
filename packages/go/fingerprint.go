// ---------------------------------------------------------------------------
// uncaught-go — error fingerprinting
// ---------------------------------------------------------------------------
//
// Generate a stable fingerprint for an error so that duplicate occurrences
// of the same bug are grouped together.
//
// The fingerprint is an 8-character hex string derived from:
//  1. The error type.
//  2. The normalised error message (volatile parts stripped).
//  3. The top 3 stack frames (file + function name, no line/col numbers).
// ---------------------------------------------------------------------------

package uncaught

import (
	"fmt"
	"regexp"
	"strings"
)

// GenerateFingerprint produces an 8-character hex fingerprint for an error.
func GenerateFingerprint(errType, message, stack string) string {
	if errType == "" {
		errType = "Error"
	}
	normalisedMessage := NormaliseMessage(message)
	frames := ExtractTopFrames(stack, 3)

	parts := []string{errType, normalisedMessage}
	parts = append(parts, frames...)
	input := strings.Join(parts, "\n")
	return Djb2(input)
}

// ---------------------------------------------------------------------------
// Internal helpers (exported for testing)
// ---------------------------------------------------------------------------

// Regex patterns for message normalisation — compiled once.
var (
	// UUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
	uuidRegex = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)

	// Hex strings: 8+ hex chars in a row, word-bounded
	hexRegex = regexp.MustCompile(`(?i)\b[0-9a-f]{8,}\b`)

	// Numbers longer than 3 digits
	numRegex = regexp.MustCompile(`\b\d{4,}\b`)

	// ISO timestamps
	timestampRegex = regexp.MustCompile(`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?`)

	// Hashed file paths — replace the hash portion
	hashedFileRegex = regexp.MustCompile(`([/\\])[a-zA-Z0-9_-]+[-.][a-f0-9]{6,}\.(js|ts|mjs|cjs|jsx|tsx)`)
)

// NormaliseMessage strips volatile substrings from an error message so that
// trivially-different occurrences of the same bug hash identically.
func NormaliseMessage(msg string) string {
	// Order matches the TypeScript implementation exactly:
	// 1. UUIDs
	msg = uuidRegex.ReplaceAllString(msg, "<UUID>")
	// 2. Hex strings (8+ hex chars)
	msg = hexRegex.ReplaceAllString(msg, "<HEX>")
	// 3. Numbers longer than 3 digits
	msg = numRegex.ReplaceAllString(msg, "<NUM>")
	// 4. ISO timestamps
	msg = timestampRegex.ReplaceAllString(msg, "<TIMESTAMP>")
	// 5. Hashed file paths
	msg = hashedFileRegex.ReplaceAllString(msg, "${1}<FILE>.${2}")
	return strings.TrimSpace(msg)
}

// V8 stack frame patterns:
//
//	"    at FunctionName (file:line:col)"
//	"    at file:line:col"
var v8Regex = regexp.MustCompile(`at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?`)

// SpiderMonkey / JavaScriptCore: "functionName@file:line:col"
var smRegex = regexp.MustCompile(`^(.+?)@(.+?):\d+:\d+`)

// Go stack trace patterns:
//
//	goroutine N [running]:
//	package.Function(args)
//	    /path/to/file.go:line +0xNN
var goFuncRegex = regexp.MustCompile(`^([a-zA-Z0-9_./\-]+)\(`)
var goFileRegex = regexp.MustCompile(`^\t(.+\.go):\d+`)

// ExtractTopFrames extracts the top N stack frames as normalised "file:function" strings.
// Supports V8, SpiderMonkey, and Go stack trace formats.
func ExtractTopFrames(stack string, count int) []string {
	if stack == "" {
		return nil
	}

	lines := strings.Split(stack, "\n")
	frames := make([]string, 0, count)

	// Try JavaScript formats first
	for _, line := range lines {
		if len(frames) >= count {
			break
		}

		trimmed := strings.TrimSpace(line)

		// V8 format
		if matches := v8Regex.FindStringSubmatch(trimmed); matches != nil {
			fn := matches[1]
			if fn == "" {
				fn = "<anonymous>"
			}
			file := normalisePath(matches[2])
			frames = append(frames, file+":"+fn)
			continue
		}

		// SpiderMonkey / JavaScriptCore format
		if matches := smRegex.FindStringSubmatch(trimmed); matches != nil {
			fn := matches[1]
			if fn == "" {
				fn = "<anonymous>"
			}
			file := normalisePath(matches[2])
			frames = append(frames, file+":"+fn)
			continue
		}
	}

	// If no JS frames found, try Go stack trace format
	if len(frames) == 0 {
		var pendingFunc string
		for _, line := range lines {
			if len(frames) >= count {
				break
			}

			// Skip goroutine header
			if strings.HasPrefix(line, "goroutine ") {
				continue
			}

			// Function line: "package.Function(args)"
			if matches := goFuncRegex.FindStringSubmatch(line); matches != nil {
				pendingFunc = matches[1]
				continue
			}

			// File line: "\t/path/to/file.go:line +0xNN"
			if matches := goFileRegex.FindStringSubmatch(line); matches != nil && pendingFunc != "" {
				file := normalisePath(matches[1])
				// Extract just the function name (last component after /)
				funcName := pendingFunc
				if idx := strings.LastIndex(funcName, "/"); idx >= 0 {
					funcName = funcName[idx+1:]
				}
				frames = append(frames, file+":"+funcName)
				pendingFunc = ""
				continue
			}
		}
	}

	return frames
}

// normalisePath normalises a file path by stripping query strings/hashes
// and collapsing absolute filesystem prefixes — keeping only the filename.
func normalisePath(p string) string {
	// Strip query / hash
	if idx := strings.IndexAny(p, "?#"); idx >= 0 {
		p = p[:idx]
	}

	// Collapse deep node_modules paths
	if idx := strings.Index(p, "/node_modules/"); idx >= 0 {
		p = p[idx+1:] // keep "node_modules/..."
	}

	// Strip origin in URLs (http://host or https://host)
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		// Find the "://" then skip to the next "/" after the host
		schemeEnd := strings.Index(p, "://")
		if schemeEnd >= 0 {
			afterScheme := p[schemeEnd+3:] // everything after "://"
			if slashIdx := strings.Index(afterScheme, "/"); slashIdx >= 0 {
				p = afterScheme[slashIdx:] // keep from the path onward
			}
		}
	}

	// Keep only filename — find last / or \
	lastSlash := strings.LastIndexAny(p, "/\\")
	if lastSlash >= 0 {
		p = p[lastSlash+1:]
	}

	return p
}

// Djb2 computes the DJB2 hash and returns an 8-character lowercase hex string.
// This implementation produces identical output to the JavaScript version:
// - We iterate over Unicode code points (runes), matching JS charCodeAt() for BMP chars.
// - For characters above U+FFFF (surrogate pairs in JS), we split into UTF-16 surrogates.
// - int32 arithmetic naturally wraps on overflow (matching JS `| 0`)
// - casting to uint32 matches JS `>>> 0`
func Djb2(str string) string {
	var hash int32 = 5381
	for _, r := range str {
		if r <= 0xFFFF {
			// BMP character — single UTF-16 code unit, matches charCodeAt directly
			hash = ((hash << 5) + hash) + int32(r)
		} else {
			// Supplementary character — split into UTF-16 surrogate pair
			r -= 0x10000
			high := 0xD800 + (r >> 10)
			low := 0xDC00 + (r & 0x3FF)
			hash = ((hash << 5) + hash) + int32(high)
			hash = ((hash << 5) + hash) + int32(low)
		}
	}
	return fmt.Sprintf("%08x", uint32(hash))
}
