import type { UncaughtClient } from '@uncaughtdev/core';

/**
 * Sets up automatic breadcrumb tracking for Vue Router navigations.
 * Call this after both the router and Uncaught client have been initialized.
 *
 * Usage:
 * ```ts
 * import { createRouter, createWebHistory } from 'vue-router';
 * import { setupRouterBreadcrumbs, useUncaught } from '@uncaughtdev/vue';
 *
 * const router = createRouter({ history: createWebHistory(), routes });
 * const client = useUncaught();
 * setupRouterBreadcrumbs(router, client);
 * ```
 *
 * @param router - A Vue Router instance (or any object with an `afterEach` method).
 * @param client - The UncaughtClient instance to record breadcrumbs on.
 */
export function setupRouterBreadcrumbs(
  router: { afterEach: (guard: (to: any, from: any) => void) => () => void },
  client: UncaughtClient
): () => void {
  const removeGuard = router.afterEach(
    (to: { fullPath: string }, from: { fullPath: string }) => {
      try {
        client.addBreadcrumb({
          type: 'navigation',
          category: 'router',
          message: `${from.fullPath} → ${to.fullPath}`,
          level: 'info',
        });
      } catch (e) {
        // Never crash the host app
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[Uncaught] Failed to add router breadcrumb:',
            e
          );
        }
      }
    }
  );

  return removeGuard;
}
