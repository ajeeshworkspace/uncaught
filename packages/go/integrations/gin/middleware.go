// ---------------------------------------------------------------------------
// uncaught-go — Gin framework middleware integration
// ---------------------------------------------------------------------------
//
// This package provides panic recovery middleware for the Gin web framework.
// Since we avoid importing gin as a direct dependency, users should use
// the GinMiddleware function which wraps gin.HandlerFunc.
//
// Usage:
//
//	import (
//	    "github.com/gin-gonic/gin"
//	    uncaught "github.com/uncaughtdev/uncaught-go"
//	    uncaughtgin "github.com/uncaughtdev/uncaught-go/integrations/gin"
//	)
//
//	client := uncaught.Init(&uncaught.Config{...})
//	r := gin.New()
//
//	// Use as gin middleware (wraps the handler func)
//	r.Use(func(c *gin.Context) {
//	    uncaughtgin.RecoverWithContext(client, c.Request.Method, c.Request.URL.String(), c.Next)
//	})
// ---------------------------------------------------------------------------

package gin

import (
	"fmt"
	"runtime"

	uncaught "github.com/uncaughtdev/uncaught-go"
)

// RecoverWithContext wraps a function call with panic recovery and sends
// captured errors to the Uncaught client. It is designed to be called from
// within a gin.HandlerFunc with the request details passed in.
//
// Usage:
//
//	r.Use(func(c *gin.Context) {
//	    uncaughtgin.RecoverWithContext(client, c.Request.Method, c.Request.URL.String(), c.Next)
//	})
func RecoverWithContext(client *uncaught.UncaughtClient, method, url string, next func()) {
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

			// Re-panic so gin's recovery middleware can handle it
			panic(r)
		}
	}()

	next()
}

// RecoverHandler returns a function that can be used as a deferred panic handler.
//
// Usage:
//
//	r.Use(func(c *gin.Context) {
//	    defer uncaughtgin.RecoverHandler(client, c.Request.Method, c.Request.URL.String())
//	    c.Next()
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
