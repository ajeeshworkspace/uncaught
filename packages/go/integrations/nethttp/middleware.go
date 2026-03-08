// ---------------------------------------------------------------------------
// uncaught-go — net/http middleware integration
// ---------------------------------------------------------------------------
//
// Usage:
//
//	client := uncaught.Init(&uncaught.Config{...})
//	mux := http.NewServeMux()
//	mux.HandleFunc("/", handler)
//	http.ListenAndServe(":8080", nethttp.Middleware(client)(mux))
// ---------------------------------------------------------------------------

package nethttp

import (
	"fmt"
	"net/http"
	"runtime"

	uncaught "github.com/uncaughtdev/uncaught-go"
)

// Middleware returns an http.Handler middleware that recovers from panics,
// captures the error using the Uncaught client, adds request breadcrumbs,
// and re-panics so upstream middleware (if any) can handle it.
func Middleware(client *uncaught.UncaughtClient) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Add navigation breadcrumb
			client.AddBreadcrumb(uncaught.Breadcrumb{
				Type:     uncaught.BreadcrumbNavigation,
				Category: "http",
				Message:  fmt.Sprintf("%s %s", r.Method, r.URL.Path),
				Data: map[string]interface{}{
					"method":     r.Method,
					"url":        r.URL.String(),
					"user_agent": r.UserAgent(),
				},
			})

			defer func() {
				if err := recover(); err != nil {
					// Capture the stack trace
					buf := make([]byte, 16384)
					n := runtime.Stack(buf, false)
					stack := string(buf[:n])

					// Build request info
					reqInfo := &uncaught.RequestInfo{
						Method: r.Method,
						URL:    r.URL.String(),
						Headers: map[string]string{
							"host":         r.Host,
							"content-type": r.Header.Get("Content-Type"),
							"user-agent":   r.UserAgent(),
						},
					}

					// Build query params
					if len(r.URL.Query()) > 0 {
						query := make(map[string]string)
						for k, v := range r.URL.Query() {
							if len(v) > 0 {
								query[k] = v[0]
							}
						}
						reqInfo.Query = query
					}

					// Create error info with the stack
					errorInfo := uncaught.ErrorInfo{
						Message: fmt.Sprintf("%v", err),
						Type:    fmt.Sprintf("%T", err),
						Stack:   stack,
					}

					client.CaptureError(errorInfo, &uncaught.CaptureContext{
						Request: reqInfo,
						Level:   uncaught.Fatal,
					})

					// Re-panic to allow upstream handlers to respond
					panic(err)
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}

// RecoverMiddleware is like Middleware but does NOT re-panic. Instead, it
// responds with a 500 Internal Server Error. Use this as a top-level
// handler when no upstream panic handler exists.
func RecoverMiddleware(client *uncaught.UncaughtClient) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					buf := make([]byte, 16384)
					n := runtime.Stack(buf, false)
					stack := string(buf[:n])

					errorInfo := uncaught.ErrorInfo{
						Message: fmt.Sprintf("%v", err),
						Type:    fmt.Sprintf("%T", err),
						Stack:   stack,
					}

					client.CaptureError(errorInfo, &uncaught.CaptureContext{
						Request: &uncaught.RequestInfo{
							Method: r.Method,
							URL:    r.URL.String(),
						},
						Level: uncaught.Fatal,
					})

					w.WriteHeader(http.StatusInternalServerError)
					w.Write([]byte("Internal Server Error"))
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
