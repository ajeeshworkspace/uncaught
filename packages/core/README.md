# @uncaughtdev/core

Core engine for [Uncaught](https://github.com/AjeeshDevops/uncaught) error monitoring.

## Install

```bash
npx uncaughtdev init
```

Or manually:

```bash
npm install @uncaughtdev/core
```

## What's included

- Error capture with fingerprinting and deduplication
- Ring buffer breadcrumb store
- PII sanitization
- AI-ready fix prompt generation
- Transport layer (console, local file, remote)
- SQLite storage backend with web dashboard
- Source map resolution for production stack traces
- Node.js process-level error handlers (`setupNodeHandlers`)
- Express error middleware (`expressErrorHandler`)
- Fastify error handler plugin (`fastifyErrorPlugin`)
- Webhook notifications for new error fingerprints
- Release tracking and environment filtering
- User feedback API (`submitFeedback`)
- CLI viewer (`npx uncaughtdev`)
- Auto-setup command (`npx uncaughtdev init`)

## Server-Side Usage

```typescript
import { initUncaught, setupNodeHandlers, expressErrorHandler } from '@uncaughtdev/core';

const client = initUncaught({
  projectKey: 'my-api',
  environment: 'production',
  release: '1.2.0',
});

// Capture uncaughtException and unhandledRejection
setupNodeHandlers(client);

// Express error middleware (register after all routes)
app.use(expressErrorHandler(client));
```

## License

MIT
