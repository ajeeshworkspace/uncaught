// ---------------------------------------------------------------------------
// uncaught-go — local file transport
// ---------------------------------------------------------------------------
//
// Writes events to the .uncaught/ directory in the same format as the
// TypeScript SDK, enabling cross-language compatibility.
//
// Directory structure:
//
//	.uncaught/
//	  events/
//	    <fingerprint>/
//	      event-<timestamp>.json
//	      latest.json
//	  fix-prompts/
//	    <fingerprint>.md
//	  issues.json
// ---------------------------------------------------------------------------

package uncaught

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// LocalFileTransport writes events to the local .uncaught/ directory.
type LocalFileTransport struct {
	mu      sync.Mutex
	baseDir string
	inited  bool
}

// NewLocalFileTransport creates a new local file transport.
// If baseDir is empty, it defaults to "./.uncaught" relative to the working directory.
func NewLocalFileTransport(baseDir string) *LocalFileTransport {
	if baseDir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			cwd = "."
		}
		baseDir = filepath.Join(cwd, ".uncaught")
	}
	return &LocalFileTransport{
		baseDir: baseDir,
	}
}

// Send writes an event to the .uncaught/ directory.
func (t *LocalFileTransport) Send(event *UncaughtEvent) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if err := t.init(); err != nil {
		return fmt.Errorf("transport init failed: %w", err)
	}

	fp := event.Fingerprint
	eventDir := filepath.Join(t.baseDir, "events", fp)

	// Ensure event directory exists
	if err := os.MkdirAll(eventDir, 0755); err != nil {
		return fmt.Errorf("mkdir events/%s: %w", fp, err)
	}

	// Marshal event to JSON
	eventJSON, err := json.MarshalIndent(event, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	// Write timestamped event file (atomic: .tmp -> rename)
	ts := strings.NewReplacer(":", "-", ".", "-").Replace(event.Timestamp)
	eventFile := fmt.Sprintf("event-%s.json", ts)
	eventPath := filepath.Join(eventDir, eventFile)
	if err := atomicWrite(eventPath, eventJSON); err != nil {
		return fmt.Errorf("write event file: %w", err)
	}

	// Write / overwrite latest.json
	latestPath := filepath.Join(eventDir, "latest.json")
	if err := atomicWrite(latestPath, eventJSON); err != nil {
		return fmt.Errorf("write latest.json: %w", err)
	}

	// Write fix-prompt Markdown file
	promptFile := fmt.Sprintf("%s.md", fp)
	promptPath := filepath.Join(t.baseDir, "fix-prompts", promptFile)
	if err := atomicWrite(promptPath, []byte(event.FixPrompt)); err != nil {
		return fmt.Errorf("write fix-prompt: %w", err)
	}

	// Update issues.json index
	if err := t.updateIssuesIndex(event, eventFile, promptFile); err != nil {
		return fmt.Errorf("update issues.json: %w", err)
	}

	return nil
}

// Flush is a no-op for the local file transport since writes are synchronous.
func (t *LocalFileTransport) Flush() error {
	return nil
}

