import { initUncaught, type UncaughtConfig } from '@uncaughtdev/core';

/**
 * Initializes the Uncaught error monitoring client for Svelte applications.
 * Automatically sets up global error handlers (`window.onerror` and
 * `unhandledrejection`) on the client side.
 *
 * Usage:
 * ```ts
 * // In your Svelte app entry point (e.g., +layout.ts or main.ts)
 * import { setupUncaught } from '@uncaughtdev/svelte';
 *
 * setupUncaught({ dsn: 'your-dsn', environment: 'production' });
 * ```
 *
 * @param config - Partial Uncaught configuration.
 * @returns The initialized UncaughtClient instance.
 */
export function setupUncaught(config?: Partial<UncaughtConfig>) {
  const client = initUncaught((config ?? {}) as UncaughtConfig);

  // Set up global error listeners on the client side
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event: ErrorEvent) => {
      try {
        client.captureError(
          event.error || new Error(event.message)
        );
      } catch (e) {
        // Never crash the host app
        if (process.env.NODE_ENV === 'development') {
          console.error('[Uncaught] Failed to capture window error:', e);
        }
      }
    });

    window.addEventListener(
      'unhandledrejection',
      (event: PromiseRejectionEvent) => {
        try {
          client.captureError(
            event.reason instanceof Error
              ? event.reason
              : new Error(String(event.reason))
          );
        } catch (e) {
          // Never crash the host app
          if (process.env.NODE_ENV === 'development') {
            console.error(
              '[Uncaught] Failed to capture unhandled rejection:',
              e
            );
          }
        }
      }
    );
  }

  return client;
}
