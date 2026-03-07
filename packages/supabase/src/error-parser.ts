// ---------------------------------------------------------------------------
// @uncaughtdev/supabase — error parser
// ---------------------------------------------------------------------------
//
// Detects the type of Supabase error by inspecting its shape/properties, then
// maps it to a structured ParsedSupabaseError with human-readable explanation.
// ---------------------------------------------------------------------------

import type { ParsedSupabaseError } from './types';
import {
  explainSupabaseError,
  getCategoryForCode,
  type ExplainerContext,
} from './rls-explainer';

// ---------------------------------------------------------------------------
// Error shape interfaces (matching Supabase SDK error types)
// ---------------------------------------------------------------------------

interface PostgrestErrorShape {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
}

interface AuthErrorShape {
  message: string;
  status?: number;
  name?: string;
  __isAuthError?: boolean;
}

interface FunctionsErrorShape {
  message: string;
  name?: string;
  context?: unknown;
}

interface StorageErrorShape {
  message: string;
  statusCode?: string | number;
  error?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isPostgrestError(error: unknown): error is PostgrestErrorShape {
  if (error === null || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  return (
    typeof e.message === 'string' &&
    'code' in e &&
    typeof e.code === 'string' &&
    'details' in e &&
    'hint' in e
  );
}

function isAuthError(error: unknown): error is AuthErrorShape {
  if (error === null || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;

  // Supabase auth errors have __isAuthError or specific name patterns
  if (e.__isAuthError === true) return true;
  if (
    typeof e.name === 'string' &&
    (e.name === 'AuthApiError' ||
      e.name === 'AuthRetryableFetchError' ||
      e.name === 'AuthUnknownError' ||
      e.name === 'AuthWeakPasswordError' ||
      e.name === 'AuthSessionMissingError')
  ) {
    return true;
  }

  return false;
}

function isFunctionsError(error: unknown): error is FunctionsErrorShape {
  if (error === null || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    (e.name === 'FunctionsHttpError' ||
      e.name === 'FunctionsRelayError' ||
      e.name === 'FunctionsFetchError')
  );
}

function isStorageError(error: unknown): error is StorageErrorShape {
  if (error === null || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;

  // Storage errors from Supabase have statusCode and/or a name containing 'Storage'
  if (typeof e.name === 'string' && e.name === 'StorageApiError') return true;
  if (typeof e.statusCode === 'string' || typeof e.statusCode === 'number') {
    // Must also have a message to qualify
    return typeof e.message === 'string';
  }

  return false;
}

// ---------------------------------------------------------------------------
// Auth error classification
// ---------------------------------------------------------------------------

/**
 * Derive an internal error code key for auth errors based on message content.
 */
function classifyAuthError(error: AuthErrorShape): string {
  const msg = error.message.toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'auth_invalid_credentials';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'auth_email_not_confirmed';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || error.status === 429) {
    return 'auth_rate_limited';
  }
  if (msg.includes('user not found') || msg.includes('no user found')) {
    return 'auth_user_not_found';
  }
  if (msg.includes('session not found') || msg.includes('not authenticated') || msg.includes('session_not_found')) {
    return 'auth_session_not_found';
  }
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled') || msg.includes('signups are disabled')) {
    return 'auth_signup_disabled';
  }

  return 'auth_unknown';
}

// ---------------------------------------------------------------------------
// Functions error classification
// ---------------------------------------------------------------------------

/**
 * Derive an internal error code key for edge function errors.
 */
function classifyFunctionsError(error: FunctionsErrorShape): string {
  const msg = error.message.toLowerCase();
  const name = error.name ?? '';

  if (name === 'FunctionsRelayError') {
    return 'functions_relay_error';
  }
  if (name === 'FunctionsFetchError') {
    return 'functions_fetch_error';
  }

  // FunctionsHttpError — inspect message for specifics
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline exceeded')) {
    return 'functions_timeout';
  }
  if (msg.includes('cors') || msg.includes('cross-origin')) {
    return 'functions_cors';
  }
  if (msg.includes('not found') || msg.includes('404')) {
    return 'functions_not_found';
  }
  if (msg.includes('crashed') || msg.includes('internal server error') || msg.includes('500')) {
    return 'functions_crashed';
  }

  return 'functions_crashed'; // default for unknown HTTP errors
}

// ---------------------------------------------------------------------------
// Storage error classification
// ---------------------------------------------------------------------------

/**
 * Derive an internal error code key for storage errors.
 */
function classifyStorageError(error: StorageErrorShape): string {
  const msg = error.message.toLowerCase();
  const code = String(error.statusCode ?? '');

  if (msg.includes('bucket') && (msg.includes('not found') || msg.includes('does not exist'))) {
    return 'storage_bucket_not_found';
  }
  if (msg.includes('too large') || msg.includes('payload too large') || msg.includes('file size') || code === '413') {
    return 'storage_object_too_large';
  }
  if (msg.includes('permission') || msg.includes('not authorized') || msg.includes('policy') || code === '403') {
    return 'storage_permission_denied';
  }
  if (msg.includes('not found') || msg.includes('object not found') || code === '404') {
    return 'storage_object_not_found';
  }

  return 'storage_permission_denied'; // default to permission for unknown storage errors
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Additional context to aid error parsing and explanation generation.
 */
export interface ErrorParserContext {
  /** The table name from the query tracker. */
  table?: string;
  /** The operation type (select, insert, update, etc.). */
  operation?: string;
  /** The edge function name for function invocation errors. */
  functionName?: string;
  /** The storage bucket name. */
  bucketName?: string;
  /** The human-readable query chain. */
  queryChain?: string;
}

/**
 * Parse any Supabase error into a structured ParsedSupabaseError.
 *
 * Detects the error type by inspecting the object's shape and properties,
 * then provides a categorized result with human-readable explanation.
 *
 * @param error   - The error object from Supabase ({ data, error } result).
 * @param context - Optional context for richer explanations.
 * @returns A fully structured ParsedSupabaseError.
 */
export function parseSupabaseError(
  error: unknown,
  context?: ErrorParserContext,
): ParsedSupabaseError {
  try {
    // Build explainer context from the parser context
    const explainerCtx: ExplainerContext = {
      table: context?.table,
      operation: context?.operation,
      name: context?.functionName,
      column: undefined,
      constraint: undefined,
    };

    // ----- PostgrestError -----
    if (isPostgrestError(error)) {
      const errorCode = error.code;
      const explanation = explainSupabaseError(errorCode, explainerCtx);
      const category = getCategoryForCode(errorCode);

      return {
        errorType: 'postgrest',
        errorCode,
        message: buildPostgrestMessage(error),
        humanExplanation: explanation,
        suggestedCategory: category,
      };
    }

    // ----- AuthError -----
    if (isAuthError(error)) {
      const internalCode = classifyAuthError(error);
      const explanation = explainSupabaseError(internalCode, explainerCtx);
      const category = getCategoryForCode(internalCode);

      return {
        errorType: 'auth',
        errorCode: error.name ?? internalCode,
        message: error.message,
        humanExplanation: explanation,
        suggestedCategory: category !== 'unknown' ? category : internalCode,
      };
    }

    // ----- FunctionsError -----
    if (isFunctionsError(error)) {
      const internalCode = classifyFunctionsError(error);
      const explanation = explainSupabaseError(internalCode, explainerCtx);
      const category = getCategoryForCode(internalCode);

      return {
        errorType: 'functions',
        errorCode: error.name ?? internalCode,
        message: error.message,
        humanExplanation: explanation,
        suggestedCategory: category !== 'unknown' ? category : internalCode,
      };
    }

    // ----- StorageError -----
    if (isStorageError(error)) {
      const internalCode = classifyStorageError(error);
      const explanation = explainSupabaseError(internalCode, explainerCtx);
      const category = getCategoryForCode(internalCode);

      return {
        errorType: 'storage',
        errorCode: String(error.statusCode ?? internalCode),
        message: error.message,
        humanExplanation: explanation,
        suggestedCategory: category !== 'unknown' ? category : internalCode,
      };
    }

    // ----- Generic / unknown error -----
    return parseGenericError(error);
  } catch {
    // Never let the parser itself crash the host app
    return {
      errorType: 'unknown',
      errorCode: 'PARSE_ERROR',
      message: 'Failed to parse error object',
      humanExplanation:
        'An error occurred but could not be parsed. Check the raw error for details.',
      suggestedCategory: 'unknown',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a comprehensive message string from a PostgREST error, including
 * details and hint when available.
 */
function buildPostgrestMessage(error: PostgrestErrorShape): string {
  let msg = error.message;
  if (error.details) {
    msg += ` | Details: ${error.details}`;
  }
  if (error.hint) {
    msg += ` | Hint: ${error.hint}`;
  }
  return msg;
}

/**
 * Handle generic/unknown error shapes that don't match any known Supabase type.
 */
function parseGenericError(error: unknown): ParsedSupabaseError {
  let message = 'Unknown error';
  let errorCode = 'UNKNOWN';

  if (error instanceof Error) {
    message = error.message;
    errorCode = error.name ?? 'Error';
  } else if (error !== null && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string') {
      message = e.message;
    }
    if (typeof e.code === 'string') {
      errorCode = e.code;
    } else if (typeof e.name === 'string') {
      errorCode = e.name;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  return {
    errorType: 'unknown',
    errorCode,
    message,
    humanExplanation: `Supabase error: ${message}. This error type was not recognized by the parser. Refer to the Supabase documentation for more details.`,
    suggestedCategory: 'unknown',
  };
}