// init ensures the directory structure exists and .gitignore is updated.
func (t *LocalFileTransport) init() error {
	if t.inited {
		return nil
	}

	// Create directory structure
	if err := os.MkdirAll(filepath.Join(t.baseDir, "events"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(t.baseDir, "fix-prompts"), 0755); err != nil {
		return err
	}

	// Auto-add .uncaught/ to .gitignore
	t.ensureGitignore()

	t.inited = true
	return nil
}

// ensureGitignore adds .uncaught/ to .gitignore if not already present.
func (t *LocalFileTransport) ensureGitignore() {
	// Try to find .gitignore relative to baseDir's parent
	gitignorePath := filepath.Join(filepath.Dir(t.baseDir), ".gitignore")

	content, err := os.ReadFile(gitignorePath)
	if err != nil {
		content = []byte{}
	}

	if !strings.Contains(string(content), ".uncaught") {
		line := "\n# Uncaught local error store\n.uncaught/\n"
		f, err := os.OpenFile(gitignorePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return // Non-critical
		}
		defer f.Close()
		f.WriteString(line)
	}
}

// updateIssuesIndex reads, updates, and atomically writes the issues.json index.
func (t *LocalFileTransport) updateIssuesIndex(event *UncaughtEvent, eventFile, promptFile string) error {
	indexPath := filepath.Join(t.baseDir, "issues.json")

	// Read existing issues
	var issues []IssueEntry
	data, err := os.ReadFile(indexPath)
	if err == nil {
		json.Unmarshal(data, &issues) // Ignore errors — start fresh if malformed
	}

	// Determine user ID
	userID := "anonymous"
	if event.User != nil {
		if event.User.ID != "" {
			userID = event.User.ID
		} else if event.User.Email != "" {
			userID = event.User.Email
		}
	}

	// Find existing issue for this fingerprint
	existingIdx := -1
	for i, issue := range issues {
		if issue.Fingerprint == event.Fingerprint {
			existingIdx = i
			break
		}
	}

	if existingIdx >= 0 {
		// Update existing issue
		existing := &issues[existingIdx]
		existing.Count++
		existing.LastSeen = event.Timestamp
		existing.LatestEventFile = eventFile
		existing.FixPromptFile = promptFile

		// Add user if not already present
		found := false
		for _, u := range existing.AffectedUsers {
			if u == userID {
				found = true
				break
			}
		}
		if !found {
			existing.AffectedUsers = append(existing.AffectedUsers, userID)
		}

		// Re-open if previously resolved
		if existing.Status == Resolved {
			existing.Status = Open
		}
	} else {
		// Create new issue entry
		env := ""
		if event.Environment != nil {
			env = event.Environment.Deploy
		}
		issues = append(issues, IssueEntry{
			Fingerprint:     event.Fingerprint,
			Title:           event.Error.Message,
			ErrorType:       event.Error.Type,
			Count:           1,
			AffectedUsers:   []string{userID},
			FirstSeen:       event.Timestamp,
			LastSeen:        event.Timestamp,
			Status:          Open,
			FixPromptFile:   promptFile,
			LatestEventFile: eventFile,
			Release:         event.Release,
			Environment:     env,
		})
	}

	// Atomic write
	issuesJSON, err := json.MarshalIndent(issues, "", "  ")
	if err != nil {
		return err
	}
	return atomicWrite(indexPath, issuesJSON)
}

// atomicWrite writes data to a file atomically using tmp + rename.
func atomicWrite(path string, data []byte) error {
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

// ConsoleTransport logs events to stderr (useful for debugging).
type ConsoleTransport struct{}

// NewConsoleTransport creates a new console transport.
func NewConsoleTransport() *ConsoleTransport {
	return &ConsoleTransport{}
}

// Send logs the event to stderr.
func (t *ConsoleTransport) Send(event *UncaughtEvent) error {
	fmt.Fprintf(os.Stderr, "[uncaught] %s: %s\n", event.Error.Type, event.Error.Message)
	fmt.Fprintf(os.Stderr, "  Event ID: %s\n", event.EventID)
	fmt.Fprintf(os.Stderr, "  Fingerprint: %s\n", event.Fingerprint)
	if event.Error.Stack != "" {
		fmt.Fprintf(os.Stderr, "  Stack:\n%s\n", event.Error.Stack)
	}
	if event.FixPrompt != "" {
		fmt.Fprintf(os.Stderr, "  Fix Prompt:\n%s\n", event.FixPrompt)
	}
	return nil
}

// Flush is a no-op for the console transport.
func (t *ConsoleTransport) Flush() error {
	return nil
}

// createTransport creates the appropriate transport based on config.
func createTransport(config *Config) Transport {
	mode := config.Transport
	if mode == "" {
		mode = TransportLocal
	}

	switch mode {
	case TransportConsole:
		return NewConsoleTransport()
	case TransportLocal:
		return NewLocalFileTransport(config.LocalOutputDir)
	default:
		return NewLocalFileTransport(config.LocalOutputDir)
	}
}
