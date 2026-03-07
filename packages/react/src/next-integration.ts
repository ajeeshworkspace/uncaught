import type { UncaughtClient, UncaughtConfig } from '@uncaughtdev/core';

/**
 * Augmented Window interface to access Next.js internals.
 * These are undocumented but stable properties Next.js sets on the window.
 */
interface NextWindow extends Window {
  /** Present in Pages Router - contains build-time page data */
  __NEXT_DATA__?: {
    page?: string;
    query?: Record<string, unknown>;
    buildId?: string;
    props?: Record<string, unknown>;
  };
  /** Present in App Router - contains flight response data */
  __next_f?: unknown[];
  /** Next.js router instance (Pages Router) */
  next?: {
    router?: {
      events?: {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
        off: (event: string, handler: (...args: unknown[]) => void) => void;
      };
    };
  };
}

/**
 * Result of Next.js environment detection.
 */
export interface NextJsDetection {
  /** Whether the app appears to be running in a Next.js context */
  isNextJs: boolean;
  /** Whether the App Router is detected */
  isAppRouter: boolean;
  /** Whether the Pages Router is detected */
  isPagesRouter: boolean;
}

/**
 * Detect if the current environment is a Next.js application,
 * and which router (App Router vs Pages Router) is being used.
 *
 * This detection is best-effort and relies on undocumented
 * but stable Next.js window properties.
 *
 * @returns Detection result with router type information.
 */
export function detectNextJs(): NextJsDetection {
  if (typeof window === 'undefined') {
    return {
      isNextJs: false,
      isAppRouter: false,
      isPagesRouter: false,
    };
  }

  const win = window as NextWindow;

  const hasPagesData = win.__NEXT_DATA__ !== undefined;
  const hasAppRouterData = win.__next_f !== undefined;

  // Check for Next.js meta tag as an additional signal
  let hasNextMeta = false;
  try {
    const nextMeta = document.querySelector('meta[name="next-size-adjust"]');
    hasNextMeta = nextMeta !== null;
  } catch {
    // Ignore DOM query errors
  }

  const isPagesRouter = hasPagesData && !hasAppRouterData;
  const isAppRouter = hasAppRouterData;
  const isNextJs = hasPagesData || hasAppRouterData || hasNextMeta;

  return {
    isNextJs,
    isAppRouter,
    isPagesRouter,
  };
}

/**
 * Set up navigation tracking specifically for Next.js routing.
 *
 * For the Pages Router, hooks into Next.js router events (routeChangeStart,
 * routeChangeComplete, routeChangeError).
 *
 * For the App Router, navigation is tracked via the general DOM breadcrumbs
 * (history.pushState monkey-patch), so this function primarily adds
 * Next.js-specific context.
 *
 * @param client - The UncaughtClient instance.
 * @returns A cleanup function that removes the event listeners.
 */
export function setupNextJsNavigation(client: UncaughtClient): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const detection = detectNextJs();
  const cleanups: Array<() => void> = [];

  // Add Next.js context to the client
  try {
    client.addBreadcrumb({

      type: 'navigation',
      category: 'nextjs',
      message: `Next.js detected: ${
        detection.isAppRouter
          ? 'App Router'
          : detection.isPagesRouter
            ? 'Pages Router'
            : 'Unknown Router'
      }`,
      level: 'info',
      data: {
        isAppRouter: detection.isAppRouter,
        isPagesRouter: detection.isPagesRouter,
      },
    });
  } catch {
    // Silently ignore
  }

  // Pages Router: hook into router events
  if (detection.isPagesRouter) {
    try {
      const win = window as NextWindow;
      const routerEvents = win.next?.router?.events;

      if (routerEvents) {
        let navigationStartTime = 0;

        const handleRouteChangeStart = (url: unknown): void => {
          try {
            navigationStartTime = Date.now();
            client.addBreadcrumb({
        
              type: 'navigation',
              category: 'nextjs.route',
              message: `Route change started: ${String(url)}`,
              level: 'info',
              data: {
                to: String(url),
              },
            });
          } catch {
            // Silently ignore
          }
        };

        const handleRouteChangeComplete = (url: unknown): void => {
          try {
            const duration =
              navigationStartTime > 0
                ? Date.now() - navigationStartTime
                : undefined;

            client.addBreadcrumb({
        
              type: 'navigation',
              category: 'nextjs.route',
              message: `Route change completed: ${String(url)}`,
              level: 'info',
              data: {
                to: String(url),
                duration,
              },
            });
          } catch {
            // Silently ignore
          }
        };

        const handleRouteChangeError = (
          err: unknown,
          url: unknown
        ): void => {
          try {
            const duration =
              navigationStartTime > 0
                ? Date.now() - navigationStartTime
                : undefined;

            client.addBreadcrumb({
        
              type: 'navigation',
              category: 'nextjs.route',
              message: `Route change error: ${String(url)}`,
              level: 'error',
              data: {
                to: String(url),
                error:
                  err instanceof Error
                    ? err.message
                    : String(err),
                duration,
              },
            });
          } catch {
            // Silently ignore
          }
        };

        routerEvents.on('routeChangeStart', handleRouteChangeStart);
        routerEvents.on(
          'routeChangeComplete',
          handleRouteChangeComplete
        );
        routerEvents.on('routeChangeError', handleRouteChangeError);

        cleanups.push(() => {
          try {
            routerEvents.off(
              'routeChangeStart',
              handleRouteChangeStart
            );
            routerEvents.off(
              'routeChangeComplete',
              handleRouteChangeComplete
            );
            routerEvents.off(
              'routeChangeError',
              handleRouteChangeError
            );
          } catch {
            // Silently ignore
          }
        });
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error(
          '[Uncaught] Failed to set up Next.js Pages Router navigation:',
          e
        );
      }
    }
  }

  return () => {
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // Silently ignore cleanup failures
      }
    });
  };
}

/**
 * Higher-order function for wrapping Next.js App Router layouts.
 *
 * Returns the configuration object needed to initialize UncaughtProvider
 * with Next.js-specific defaults applied.
 *
 * Usage in layout.tsx:
 * ```tsx
 * import { UncaughtProvider } from '@uncaughtdev/react';
 * import { withUncaught } from '@uncaughtdev/react';
 *
 * const uncaughtConfig = withUncaught({
 *   dsn: 'your-dsn-here',
 *   environment: 'production',
 * });
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <UncaughtProvider {...uncaughtConfig}>
 *           {children}
 *         </UncaughtProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * @param config - Base UncaughtConfig to extend with Next.js defaults.
 * @returns Configuration object with Next.js-specific settings applied.
 */
export function withUncaught(
  config: UncaughtConfig
): UncaughtConfig & { __nextjs: boolean } {
  return {
    ...config,
    __nextjs: true,
  };
}
