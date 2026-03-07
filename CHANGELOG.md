# Changelog

## 0.2.0

### @uncaughtdev/core

- **feat:** Source map support — auto-resolve minified production stack traces to original source
- **feat:** Node.js server-side error handlers (`setupNodeHandlers`) for `uncaughtException` and `unhandledRejection`
- **feat:** Express error middleware (`expressErrorHandler`) with request context capture
- **feat:** Fastify error handler plugin (`fastifyErrorPlugin`) with request context capture
- **feat:** Release tracking — `config.release` flows through events, storage, and dashboard
- **feat:** Environment filtering — `config.environment` with dashboard filter dropdown
- **feat:** Webhook notifications — POST to any URL when a new error fingerprint is first seen
- **feat:** User feedback support — `client.submitFeedback()` API for attaching user context to errors

### @uncaughtdev/react

- **feat:** Web Vitals tracking (LCP, FID, CLS, FCP, TTFB) via native `PerformanceObserver`
- **feat:** `useErrorHandler` hook — wraps event handlers (onClick, onChange) with error capture
- **feat:** `withErrorCapture` HOF — standalone error wrapping for class components
- **feat:** XHR instrumentation — Axios and other XHR-based libraries tracked as breadcrumbs
- **feat:** User feedback widget in Error Boundary — `showDialog` renders a feedback form

## 0.1.2

### @uncaughtdev/core

- **feat:** SQLite storage backend (`better-sqlite3`) for local error persistence
- **feat:** Web dashboard — `npx uncaughtdev dashboard` opens a local UI to browse errors and fix prompts
- **feat:** REST API for issues and events (`/api/issues`, `/api/stats`)
- **feat:** Auto-migration from flat JSON files to SQLite on first access
- **fix:** Improved fix prompt formatting and compact prompt box in dashboard

## 0.1.0

Initial release.

### @uncaughtdev/core

- Error capture engine with breadcrumbs, fingerprinting, and AI-ready fix prompts
- Transport layer: console, local file, and remote
- CLI viewer: `npx uncaughtdev` to list, show, resolve, and clear issues
- Local-first storage in `.uncaught/` directory
- Next.js API handler for browser-to-server event relay

### @uncaughtdev/react

- `<UncaughtProvider>` for React/Next.js apps
- Error Boundary with automatic error capture
- Global handlers for unhandled errors and promise rejections
- Fetch wrapper for failed request tracking

### @uncaughtdev/supabase

- `wrapSupabaseClient()` to intercept and capture Supabase errors
- Query tracking with breadcrumbs
- RLS error detection and explanation in fix prompts
