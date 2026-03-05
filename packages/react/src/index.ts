// --- React Components ---
export { UncaughtProvider } from './provider';
export { UncaughtErrorBoundary } from './error-boundary';

// --- React Hooks ---
export { useUncaught, useReportError, useBreadcrumb } from './hooks';

// --- React Context ---
export { UncaughtContext } from './context';

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

// --- Re-exports from @uncaught/core ---
export { initUncaught, getClient } from '@uncaught/core';

export type {
  UncaughtConfig,
  UncaughtClient,
  UncaughtEvent,
  Breadcrumb,
  EnvironmentInfo,
} from '@uncaught/core';
