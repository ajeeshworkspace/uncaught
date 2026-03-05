// ---------------------------------------------------------------------------
// @uncaught/supabase — public API
// ---------------------------------------------------------------------------
//
// Minimal surface: one function, one type export. Wrap your Supabase client
// to automatically capture failed queries, auth errors, and edge function
// invocations via the Uncaught error monitoring SDK.
//
// Usage:
//   import { createClient } from '@supabase/supabase-js';
//   import { wrapSupabase } from '@uncaught/supabase';
//
//   const supabase = wrapSupabase(
//     createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
//     { trackStorage: true }
//   );
//
//   // Use supabase exactly as before — errors are captured automatically.
//   const { data, error } = await supabase.from('todos').select('*');
// ---------------------------------------------------------------------------

import { createSupabaseProxy } from './proxy';
import type { WrapSupabaseOptions } from './types';

export type { WrapSupabaseOptions } from './types';
export type { TrackedQuery, QueryChainStep, ParsedSupabaseError } from './types';

/**
 * Wrap a Supabase client with transparent error interception.
 *
 * The returned client has the exact same type and behavior as the original.
 * All Supabase operations work identically — the wrapper only observes
 * results and captures errors through the @uncaught/core client.
 *
 * @param client  - A SupabaseClient instance from `createClient()`.
 * @param options - Optional configuration for which subsystems to track.
 *                  By default, queries, auth, and functions are tracked.
 *                  Storage and realtime are opt-in.
 * @returns The same client, wrapped with transparent error interception.
 *
 * @example
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * import { initUncaught } from '@uncaught/core';
 * import { wrapSupabase } from '@uncaught/supabase';
 *
 * initUncaught({ projectKey: 'my-project' });
 *
 * const supabase = wrapSupabase(
 *   createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
 *   { trackQueries: true, trackAuth: true, trackFunctions: true }
 * );
 * ```
 */
export function wrapSupabase<T>(client: T, options?: WrapSupabaseOptions): T {
  return createSupabaseProxy(client, options ?? {}) as T;
}
