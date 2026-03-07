import type { UncaughtClient } from '@uncaughtdev/core';

/**
 * Patterns for errors that are typically noise and should be ignored.
 * These are errors produced by the browser, extensions, or third-party scripts
 * that provide no actionable information.
 */
const NOISE_PATTERNS: RegExp[] = [
  // ResizeObserver loop errors are benign and happen in many apps
  /ResizeObserver loop/i,
  // "Script error." with no useful info (cross-origin scripts without CORS headers)
  /^Script error\.?$/i,
  // Browser extension errors
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /safari-web-extension:\/\//i,
  // Edge extension errors
  /extension:\/\//i,
];

/**
 * Check if an error message matches any of the known noise patterns.
 */
function isNoiseError(message: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Check if an error matches any user-defined ignoreErrors patterns.
 */
function isIgnoredByConfig(
  message: string,
  ignoreErrors?: Array<string | RegExp>
): boolean {
  if (!ignoreErrors || ignoreErrors.length === 0) {
    return false;
  }

  return ignoreErrors.some((pattern) => {
    if (typeof pattern === 'string') {
      return message.includes(pattern);
    }
    return pattern.test(message);
  });
}

/**
 * Normalize a promise rejection reason into a proper Error object.
 */
function normalizeRejectionReason(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof reason === 'string') {
    return new Error(reason);
  }

  if (reason !== null && reason !== undefined) {
    try {
      return new Error(JSON.stringify(reason));
    } catch {
      return new Error(String(reason));
    }
  }

  return new Error('Unhandled promise rejection with no reason');
}

/**
 * Set up global error handlers to capture uncaught exceptions and
 * unhandled promise rejections.
 *
 * @param client - The UncaughtClient instance to report errors to.
 * @returns A cleanup function that removes the event listeners.
 */
export function setupGlobalHandlers(client: UncaughtClient): () => void {
  // Guard for SSR environments
  if (typeof window === 'undefined') {
    return () => {};
  }

  const config = client.getConfig?.() ?? {};
  const ignoreErrors = (config as Record<string, unknown>)
    .ignoreErrors as Array<string | RegExp> | undefined;

  /**
   * Handle uncaught exceptions via window.onerror / 'error' event.
   */
  const handleError = (event: ErrorEvent): void => {
    try {
      const { error, message, filename } = event;

      // "Script error." with no stack and no filename is cross-origin noise
      if (
        !error &&
        (!message || message === 'Script error.') &&
        !filename
      ) {
        return;
      }

      const errorMessage =
        error?.message ?? message ?? 'Unknown error';

      // Filter out noise errors
      if (isNoiseError(errorMessage)) {
        return;
      }

      // Filter out user-configured ignored errors
      if (isIgnoredByConfig(errorMessage, ignoreErrors)) {
        return;
      }

      // Build the error object
      const errorObj =
        error instanceof Error ? error : new Error(errorMessage);

      client.captureError(errorObj, {
        tags: { source: 'window.onerror' },
        extra: {
          filename: filename ?? undefined,
          lineno: event.lineno ?? undefined,
          colno: event.colno ?? undefined,
        },
      });

      // Do NOT call event.preventDefault() - let the browser still log the error
    } catch (e) {
      // Never crash the host app from our error handler
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Error in global error handler:', e);
      }
    }
  };

  /**
   * Handle unhandled promise rejections.
   */
  const handleRejection = (event: PromiseRejectionEvent): void => {
    try {
      const error = normalizeRejectionReason(event.reason);
      const errorMessage = error.message;

      // Filter out noise errors
      if (isNoiseError(errorMessage)) {
        return;
      }

      // Filter out user-configured ignored errors
      if (isIgnoredByConfig(errorMessage, ignoreErrors)) {
        return;
      }

      client.captureError(error, {
        tags: {
          source: 'unhandledrejection',
          unhandled: 'true',
        },
      });

      // Do NOT call event.preventDefault() - let the browser still log
    } catch (e) {
      // Never crash the host app from our error handler
      if (process.env.NODE_ENV === 'development') {
        console.error(
          '[Uncaught] Error in unhandled rejection handler:',
          e
        );
      }
    }
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  // Return cleanup function
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
