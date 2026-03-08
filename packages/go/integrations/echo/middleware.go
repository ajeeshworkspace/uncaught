// ---------------------------------------------------------------------------
// uncaught-go — Echo framework middleware integration
// ---------------------------------------------------------------------------
//
// This package provides panic recovery middleware for the Echo web framework.
// Since we avoid importing echo as a direct dependency, users should use
// the provided functions within their Echo middleware.
//
// Usage:
//
//	import (
//	    "github.com/labstack/echo/v4"
//	    uncaught "github.com/uncaughtdev/uncaught-go"
//	    uncaughtecho "github.com/uncaughtdev/uncaught-go/integrations/echo"
//	)
//
//	client := uncaught.Init(&uncaught.Config{...})
//	e := echo.New()
//
//	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
//	    return func(c echo.Context) error {
//	        return uncaughtecho.HandleRequest(client, c.Request().Method, c.Request().URL.String(), func() error {
//	            return next(c)
//	        })
//	    }
//	})
// ---------------------------------------------------------------------------

package echo

import (
	"fmt"
	"runtime"

	uncaught "github.com/uncaughtdev/uncaught-go"
)

// HandleRequest wraps a handler call with panic recovery and captures errors.
// The handlerFn should call the next Echo handler in the chain.
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

			// Re-panic so Echo's default recovery can handle it
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

// RecoverHandler is a deferred panic handler for Echo middleware.
//
// Usage:
//
//	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
//	    return func(c echo.Context) error {
//	        defer uncaughtecho.RecoverHandler(client, c.Request().Method, c.Request().URL.String())
//	        return next(c)
//	    }
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
