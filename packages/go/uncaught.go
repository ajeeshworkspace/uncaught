// ---------------------------------------------------------------------------
// uncaught-go — Public API
// ---------------------------------------------------------------------------
//
// Package uncaught provides error monitoring for Go applications with
// automatic fingerprinting, breadcrumb tracking, and AI-powered fix prompts.
//
// Quick start:
//
//	client := uncaught.Init(&uncaught.Config{
//	    Environment: "production",
//	    Release:     "v1.0.0",
//	})
//
//	// Capture errors
//	client.CaptureError(err, nil)
//
//	// Add breadcrumbs for context
//	client.AddBreadcrumb(uncaught.Breadcrumb{
//	    Type:     uncaught.BreadcrumbNavigation,
//	    Category: "http",
//	    Message:  "GET /api/users",
//	})
// ---------------------------------------------------------------------------

package uncaught

import "sync"

var (
	globalMu     sync.RWMutex
	globalClient *UncaughtClient
)

// Init initialises the Uncaught SDK with the given configuration.
// Calling this more than once replaces the previous client instance.
// Returns the new client.
func Init(config *Config) *UncaughtClient {
	client := NewClient(config)

	globalMu.Lock()
	globalClient = client
	globalMu.Unlock()

	return client
}

// GetClient returns the current global singleton client, or nil if Init()
// has not been called.
func GetClient() *UncaughtClient {
	globalMu.RLock()
	defer globalMu.RUnlock()
	return globalClient
}

// CaptureError is a convenience wrapper that captures an error using the
// global client. Returns empty string if the global client is not initialised.
func CaptureError(err interface{}, ctx *CaptureContext) string {
	client := GetClient()
	if client == nil {
		return ""
	}
	return client.CaptureError(err, ctx)
}

// CaptureMessage is a convenience wrapper that captures a message using the
// global client.
func CaptureMessage(message string, level SeverityLevel) string {
	client := GetClient()
	if client == nil {
		return ""
	}
	return client.CaptureMessage(message, level)
}

// AddBreadcrumb is a convenience wrapper that adds a breadcrumb using the
// global client.
func AddBreadcrumb(crumb Breadcrumb) {
	client := GetClient()
	if client == nil {
		return
	}
	client.AddBreadcrumb(crumb)
}

// SetUser is a convenience wrapper that sets the user context on the global client.
func SetUser(user *UserInfo) {
	client := GetClient()
	if client == nil {
		return
	}
	client.SetUser(user)
}

// Flush flushes all queued events on the global client.
func Flush() error {
	client := GetClient()
	if client == nil {
		return nil
	}
	return client.Flush()
}

// Recover is a convenience function to be used in a defer statement.
// It recovers from panics and captures the error using the global client.
//
//	func handler() {
//	    defer uncaught.Recover(nil)
//	    // ... code that might panic
//	}
func Recover(ctx *CaptureContext) {
	client := GetClient()
	if client == nil {
		return
	}
	client.Recover(ctx)
}
