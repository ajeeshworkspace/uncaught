// --- Vue Plugin ---
export { UncaughtPlugin } from './plugin';

// --- Vue Composables ---
export { useUncaught, useReportError, useBreadcrumb } from './composables';

// --- Vue Router Integration ---
export { setupRouterBreadcrumbs } from './router-integration';

// --- Re-exports from @uncaughtdev/core ---
export { initUncaught, getClient } from '@uncaughtdev/core';

export type {
  UncaughtConfig,
  UncaughtClient,
  UncaughtEvent,
  Breadcrumb,
  EnvironmentInfo,
} from '@uncaughtdev/core';
