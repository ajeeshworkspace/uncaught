import { NgModule, ErrorHandler, ModuleWithProviders } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { initUncaught, type UncaughtConfig } from '@uncaughtdev/core';
import { UncaughtErrorHandler } from './error-handler';
import { UncaughtInterceptor } from './interceptor';

/**
 * Angular module that configures Uncaught error monitoring for the application.
 * Provides the UncaughtErrorHandler and UncaughtInterceptor automatically.
 *
 * Usage:
 * ```ts
 * import { UncaughtModule } from '@uncaughtdev/angular';
 *
 * @NgModule({
 *   imports: [
 *     UncaughtModule.forRoot({ dsn: 'your-dsn', environment: 'production' }),
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@NgModule({
  providers: [
    { provide: ErrorHandler, useClass: UncaughtErrorHandler },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: UncaughtInterceptor,
      multi: true,
    },
  ],
})
export class UncaughtModule {
  /**
   * Initializes the Uncaught client and returns the module with all providers.
   * Call this in your root AppModule.
   *
   * @param config - Partial Uncaught configuration.
   * @returns A ModuleWithProviders for the UncaughtModule.
   */
  static forRoot(
    config?: Partial<UncaughtConfig>
  ): ModuleWithProviders<UncaughtModule> {
    // Initialize the Uncaught client
    initUncaught((config ?? {}) as UncaughtConfig);

    return {
      ngModule: UncaughtModule,
    };
  }
}
