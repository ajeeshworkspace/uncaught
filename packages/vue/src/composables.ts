import { inject } from 'vue';
import type { UncaughtClient, Breadcrumb } from '@uncaughtdev/core';

/**
 * Returns the UncaughtClient instance provided by the UncaughtPlugin.
 * Must be called within a component tree where `app.use(UncaughtPlugin)` has been applied.
 *
 * @throws {Error} If called outside of a component tree with the UncaughtPlugin installed.
 * @returns The UncaughtClient instance.
 */
export function useUncaught(): UncaughtClient {
  const client = inject<UncaughtClient>('uncaught');

  if (!client) {
    throw new Error(
      'useUncaught must be used within a Vue app that has installed the UncaughtPlugin. ' +
        'Make sure to call app.use(UncaughtPlugin, config) before using this composable.'
    );
  }

  return client;
}

/**
 * Returns a function that reports an error to Uncaught.
 * Safe to call even if the client is not yet initialized (will silently no-op).
 *
 * @returns A function `(error: Error, context?: Record<string, unknown>) => void`
 */
export function useReportError(): (
  error: Error,
  context?: Record<string, unknown>
) => void {
  const client = inject<UncaughtClient | null>('uncaught', null);

  return (error: Error, context?: Record<string, unknown>) => {
    try {
      if (!client) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[Uncaught] useReportError called but no UncaughtClient is available. ' +
              'Make sure the UncaughtPlugin is installed.'
          );
        }
        return;
      }

      client.captureError(error);
    } catch (e) {
      // Never crash the host app
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to report error:', e);
      }
    }
  };
}

/**
 * Returns a function that adds a breadcrumb to the current Uncaught session.
 * Safe to call even if the client is not yet initialized (will silently no-op).
 *
 * @returns A function `(breadcrumb: Partial<Breadcrumb>) => void`
 */
export function useBreadcrumb(): (breadcrumb: Partial<Breadcrumb>) => void {
  const client = inject<UncaughtClient | null>('uncaught', null);

  return (breadcrumb: Partial<Breadcrumb>) => {
    try {
      if (!client) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[Uncaught] useBreadcrumb called but no UncaughtClient is available. ' +
              'Make sure the UncaughtPlugin is installed.'
          );
        }
        return;
      }

      client.addBreadcrumb({
        type: breadcrumb.type ?? 'custom',
        category: breadcrumb.category ?? 'custom',
        message: breadcrumb.message ?? '',
        level: breadcrumb.level ?? 'info',
        data: breadcrumb.data,
      });
    } catch (e) {
      // Never crash the host app
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to add breadcrumb:', e);
      }
    }
  };
}
