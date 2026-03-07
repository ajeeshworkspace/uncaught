// --- React Components ---
export { UncaughtProvider } from './provider';
export { UncaughtErrorBoundary } from './error-boundary';

// --- React Hooks ---
export { useUncaught, useReportError, useBreadcrumb, useErrorHandler, withErrorCapture } from './hooks';

// --- React Context ---
export { UncaughtContext } from './context';

// --- Web Vitals ---
export { setupWebVitals } from './web-vitals';

// --- Next.js Integration ---
export { detectNextJs, setupNextJsNavigation, withUncaught } from './next-integration';
export type { NextJsDetection } from './next-integration';

// --- React-specific Types ---
export type {
  UncaughtProviderProps,
  UncaughtErrorBoundaryProps,
  UncaughtContextValue,
  ErrorBoundaryState,
} from './types';

// --- Re-exports from @uncaughtdev/core ---
export { initUncaught, getClient } from '@uncaughtdev/core';

export type {
  UncaughtConfig,
  UncaughtClient,
  UncaughtEvent,
  Breadcrumb,
  EnvironmentInfo,
} from '@uncaughtdev/core';
