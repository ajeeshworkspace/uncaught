# Contributing to Uncaught

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/AjeeshDevops/uncaught.git
cd uncaught

# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build
```

## Monorepo Structure

```
packages/
  core/       — Core engine: transport, breadcrumbs, fingerprinting, CLI, dashboard
  react/      — React/Next.js SDK: Provider, Error Boundary, global handlers
  supabase/   — Supabase wrapper: query tracking, error parsing, RLS explainer
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |

To work on a specific package:

```bash
pnpm --filter @uncaughtdev/core run build
pnpm --filter @uncaughtdev/core run dev
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `pnpm build` and `pnpm typecheck` to verify
4. Commit with a descriptive message (e.g., `fix: handle null stack traces in fingerprinting`)
5. Open a PR against `main`

## Commit Messages

We use conventional-ish commits:

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `test:` — adding or updating tests
- `chore:` — tooling, CI, dependencies

## Code Style

- TypeScript everywhere
- Minimize external runtime dependencies, especially in `@uncaughtdev/core`
- Never throw from transport or handler code — errors are swallowed to avoid crashing the host app
- Keep the SDK zero-config by default

## Reporting Issues

Use [GitHub Issues](https://github.com/AjeeshDevops/uncaught/issues) with the provided templates for bugs and feature requests.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
