// ---------------------------------------------------------------------------
// @uncaughtdev/supabase — Supabase-specific type definitions
// ---------------------------------------------------------------------------

/**
 * Options for configuring which Supabase subsystems are tracked by the proxy.
 */
export interface WrapSupabaseOptions {
  /**
   * Track database queries (.from().select/.insert/.update/.upsert/.delete).
   * @default true
   */
  trackQueries?: boolean;

  /**
   * Track authentication operations (.auth.signUp, .auth.signIn*, etc.).
   * @default true
   */
  trackAuth?: boolean;

  /**
   * Track edge function invocations (.functions.invoke).
   * @default true
   */
  trackFunctions?: boolean;

  /**
   * Track storage operations (.storage.from().upload/.download/.remove, etc.).
   * @default false
   */
  trackStorage?: boolean;

  /**
   * Track realtime channel subscriptions and messages.
   * @default false
   */
  trackRealtime?: boolean;
}

/**
 * A single step in a Supabase query builder chain.
 * Records the method name and the arguments passed to it.
 */
export interface QueryChainStep {
  method: string;
  args: unknown[];
}

/**
 * Represents a fully-tracked Supabase query with all chain steps
 * and metadata extracted from the builder chain.
 */
export interface TrackedQuery {
  /** The table name extracted from .from('table'). */
  table: string;

  /** The primary operation type (select, insert, update, upsert, delete, rpc). */
  operation: string;

  /** All method calls in the chain, in order. */
  chain: QueryChainStep[];

  /** Human-readable string representation of the full query chain. */
  humanReadable: string;
}

/**
 * Structured parse result from a Supabase error.
 */
export interface ParsedSupabaseError {
  /** High-level category: 'postgrest' | 'auth' | 'functions' | 'storage' | 'unknown'. */
  errorType: string;

  /** The specific error code (e.g. '42501', 'PGRST116', 'AuthApiError'). */
  errorCode: string;

  /** The raw error message. */
  message: string;

  /** Human-readable explanation with actionable guidance. */
  humanExplanation: string;

  /** Suggested UncaughtEvent category for grouping. */
  suggestedCategory: string;
}
