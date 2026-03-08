import { getClient } from '@uncaughtdev/core';

/**
 * Type definitions for SvelteKit error hook parameters.
 * Defined locally to avoid requiring @sveltejs/kit at runtime
 * when it is an optional peer dependency.
 */
interface ServerErrorInput {
  error: unknown;
  event: {
    request: { method: string };
    url: { toString: () => string };
  };
}

interface ClientErrorInput {
  error: unknown;
}

/**
 * Creates a SvelteKit `handleError` hook for server-side error capturing.
 * Reports unhandled server errors to Uncaught with request context.
 *
 * Usage in `src/hooks.server.ts`:
 * ```ts
 * import { handleError } from '@uncaughtdev/svelte';
 *
 * export const handleError = handleError();
 * ```
 *
 * @returns A SvelteKit HandleServerError function.
 */
export function handleError() {
  return ({ error, event }: ServerErrorInput) => {
    try {
      const client = getClient();
      client?.captureError(
        error instanceof Error ? error : new Error(String(error)),
        {
          request: {
            method: event.request.method,
            url: event.url.toString(),
          },
        }
      );
    } catch (e) {
      // Never crash the host app
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to capture server error:', e);
      }
    }
  };
}

/**
 * Creates a SvelteKit `handleError` hook for client-side error capturing.
 * Reports unhandled client errors to Uncaught.
 *
 * Usage in `src/hooks.client.ts`:
 * ```ts
 * import { handleClientError } from '@uncaughtdev/svelte';
 *
 * export const handleError = handleClientError();
 * ```
 *
 * @returns A SvelteKit HandleClientError function.
 */
export function handleClientError() {
  return ({ error }: ClientErrorInput) => {
    try {
      const client = getClient();
      client?.captureError(
        error instanceof Error ? error : new Error(String(error))
      );
    } catch (e) {
      // Never crash the host app
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to capture client error:', e);
      }
    }
  };
}
