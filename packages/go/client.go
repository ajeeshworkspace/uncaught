// ---------------------------------------------------------------------------
// uncaught-go — UncaughtClient (SDK entry-point)
// ---------------------------------------------------------------------------

package uncaught

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"runtime"
	"strings"
	"sync"
)

const (
	sdkName    = "uncaught-go"
	sdkVersion = "0.1.0"
)

// UncaughtClient is the main SDK client that captures errors and sends them
// through the configured transport pipeline.
type UncaughtClient struct {
	config           *Config
	breadcrumbs      *BreadcrumbStore
	transport        Transport
	rateLimiter      *RateLimiter
	sessionID        string
	seenFingerprints map[string]bool
	user             *UserInfo
	mu               sync.Mutex
}

// NewClient creates a new UncaughtClient with the given configuration.
func NewClient(config *Config) *UncaughtClient {
	if config == nil {
		config = &Config{}
	}

	// Apply defaults
	maxBreadcrumbs := config.MaxBreadcrumbs
	if maxBreadcrumbs <= 0 {
		maxBreadcrumbs = 20
	}

	maxEventsPerMinute := config.MaxEventsPerMinute
	if maxEventsPerMinute <= 0 {
		maxEventsPerMinute = 30
	}

	return &UncaughtClient{
		config:           config,
		breadcrumbs:      NewBreadcrumbStore(maxBreadcrumbs),
		transport:        createTransport(config),
		rateLimiter:      NewRateLimiter(maxEventsPerMinute, 5),
		sessionID:        GenerateUUID(),
		seenFingerprints: make(map[string]bool),
	}
}

// GetConfig returns the current SDK configuration.
func (c *UncaughtClient) GetConfig() *Config {
	return c.config
}

// CaptureError captures an error and sends it through the transport pipeline.
// Accepts error, string, or any type. Returns the event ID, or empty string if dropped.
func (c *UncaughtClient) CaptureError(err interface{}, ctx *CaptureContext) string {
	defer func() {
		if r := recover(); r != nil {
			c.debugLog("CaptureError panicked: %v", r)
		}
	}()

	if !c.config.isEnabled() {
		return ""
	}

	// Normalise error
	errorInfo := c.normaliseError(err)

	if ctx != nil && ctx.ComponentStack != "" {
		errorInfo.ComponentStack = ctx.ComponentStack
	}

	// Check ignoreErrors
	if c.shouldIgnore(errorInfo.Message) {
		c.debugLog("Event ignored by ignoreErrors filter")
		return ""
	}

	// Generate fingerprint
	fingerprint := GenerateFingerprint(errorInfo.Type, errorInfo.Message, errorInfo.Stack)

	// Rate limit check
	if !c.rateLimiter.ShouldAllow(fingerprint) {
		c.debugLog("Rate-limited: %s", fingerprint)
		return ""
	}

	// Collect breadcrumbs
	crumbs := c.breadcrumbs.GetAll()
	if crumbs == nil {
		crumbs = []Breadcrumb{}
	}

	// Detect environment
	environment := DetectEnvironment()
	envCopy := *environment

	// Attach deployment environment from config
	if c.config.Environment != "" {
		envCopy.Deploy = c.config.Environment
	}

	// Determine level
	level := SeverityLevel(Error)
	if ctx != nil && ctx.Level != "" {
		level = ctx.Level
	}

	// Build user info
	c.mu.Lock()
	var user *UserInfo
	if c.user != nil {
		userCopy := *c.user
		user = &userCopy
	}
	c.mu.Unlock()

	// Build event
	eventID := GenerateUUID()
	event := &UncaughtEvent{
		EventID:     eventID,
		Timestamp:   ISOTimestamp(),
		ProjectKey:  c.config.ProjectKey,
		Level:       level,
		Fingerprint: fingerprint,
		Release:     c.config.Release,
		Error:       errorInfo,
		Breadcrumbs: crumbs,
		Environment: &envCopy,
		User:        user,
		FixPrompt:   "", // Set below
		SDK: SdkInfo{
			Name:    sdkName,
			Version: sdkVersion,
		},
	}

	if ctx != nil {
		event.Request = ctx.Request
		event.Operation = ctx.Operation
	}

	// Build fix prompt
	event.FixPrompt = BuildFixPrompt(event)

	// beforeSend hook
	if c.config.BeforeSend != nil {
		result := c.config.BeforeSend(event)
		if result == nil {
			c.debugLog("Event dropped by beforeSend")
			return ""
		}
		event = result
	}

	// Send
	if err := c.transport.Send(event); err != nil {
		c.debugLog("Transport send failed: %v", err)
	}
	c.debugLog("Captured event: %s (%s)", eventID, fingerprint)

	// Webhook notification (new fingerprints only)
	c.mu.Lock()
	isNew := !c.seenFingerprints[fingerprint]
	c.seenFingerprints[fingerprint] = true
	c.mu.Unlock()

	if c.config.WebhookURL != "" && isNew {
		go c.sendWebhook(event)
	}

	return eventID
}

