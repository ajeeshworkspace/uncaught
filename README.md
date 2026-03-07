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

## What it does

- **Auto-captures** errors, unhandled rejections, and failed fetches
- **Generates AI-ready fix prompts** with full context (breadcrumbs, env, stack traces)
- **Zero config** — `npx uncaughtdev init` detects your framework and patches everything
- **Local-first** — all data stays in `.uncaught/` on your machine (SQLite + flat files)
- **Web dashboard** — browse errors and fix prompts in your browser
- **Supabase support** — wraps your client to catch failed queries with RLS explanations

## Packages

| Package | Description |
|---------|-------------|
| [`@uncaughtdev/core`](https://www.npmjs.com/package/@uncaughtdev/core) | Core engine — transport, breadcrumbs, fingerprinting, CLI, dashboard |
| [`@uncaughtdev/react`](https://www.npmjs.com/package/@uncaughtdev/react) | React/Next.js SDK — Provider, Error Boundary, global handlers |
| [`@uncaughtdev/supabase`](https://www.npmjs.com/package/@uncaughtdev/supabase) | Supabase wrapper — query tracking, error parsing, RLS explainer |

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
- View full stack traces, breadcrumbs, and environment info
- Copy AI-ready fix prompts to paste into your editor or AI assistant
- Mark issues as resolved or ignored

## How it works

1. **Capture** — SDK hooks into global error handlers, fetch, and framework-specific boundaries
2. **Enrich** — Adds breadcrumbs (clicks, navigation, console logs), environment info, and user context
3. **Fingerprint** — Groups duplicate errors by normalizing stack traces
4. **Generate** — Creates an AI-ready fix prompt with all context needed to debug
5. **Store** — Writes to local SQLite database and flat files in `.uncaught/`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Roadmap

- [ ] Remote transport (send errors to a hosted endpoint)
- [ ] More framework adapters (Vue, Svelte, Express, Fastify)
- [ ] Source map support for production stack traces
- [ ] Hosted dashboard (SaaS tier)
- [ ] Slack / Discord notifications
- [ ] AI auto-fix suggestions

## License

[MIT](LICENSE)
