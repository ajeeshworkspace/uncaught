// ---------------------------------------------------------------------------
// @uncaught/core — public API barrel export
// ---------------------------------------------------------------------------

export { initUncaught, getClient, UncaughtClient } from './client';
export * from './types';
export { createBreadcrumbStore } from './breadcrumbs';
export { sanitize } from './sanitizer';
export { buildFixPrompt } from './prompt-builder';
export { generateFingerprint } from './fingerprint';
export { createRateLimiter } from './rate-limiter';
export { detectEnvironment } from './env-detector';
export { createTransport } from './transport';
export { generateUUID, safeStringify, isoTimestamp, truncate } from './utils';
