# 🧪 Uncaught

Error monitoring for vibe coders. One command setup. AI-ready fix prompts.

## Quick Start

```bash
npx uncaught init
```

That's it. Start your dev server, trigger an error, then:

```bash
npx uncaught
```

## What it does

- **Auto-captures** errors, unhandled rejections, and failed fetches
- **Generates AI-ready fix prompts** with full context (breadcrumbs, env, stack traces)
- **Zero config** — `npx uncaught init` detects your framework and patches everything
- **Local-first** — all data stays in `.uncaught/` on your machine
- **Supabase support** — wraps your client to catch failed queries with RLS explanations

## Packages

| Package | Description |
|---------|-------------|
| `@uncaught/core` | Core engine — transport, breadcrumbs, fingerprinting, CLI |
| `@uncaught/react` | React/Next.js SDK — Provider, Error Boundary, global handlers |
| `@uncaught/supabase` | Supabase wrapper — query tracking, error parsing, RLS explainer |

## CLI

```bash
npx uncaught              # List all captured issues
npx uncaught show 1       # View fix prompt for issue #1
npx uncaught show 1 --open # Open in your editor
npx uncaught resolve 1    # Mark as resolved
npx uncaught clear        # Clear all issues
```

## License

MIT
