// ---------------------------------------------------------------------------
// @uncaughtdev/core — Node.js server-side error handlers
// ---------------------------------------------------------------------------

import type { UncaughtClient } from './client';

/**
 * Set up Node.js process-level error handlers.
 *
 * - `uncaughtException` — captures the error, flushes, then re-throws
 * - `unhandledRejection` — captures with 'fatal' level
 *
 * @returns Cleanup function to remove the handlers.
 */
export function setupNodeHandlers(client: UncaughtClient): () => void {
  if (typeof process === 'undefined' || !process.on) {
    return () => {};
  }

  const handleUncaughtException = (error: Error): void => {
    try {
      client.captureError(error, { level: 'fatal' });
      // Synchronous flush attempt before process exits
      client.flush().catch(() => {});
    } catch {
      // Never interfere with process crash
    }
    // Re-throw so the default handler still terminates the process
    throw error;
  };

  const handleUnhandledRejection = (reason: unknown): void => {
    try {
      client.captureError(reason, { level: 'fatal' });
    } catch {
      // Never crash from error reporting
    }
  };

  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);

  return () => {
    process.removeListener('uncaughtException', handleUncaughtException);
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  };
}

/**
 * Express error-handling middleware.
 *
 * Usage:
 * ```js
 * const { expressErrorHandler } = require('@uncaughtdev/core');
 * app.use(expressErrorHandler(client));
 * ```
 *
 * Must be registered AFTER all routes (Express processes error middleware last).
 */
export function expressErrorHandler(
  client: UncaughtClient
): (err: Error, req: unknown, res: unknown, next: (err?: unknown) => void) => void {
  return (err, req, _res, next) => {
    try {
      const reqObj = req as Record<string, unknown>;
      client.captureError(err, {
        request: {
          method: reqObj.method as string | undefined,
          url: reqObj.originalUrl as string ?? reqObj.url as string | undefined,
          headers: reqObj.headers as Record<string, string> | undefined,
        },
      });
    } catch {
      // Never crash from error reporting
    }
    next(err);
  };
}

/**
 * Fastify error handler plugin.
 *
 * Usage:
 * ```js
 * const { fastifyErrorPlugin } = require('@uncaughtdev/core');
 * fastify.register(fastifyErrorPlugin(client));
 * ```
 */
export function fastifyErrorPlugin(
  client: UncaughtClient
): (fastify: unknown, opts: unknown, done: () => void) => void {
  return (fastify, _opts, done) => {
    const f = fastify as {
      setErrorHandler: (handler: (error: Error, request: unknown, reply: unknown) => void) => void;
    };

    f.setErrorHandler((error, request, reply) => {
      try {
        const req = request as Record<string, unknown>;
        client.captureError(error, {
          request: {
            method: req.method as string | undefined,
            url: req.url as string | undefined,
            headers: req.headers as Record<string, string> | undefined,
          },
        });
      } catch {
        // Never crash from error reporting
      }

      // Send error response
      const rep = reply as { status: (code: number) => { send: (body: unknown) => void } };
      rep.status(500).send({ error: 'Internal Server Error' });
    });

    done();
  };
}
