# Uncaught

[![npm version](https://img.shields.io/npm/v/@uncaughtdev/core.svg)](https://www.npmjs.com/package/@uncaughtdev/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/AjeeshDevops/uncaught/actions/workflows/ci.yml/badge.svg)](https://github.com/AjeeshDevops/uncaught/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Error monitoring for vibe coders. One command setup. AI-ready fix prompts.

## Quick Start

```bash
npx uncaughtdev init
```

That's it. Start your dev server, trigger an error, then:

```bash
npx uncaughtdev
```

## Features

- **Auto-captures errors** — browser errors, unhandled rejections, failed fetches, and XHR requests
- **Server-side capture** — Node.js process handlers, Express middleware, Fastify plugin
- **React Error Boundary** — with built-in user feedback widget
- **Event handler capture** — `useErrorHandler` hook catches errors in onClick, onChange, etc.
- **DOM breadcrumbs** — clicks, navigation, fetch calls, and XHR requests
- **Web Vitals** — LCP, FID, CLS, FCP, TTFB tracked automatically (zero dependencies)
- **Source map support** — resolves minified production stack traces to original source
- **Webhook notifications** — POST to Slack, Discord, or any URL on new errors
- **Release tracking** — tag errors with version, filter in dashboard
- **Environment filtering** — separate production, staging, and development errors
- **AI-ready fix prompts** — full context (breadcrumbs, env, stack) formatted for AI assistants
- **Local-first** — all data stays in `.uncaught/` on your machine (SQLite)
- **Web dashboard** — browse errors, filter by status/environment, copy fix prompts
- **Supabase support** — wraps your client to catch failed queries with RLS explanations

## Packages

| Package | Description |
|---------|-------------|
| [`@uncaughtdev/core`](https://www.npmjs.com/package/@uncaughtdev/core) | Core engine — transport, breadcrumbs, fingerprinting, CLI, dashboard, source maps, server handlers, webhooks |
| [`@uncaughtdev/react`](https://www.npmjs.com/package/@uncaughtdev/react) | React/Next.js SDK — Provider, Error Boundary, global handlers, Web Vitals, event handler capture |
| [`@uncaughtdev/supabase`](https://www.npmjs.com/package/@uncaughtdev/supabase) | Supabase wrapper — query tracking, error parsing, RLS explainer |

## Configuration

```typescript
import { initUncaught } from '@uncaughtdev/core';

const client = initUncaught({
  projectKey: 'my-app',
  environment: 'production',       // Filter errors by deploy environment
  release: '1.2.0',                // Tag errors with your app version
  webhookUrl: 'https://hooks.slack.com/services/...', // Notify on new errors
  transport: 'local',              // 'local' | 'remote' | 'console'
  maxBreadcrumbs: 30,              // Ring buffer size (default: 20)
  maxEventsPerMinute: 30,          // Rate limit (default: 30)
  ignoreErrors: ['ResizeObserver'], // Drop matching errors
  sanitizeKeys: ['secret'],        // Extra PII keys to redact
  beforeSend: (event) => {         // Modify or drop events
    if (event.error.message.includes('benign')) return null;
    return event;
  },
});
```

## React / Next.js

```tsx
import { UncaughtProvider, UncaughtErrorBoundary } from '@uncaughtdev/react';

function App() {
  return (
    <UncaughtProvider projectKey="my-app" environment="production" release="1.2.0">
      <UncaughtErrorBoundary showDialog>
        <MyApp />
      </UncaughtErrorBoundary>
    </UncaughtProvider>
  );
}
```

### Error Boundary with Feedback

When `showDialog` is enabled, users see a styled error dialog with a feedback form asking "What were you doing when this happened?" — their response is attached to the error event.

### Event Handler Capture

React Error Boundary doesn't catch errors in event handlers. Use `useErrorHandler` to wrap them:

```tsx
import { useErrorHandler } from '@uncaughtdev/react';

function MyComponent() {
  const handleClick = useErrorHandler((e) => {
    // If this throws, Uncaught captures it automatically
    riskyOperation();
  });

  return <button onClick={handleClick}>Click me</button>;
}
```

For class components, use `withErrorCapture`:

```tsx
import { withErrorCapture } from '@uncaughtdev/react';

const safeHandler = withErrorCapture(riskyFunction, client);
```

### Hooks

```tsx
import { useUncaught, useReportError, useBreadcrumb } from '@uncaughtdev/react';

const client = useUncaught();           // Get the client instance
const reportError = useReportError();    // Report errors manually
const addBreadcrumb = useBreadcrumb();   // Add custom breadcrumbs
```

## Server-Side (Node.js)

### Process-Level Handlers

Captures `uncaughtException` and `unhandledRejection`:

```typescript
import { initUncaught, setupNodeHandlers } from '@uncaughtdev/core';

const client = initUncaught({ projectKey: 'my-api' });
const cleanup = setupNodeHandlers(client);
```

### Express

```typescript
import { expressErrorHandler } from '@uncaughtdev/core';

// Register AFTER all routes
app.use(expressErrorHandler(client));
```

### Fastify

```typescript
import { fastifyErrorPlugin } from '@uncaughtdev/core';

fastify.register(fastifyErrorPlugin(client));
```

## Web Vitals

Automatically tracked when using `@uncaughtdev/react` — no configuration needed:

- **LCP** (Largest Contentful Paint)
- **FID** (First Input Delay)
- **CLS** (Cumulative Layout Shift)
- **FCP** (First Contentful Paint)
- **TTFB** (Time to First Byte)

Metrics are recorded as breadcrumbs and visible in error context. Uses native `PerformanceObserver` — zero additional dependencies.

## Webhook Notifications

Get notified when a new error type is first seen:

```typescript
initUncaught({
  webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
});
```

Sends a POST request with JSON payload:

```json
{
  "title": "Cannot read properties of undefined",
  "errorType": "TypeError",
  "fingerprint": "a1b2c3d4",
  "level": "error",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "release": "1.2.0",
  "environment": "production",
  "fixPrompt": "..."
}
```

Only fires once per unique error fingerprint. Works with Slack, Discord, or any HTTP endpoint.

## Source Maps

Production stack traces are automatically resolved when source maps are available. The dashboard searches `.next/`, `dist/`, and `build/` directories for `.map` files and displays the original source file, line, and column.

No configuration needed — just make sure your build outputs source maps.

## CLI

```bash
npx uncaughtdev                # List all captured issues
npx uncaughtdev show 1         # View fix prompt for issue #1
npx uncaughtdev show 1 --open  # Open in your editor
npx uncaughtdev resolve 1      # Mark as resolved
npx uncaughtdev clear          # Clear all issues
npx uncaughtdev dashboard      # Open web dashboard
```

## Web Dashboard

```bash
npx uncaughtdev dashboard
```

Opens a local web UI at `http://localhost:3300` where you can:

- Browse all captured errors with filtering (open / resolved / ignored)
- Filter by deployment environment (production / staging / development)
- View release version badges on each issue
- View full stack traces (with source map resolution), breadcrumbs, and environment info
- Read user feedback submitted through the error boundary widget
- Copy AI-ready fix prompts to paste into your editor or AI assistant
- Mark issues as resolved or ignored

## How It Works

1. **Capture** — SDK hooks into global error handlers, fetch, XHR, and framework-specific boundaries
2. **Enrich** — Adds breadcrumbs (clicks, navigation, API calls, Web Vitals), environment info, and user context
3. **Fingerprint** — Groups duplicate errors by normalizing stack traces
4. **Generate** — Creates an AI-ready fix prompt with all context needed to debug
5. **Store** — Writes to local SQLite database in `.uncaught/`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Roadmap

- [ ] Remote transport (send errors to a hosted endpoint)
- [ ] Vue / Svelte adapters
- [ ] Hosted dashboard (SaaS tier)
- [ ] AI auto-fix suggestions
- [ ] Slack / Discord native integrations (rich formatting)

## License

[MIT](LICENSE)
