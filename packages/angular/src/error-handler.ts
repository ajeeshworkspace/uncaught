import { ErrorHandler, Injectable } from '@angular/core';
import { getClient } from '@uncaughtdev/core';

/**
 * Angular ErrorHandler that captures unhandled errors and reports them to Uncaught.
 * Replaces Angular's default error handler while preserving the default console.error behavior.
 *
 * Usage:
 * ```ts
 * import { NgModule, ErrorHandler } from '@angular/core';
 * import { UncaughtErrorHandler } from '@uncaughtdev/angular';
 *
 * @NgModule({
 *   providers: [
 *     { provide: ErrorHandler, useClass: UncaughtErrorHandler },
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class UncaughtErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    try {
      const client = getClient();
      client?.captureError(
        error instanceof Error ? error : new Error(String(error))
      );
    } catch (e) {
      // Never crash the host app from error reporting
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to capture error:', e);
      }
    }

    // Preserve Angular's default behavior of logging to console
    console.error(error);
  }
}
