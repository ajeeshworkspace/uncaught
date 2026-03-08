// ---------------------------------------------------------------------------
// uncaught-go — fix-prompt builder
// ---------------------------------------------------------------------------
//
// Build a structured Markdown prompt that can be pasted into an AI assistant
// to diagnose and fix the production error described by an event.
// ---------------------------------------------------------------------------

package uncaught

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// BuildFixPrompt builds a structured Markdown prompt for AI-assisted debugging.
// Empty sections are omitted to keep the prompt concise.
func BuildFixPrompt(event *UncaughtEvent) string {
	if event == nil {
		return ""
	}

	var sections []string

	// Intro
	sections = append(sections,
		"I have a production bug in my application that I need help diagnosing and fixing.\n")

	// Error section
	{
		errType := event.Error.Type
		if errType == "" {
			errType = "Error"
		}
		errMsg := event.Error.Message
		if errMsg == "" {
			errMsg = "(no message)"
		}

		lines := []string{"## Error", ""}
		lines = append(lines, fmt.Sprintf("- **Type:** %s", errType))
		lines = append(lines, fmt.Sprintf("- **Message:** %s", errMsg))

		location := extractLocation(event.Error.Stack)
		if location != "" {
			lines = append(lines, fmt.Sprintf("- **Location:** %s", location))
		}

		sections = append(sections, strings.Join(lines, "\n"))
	}

	// Stack Trace section
	stackSource := event.Error.ResolvedStack
	if stackSource == "" {
		stackSource = event.Error.Stack
	}
	if stackSource != "" {
		stackLines := strings.Split(stackSource, "\n")
		if len(stackLines) > 15 {
			stackLines = stackLines[:15]
		}
		trimmed := make([]string, len(stackLines))
		for i, l := range stackLines {
			trimmed[i] = strings.TrimRight(l, " \t\r")
		}
		frames := strings.Join(trimmed, "\n")

		label := "Stack Trace"
		if event.Error.ResolvedStack != "" {
			label = "Stack Trace (source-mapped)"
		}
		sections = append(sections, fmt.Sprintf("## %s\n\n```\n%s\n```", label, frames))
	}

	// Failed Operation section
	if event.Operation != nil {
		sections = append(sections, formatOperation(event.Operation))
	}

	// HTTP Request Context section
	if event.Request != nil {
		sections = append(sections, formatRequest(event.Request))
	}

	// User Session (last 5 breadcrumbs) section
	if len(event.Breadcrumbs) > 0 {
		sections = append(sections, formatBreadcrumbs(event.Breadcrumbs))
	}

	// Environment section
	if event.Environment != nil {
		sections = append(sections, formatEnvironment(event.Environment))
	}

	// React Component Stack section
	if event.Error.ComponentStack != "" {
		sections = append(sections,
			fmt.Sprintf("## React Component Stack\n\n```\n%s\n```",
				strings.TrimSpace(event.Error.ComponentStack)))
	}

	// What I need section
	sections = append(sections, strings.Join([]string{
		"## What I need",
		"",
		"1. **Root cause analysis** — explain why this error is occurring.",
		"2. **A fix** — provide the corrected code with an explanation of the changes.",
		"3. **Prevention** — suggest any guards or tests to prevent this from happening again.",
	}, "\n"))

	return strings.Join(sections, "\n\n") + "\n"
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// v8LocationRegex matches V8-style stack locations.
var v8LocationRegex = regexp.MustCompile(`at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?`)

// smLocationRegex matches SpiderMonkey/JSC-style stack locations.
var smLocationRegex = regexp.MustCompile(`@(.+?:\d+:\d+)`)

// goLocationRegex matches Go-style file:line locations in stack traces.
var goLocationRegex = regexp.MustCompile(`^\t(.+\.go:\d+)`)

// extractLocation extracts the top-most location (file:line:col) from a stack trace.
func extractLocation(stack string) string {
	if stack == "" {
		return ""
	}

	for _, line := range strings.Split(stack, "\n") {
		trimmed := strings.TrimSpace(line)

		// V8 format
		if matches := v8LocationRegex.FindStringSubmatch(trimmed); matches != nil {
			return matches[1]
		}

		// SpiderMonkey / JSC format
		if matches := smLocationRegex.FindStringSubmatch(trimmed); matches != nil {
			return matches[1]
		}

		// Go format
		if matches := goLocationRegex.FindStringSubmatch(line); matches != nil {
			return matches[1]
		}
	}

	return ""
}

func formatOperation(op *OperationInfo) string {
	lines := []string{"## Failed Operation", ""}
	lines = append(lines, fmt.Sprintf("- **Provider:** %s", op.Provider))
	lines = append(lines, fmt.Sprintf("- **Type:** %s", op.Type))
	lines = append(lines, fmt.Sprintf("- **Method:** %s", op.Method))
	if op.Params != nil {
		lines = append(lines, "- **Params:**")
		lines = append(lines, "```json")
		paramsJSON, err := json.MarshalIndent(op.Params, "", "  ")
		if err != nil {
			lines = append(lines, "{}")
		} else {
			lines = append(lines, string(paramsJSON))
		}
		lines = append(lines, "```")
	}
	if op.ErrorCode != "" {
		lines = append(lines, fmt.Sprintf("- **Error Code:** %s", op.ErrorCode))
	}
	if op.ErrorDetails != "" {
		lines = append(lines, fmt.Sprintf("- **Error Details:** %s", op.ErrorDetails))
	}
	return strings.Join(lines, "\n")
}

func formatRequest(req *RequestInfo) string {
	lines := []string{"## HTTP Request Context", ""}
	if req.Method != "" {
		lines = append(lines, fmt.Sprintf("- **Method:** %s", req.Method))
	}
	if req.URL != "" {
		lines = append(lines, fmt.Sprintf("- **URL:** %s", req.URL))
	}
	if req.Body != nil {
		lines = append(lines, "- **Body:**")
		lines = append(lines, "```json")
		switch v := req.Body.(type) {
		case string:
			lines = append(lines, v)
		default:
			bodyJSON, err := json.MarshalIndent(v, "", "  ")
			if err != nil {
				lines = append(lines, "{}")
			} else {
				lines = append(lines, string(bodyJSON))
			}
		}
		lines = append(lines, "```")
	}
	return strings.Join(lines, "\n")
}

func formatBreadcrumbs(crumbs []Breadcrumb) string {
	// Take the last 5 breadcrumbs
	start := 0
	if len(crumbs) > 5 {
		start = len(crumbs) - 5
	}
	recent := crumbs[start:]

	lines := []string{"## User Session", ""}
	for _, crumb := range recent {
		timeStr := formatTime(crumb.Timestamp)
		lines = append(lines, fmt.Sprintf("- `%s` **[%s]** %s", timeStr, crumb.Type, crumb.Message))
	}
	return strings.Join(lines, "\n")
}

// formatTime extracts HH:MM:SS from an ISO timestamp.
func formatTime(iso string) string {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		// Try other formats
		t, err = time.Parse(time.RFC3339, iso)
		if err != nil {
			return iso
		}
	}
	return fmt.Sprintf("%02d:%02d:%02d", t.Hour(), t.Minute(), t.Second())
}

func formatEnvironment(env *EnvironmentInfo) string {
	lines := []string{"## Environment", ""}

	entries := []struct {
		label string
		value string
	}{
		{"Deploy Environment", env.Deploy},
		{"Framework", env.Framework},
		{"Framework Version", env.FrameworkVersion},
		{"Runtime", env.Runtime},
		{"Runtime Version", env.RuntimeVersion},
		{"Platform", env.Platform},
		{"Browser", combineBrowser(env.Browser, env.BrowserVersion)},
		{"OS", env.OS},
		{"Device", env.DeviceType},
		{"Locale", env.Locale},
		{"Timezone", env.Timezone},
		{"URL", env.URL},
	}

	for _, entry := range entries {
		if entry.value != "" {
			lines = append(lines, fmt.Sprintf("- **%s:** %s", entry.label, entry.value))
		}
	}

	return strings.Join(lines, "\n")
}

func combineBrowser(name, version string) string {
	if name == "" {
		return ""
	}
	if version != "" {
		return strings.TrimSpace(name + " " + version)
	}
	return name
}
