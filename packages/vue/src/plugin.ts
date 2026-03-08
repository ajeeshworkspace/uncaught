import type { App } from 'vue';
import { initUncaught, type UncaughtConfig } from '@uncaughtdev/core';

/**
 * Vue plugin that initializes the Uncaught error monitoring client
 * and sets up automatic error capturing via `app.config.errorHandler`.
 *
 * Usage:
 * ```ts
 * import { createApp } from 'vue';
 * import { UncaughtPlugin } from '@uncaughtdev/vue';
 *
 * const app = createApp(App);
 * app.use(UncaughtPlugin, { dsn: 'your-dsn', environment: 'production' });
 * app.mount('#app');
 * ```
 */
export const UncaughtPlugin = {
  install(app: App, config?: Partial<UncaughtConfig>) {
    const client = initUncaught((config ?? {}) as UncaughtConfig);

    // Provide the client instance to all descendant components via inject('uncaught')
    app.provide('uncaught', client);

    // Preserve any existing error handler and chain ours before it
    const originalHandler = app.config.errorHandler;

    app.config.errorHandler = (err, instance, info) => {
      try {
        client.captureError(
          err instanceof Error ? err : new Error(String(err)),
          {
            componentStack: info,
          }
        );
      } catch (e) {
        // Never crash the host app from error reporting
        if (process.env.NODE_ENV === 'development') {
          console.error('[Uncaught] Failed to capture error:', e);
        }
      }

      // Call the original handler if one was registered
      if (originalHandler) {
        originalHandler(err, instance, info);
      }
    };
  },
};