// CaptureMessage captures a plain message (not backed by an error).
func (c *UncaughtClient) CaptureMessage(message string, level SeverityLevel) string {
	if level == "" {
		level = Info
	}
	return c.CaptureError(fmt.Errorf("%s", message), &CaptureContext{Level: level})
}

// AddBreadcrumb adds a breadcrumb to the ring buffer.
func (c *UncaughtClient) AddBreadcrumb(crumb Breadcrumb) {
	if !c.config.isEnabled() {
		return
	}
	c.breadcrumbs.Add(crumb)
}

// SetUser sets user context that will be attached to subsequent events.
func (c *UncaughtClient) SetUser(user *UserInfo) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if user != nil {
		userCopy := *user
		c.user = &userCopy
	} else {
		c.user = nil
	}
}

// Flush flushes all queued events to the transport.
func (c *UncaughtClient) Flush() error {
	return c.transport.Flush()
}

// Recover can be called in a deferred function to capture panics.
//
//	defer client.Recover(nil)
func (c *UncaughtClient) Recover(ctx *CaptureContext) {
	if r := recover(); r != nil {
		// Build a stack trace
		buf := make([]byte, 16384)
		n := runtime.Stack(buf, false)
		stack := string(buf[:n])

		errorInfo := c.normaliseError(r)
		errorInfo.Stack = stack

		c.CaptureError(errorInfo, ctx)
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (c *UncaughtClient) normaliseError(err interface{}) ErrorInfo {
	switch e := err.(type) {
	case error:
		// Get a stack trace
		buf := make([]byte, 16384)
		n := runtime.Stack(buf, false)
		stack := string(buf[:n])

		errType := fmt.Sprintf("%T", e)
		// Clean up the type name
		if errType == "*errors.errorString" || errType == "*fmt.wrapError" {
			errType = "Error"
		}
		if strings.HasPrefix(errType, "*") {
			errType = errType[1:]
		}

		return ErrorInfo{
			Message: e.Error(),
			Type:    errType,
			Stack:   stack,
		}

	case ErrorInfo:
		return e

	case string:
		return ErrorInfo{
			Message: e,
			Type:    "StringError",
		}

	default:
		return ErrorInfo{
			Message: fmt.Sprintf("%v", e),
			Type:    "UnknownError",
		}
	}
}

func (c *UncaughtClient) shouldIgnore(message string) bool {
	for _, pattern := range c.config.IgnoreErrors {
		if strings.Contains(message, pattern) {
			return true
		}
	}
	return false
}

func (c *UncaughtClient) sendWebhook(event *UncaughtEvent) {
	defer func() {
		recover() // Never crash from webhook
	}()

	env := ""
	if event.Environment != nil {
		env = event.Environment.Deploy
	}

	payload := map[string]interface{}{
		"title":       event.Error.Message,
		"errorType":   event.Error.Type,
		"fingerprint": event.Fingerprint,
		"level":       event.Level,
		"timestamp":   event.Timestamp,
		"release":     event.Release,
		"environment": env,
		"fixPrompt":   event.FixPrompt,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return
	}

	req, err := http.NewRequest("POST", c.config.WebhookURL, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	client.Do(req) //nolint: errcheck — fire-and-forget
}

func (c *UncaughtClient) debugLog(format string, args ...interface{}) {
	if c.config.Debug {
		log.Printf("[uncaught] "+format, args...)
	}
}
