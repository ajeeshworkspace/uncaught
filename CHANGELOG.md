# Changelog

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
