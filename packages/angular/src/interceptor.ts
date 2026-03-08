import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { getClient } from '@uncaughtdev/core';

/**
 * Angular HttpInterceptor that automatically records HTTP request breadcrumbs
 * and captures HTTP errors for Uncaught error monitoring.
 *
 * Usage:
 * ```ts
 * import { NgModule } from '@angular/core';
 * import { HTTP_INTERCEPTORS } from '@angular/common/http';
 * import { UncaughtInterceptor } from '@uncaughtdev/angular';
 *
 * @NgModule({
 *   providers: [
 *     { provide: HTTP_INTERCEPTORS, useClass: UncaughtInterceptor, multi: true },
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class UncaughtInterceptor implements HttpInterceptor {
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    try {
      const client = getClient();
      client?.addBreadcrumb({
        type: 'api_call',
        category: 'http',
        message: `${req.method} ${req.url}`,
        level: 'info',
      });
    } catch (e) {
      // Never crash the host app from breadcrumb recording
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Failed to add HTTP breadcrumb:', e);
      }
    }

    return next.handle(req).pipe(
      tap({
        error: (error) => {
          try {
            const client = getClient();
            client?.captureError(
              error instanceof Error ? error : new Error(String(error))
            );
          } catch (e) {
            // Never crash the host app
            if (process.env.NODE_ENV === 'development') {
              console.error(
                '[Uncaught] Failed to capture HTTP error:',
                e
              );
            }
          }
        },
      })
    );
  }
}
