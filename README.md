# Uncaught

[![npm version](https://img.shields.io/npm/v/@uncaughtdev/core.svg)](https://www.npmjs.com/package/@uncaughtdev/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/AjeeshDevops/uncaught/actions/workflows/ci.yml/badge.svg)](https://github.com/AjeeshDevops/uncaught/actions/workflows/ci.yml)

Your AI coding assistant catches and fixes your bugs automatically.

Uncaught captures errors locally and feeds them to **Cursor**, **Claude Code**, or **Windsurf** via MCP. You never open a dashboard — your AI already knows what broke and how to fix it.

## Setup (30 seconds)

### Step 1 — Add MCP to your AI tool

**Cursor** — add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "uncaught": {
      "command": "npx",
      "args": ["-y", "@uncaughtdev/core", "uncaught-mcp"]
    }
  }
}
```

**Claude Code** — run once:

```bash
claude mcp add uncaught -- npx -y @uncaughtdev/core uncaught-mcp
```

**Windsurf** — add to `~/.windsurf/mcp.json` (same format as Cursor)

**Claude Desktop** — add to `claude_desktop_config.json` (same format as Cursor)

### Step 2 — Tell your AI to set it up

> "Set up error monitoring in my project"

Your AI calls the `setup_uncaught` tool, which auto-detects your framework (React, Next.js, Vite, Express, etc.), installs packages, and patches your entry files.

**That's it.** Errors are now captured automatically.

## How It Works

1. **Your app throws** — Uncaught captures the error with full context (stack trace, breadcrumbs, environment)
2. **Stored locally** — Everything goes to `.uncaught/` on your machine. Nothing leaves your laptop.
3. **Come back and ask your AI** — "Any bugs?" — it reads the errors via MCP, understands the context, and writes the fix

## What Your AI Can Do

| Tool | What it does |
|------|-------------|
| `setup_uncaught` | Install Uncaught in your project (auto-detects framework) |
| `list_errors` | See all errors at a glance, filter by status or environment |
| `get_error` | Full details: stack trace, breadcrumbs, environment, request context |
| `get_fix_prompt` | AI-ready diagnosis with everything needed to fix the bug |
| `get_stats` | Dashboard numbers: total, open, resolved, ignored |
| `resolve_error` | Mark a bug as fixed after you ship the fix |
| `search_errors` | Find errors by message text |

## Everything It Captures

- Browser errors, unhandled rejections, failed fetch & XHR requests
- React component errors via Error Boundary (with user feedback widget)
- Event handler errors (`onClick`, `onChange`) via `useErrorHandler` hook
- DOM breadcrumbs: clicks, navigation, API calls
- Web Vitals: LCP, FID, CLS, FCP, TTFB (zero dependencies)
- Server-side: Node.js process errors, Express middleware, Fastify plugin
- Source-mapped production stack traces
- Release versions and deployment environments
- Supabase failed queries with RLS explanations

## Packages

### JavaScript / TypeScript (npm)

| Package | Description |
|---------|-------------|
| [`@uncaughtdev/core`](https://www.npmjs.com/package/@uncaughtdev/core) | Core engine + MCP server + CLI + dashboard |
| [`@uncaughtdev/react`](https://www.npmjs.com/package/@uncaughtdev/react) | React/Next.js — Provider, Error Boundary, Web Vitals |
| [`@uncaughtdev/vue`](https://www.npmjs.com/package/@uncaughtdev/vue) | Vue 3 — Plugin, composables, router integration |
| [`@uncaughtdev/svelte`](https://www.npmjs.com/package/@uncaughtdev/svelte) | Svelte/SvelteKit — error hooks, client setup |
| [`@uncaughtdev/angular`](https://www.npmjs.com/package/@uncaughtdev/angular) | Angular — ErrorHandler, HttpInterceptor, NgModule |
| [`@uncaughtdev/supabase`](https://www.npmjs.com/package/@uncaughtdev/supabase) | Supabase — query tracking, RLS explainer |
| [`@uncaughtdev/prisma`](https://www.npmjs.com/package/@uncaughtdev/prisma) | Prisma — middleware for error capture + breadcrumbs |
| [`@uncaughtdev/drizzle`](https://www.npmjs.com/package/@uncaughtdev/drizzle) | Drizzle — query wrapper with error capture |

### Backend SDKs

| Language | Package | Install |
|----------|---------|---------|
| Python | [`uncaughtdev`](https://pypi.org/project/uncaughtdev/) | `pip install uncaughtdev` |
| Go | `uncaught-go` | `go get github.com/ajeeshworkspace/uncaught/packages/go` |
| Ruby | [`uncaught`](https://rubygems.org/gems/uncaught) | `gem install uncaught` |
| Rust | [`uncaught`](https://crates.io/crates/uncaught) | `cargo add uncaught` |
| Java | `uncaught-java` | See `packages/java/` |
| PHP | `uncaughtdev/uncaught` | See `packages/php/` |
| Elixir | `uncaught` | See `packages/elixir/` |
| C#/.NET | `Uncaught` | See `packages/dotnet/` |

### Framework Integrations

| SDK | Frameworks |
|-----|-----------|
| Python | FastAPI, Flask, Django, SQLAlchemy |
| Go | net/http, Gin, Echo, Fiber |
| Ruby | Rails (Railtie), Sinatra |
| Java | Spring Boot (auto-config + filter) |
| Rust | Axum, Actix (feature flags) |
| PHP | Laravel (ServiceProvider + Middleware) |
| Elixir | Phoenix, Plug |
| C#/.NET | ASP.NET Core middleware |

---

<details>
<summary><strong>Manual Installation</strong></summary>

If you prefer to set things up manually instead of using the MCP `setup_uncaught` tool:

```bash
npx uncaughtdev init
```

This auto-detects your framework, installs packages, and patches entry files. Or install manually:

```bash
npm install @uncaughtdev/core @uncaughtdev/react
```

</details>

<details>
<summary><strong>Configuration</strong></summary>

```typescript
import { initUncaught } from '@uncaughtdev/core';

