// --- Svelte Client Setup ---
export { setupUncaught } from './client';

// --- SvelteKit Hooks ---
export { handleError, handleClientError } from './hooks';

// --- Re-exports from @uncaughtdev/core ---
export { initUncaught, getClient } from '@uncaughtdev/core';

export type {
  UncaughtConfig,
  UncaughtClient,
  UncaughtEvent,
  Breadcrumb,
  EnvironmentInfo,
} from '@uncaughtdev/core';
