// ---------------------------------------------------------------------------
// uncaught-go — Fiber framework middleware integration
// ---------------------------------------------------------------------------
//
// This package provides panic recovery middleware for the Fiber web framework.
// Since we avoid importing fiber as a direct dependency, users should use
// the provided functions within their Fiber middleware.
//
// Usage:
//
//	import (
//	    "github.com/gofiber/fiber/v2"
//	    uncaught "github.com/uncaughtdev/uncaught-go"
//	    uncaughtfiber "github.com/uncaughtdev/uncaught-go/integrations/fiber"
//	)
//
//	client := uncaught.Init(&uncaught.Config{...})
//	app := fiber.New()
//
//	app.Use(func(c *fiber.Ctx) error {
//	    return uncaughtfiber.HandleRequest(client, c.Method(), c.OriginalURL(), func() error {
//	        return c.Next()
//	    })
//	})
// ---------------------------------------------------------------------------

package fiber

import (
	"fmt"
	"runtime"

	uncaught "github.com/uncaughtdev/uncaught-go"
)

// HandleRequest wraps a handler call with panic recovery and captures errors.
// The handlerFn should call the next Fiber handler in the chain.
// If the handler returns a non-nil error, it is also captured.
func HandleRequest(client *uncaught.UncaughtClient, method, url string, handlerFn func() error) (returnErr error) {
	// Add breadcrumb
	client.AddBreadcrumb(uncaught.Breadcrumb{
		Type:     uncaught.BreadcrumbNavigation,
		Category: "http",
		Message:  fmt.Sprintf("%s %s", method, url),
	})

	defer func() {
		if r := recover(); r != nil {
			buf := make([]byte, 16384)
			n := runtime.Stack(buf, false)
			stack := string(buf[:n])

			errorInfo := uncaught.ErrorInfo{
				Message: fmt.Sprintf("%v", r),
				Type:    fmt.Sprintf("%T", r),
				Stack:   stack,
			}

			client.CaptureError(errorInfo, &uncaught.CaptureContext{
				Request: &uncaught.RequestInfo{
					Method: method,
					URL:    url,
				},
				Level: uncaught.Fatal,
			})

			// Re-panic so Fiber's default recovery can handle it
			panic(r)
		}
	}()

	err := handlerFn()
	if err != nil {
		// Capture errors returned by handlers
		client.CaptureError(err, &uncaught.CaptureContext{
			Request: &uncaught.RequestInfo{
				Method: method,
				URL:    url,
			},
			Level: uncaught.Error,
		})
	}
	return err
}

// RecoverHandler is a deferred panic handler for Fiber middleware.
//
// Usage:
//
//	app.Use(func(c *fiber.Ctx) error {
//	    defer uncaughtfiber.RecoverHandler(client, c.Method(), c.OriginalURL())
//	    return c.Next()
//	})
func RecoverHandler(client *uncaught.UncaughtClient, method, url string) {
	if r := recover(); r != nil {
		buf := make([]byte, 16384)
		n := runtime.Stack(buf, false)
		stack := string(buf[:n])

		errorInfo := uncaught.ErrorInfo{
			Message: fmt.Sprintf("%v", r),
			Type:    fmt.Sprintf("%T", r),
			Stack:   stack,
		}

		client.CaptureError(errorInfo, &uncaught.CaptureContext{
			Request: &uncaught.RequestInfo{
				Method: method,
				URL:    url,
			},
			Level: uncaught.Fatal,
		})

		// Re-panic
		panic(r)
	}
}
