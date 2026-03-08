// --- Angular Module ---
export { UncaughtModule } from './module';

// --- Angular ErrorHandler ---
export { UncaughtErrorHandler } from './error-handler';

// --- Angular HttpInterceptor ---
export { UncaughtInterceptor } from './interceptor';

// --- Re-exports from @uncaughtdev/core ---
export { initUncaught, getClient } from '@uncaughtdev/core';

export type {
  UncaughtConfig,
  UncaughtClient,
  UncaughtEvent,
  Breadcrumb,
  EnvironmentInfo,
} from '@uncaughtdev/core';