const client = initUncaught({
  projectKey: 'my-app',
  environment: 'production',
  release: '1.2.0',
  webhookUrl: 'https://hooks.slack.com/services/...',
  transport: 'local',
  maxBreadcrumbs: 30,
  maxEventsPerMinute: 30,
  ignoreErrors: ['ResizeObserver'],
  sanitizeKeys: ['secret'],
  beforeSend: (event) => {
    if (event.error.message.includes('benign')) return null;
    return event;
  },
});
```

</details>

<details>
<summary><strong>React / Next.js</strong></summary>

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

**Error Boundary with Feedback** — When `showDialog` is enabled, users see a feedback form asking "What were you doing when this happened?" — their response is attached to the error.

**Event Handler Capture** — React Error Boundary doesn't catch `onClick`/`onChange` errors. Use `useErrorHandler`:

```tsx
import { useErrorHandler } from '@uncaughtdev/react';

function MyComponent() {
  const handleClick = useErrorHandler(() => {
    riskyOperation(); // Errors captured automatically
  });
  return <button onClick={handleClick}>Click</button>;
}
```

**Hooks** — `useUncaught()`, `useReportError()`, `useBreadcrumb()`, `withErrorCapture()`

</details>

<details>
<summary><strong>Server-Side (Node.js / Express / Fastify)</strong></summary>

```typescript
import { initUncaught, setupNodeHandlers, expressErrorHandler } from '@uncaughtdev/core';

const client = initUncaught({ projectKey: 'my-api' });

// Capture uncaughtException and unhandledRejection
setupNodeHandlers(client);

// Express (register AFTER all routes)
app.use(expressErrorHandler(client));
```

**Fastify:**

```typescript
import { fastifyErrorPlugin } from '@uncaughtdev/core';
fastify.register(fastifyErrorPlugin(client));
```

</details>

<details>
<summary><strong>CLI</strong></summary>

```bash
npx uncaughtdev                # List all captured issues
npx uncaughtdev show 1         # View fix prompt for issue #1
npx uncaughtdev show 1 --open  # Open in your editor
npx uncaughtdev resolve 1      # Mark as resolved
npx uncaughtdev clear          # Clear all issues
npx uncaughtdev dashboard      # Open web dashboard
```

</details>

<details>
<summary><strong>Web Dashboard</strong></summary>

```bash
npx uncaughtdev dashboard
```

Opens a local web UI at `http://localhost:3300` with:
- Error list with status/environment filtering
- Release badges and environment tags
- Full stack traces with source map resolution
- User feedback display
- AI-ready fix prompts to copy-paste

</details>

<details>
<summary><strong>Webhooks</strong></summary>

Get notified on new errors:

```typescript
initUncaught({
  webhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
});
```

Fires once per unique error. Works with Slack, Discord, or any HTTP endpoint.

</details>

<details>
<summary><strong>Source Maps</strong></summary>

Production stack traces are automatically resolved when `.map` files exist in `.next/`, `dist/`, or `build/`. No configuration needed.

</details>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Roadmap

- [x] Vue / Svelte / Angular adapters
- [x] Prisma / Drizzle DB wrappers
- [x] Python, Go, Ruby, Java, Rust, PHP, Elixir, C#/.NET SDKs
- [ ] Remote transport (hosted endpoint)
- [ ] Hosted dashboard (SaaS)
- [ ] AI auto-fix suggestions

## License

[MIT](LICENSE)
