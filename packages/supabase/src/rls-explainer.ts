// ---------------------------------------------------------------------------
// @uncaught/supabase — human-readable error explanations
// ---------------------------------------------------------------------------
//
// Maps Supabase / PostgreSQL error codes to developer-friendly explanations
// with contextual variable interpolation.
// ---------------------------------------------------------------------------

/**
 * Context variables that can be interpolated into explanation templates.
 */
export interface ExplainerContext {
  table?: string;
  operation?: string;
  name?: string;
  column?: string;
  constraint?: string;
  [key: string]: string | undefined;
}

/**
 * An explanation template with {variable} placeholders.
 */
interface ExplanationTemplate {
  template: string;
  category: string;
}

/**
 * Registry of error code to explanation template mappings.
 *
 * Templates support {variable} interpolation from the ExplainerContext.
 * Unknown variables are left as-is in the output (e.g. "{table}" if no
 * table context is provided).
 */
const EXPLANATIONS: Record<string, ExplanationTemplate> = {
  // -------------------------------------------------------------------------
  // PostgreSQL error codes
  // -------------------------------------------------------------------------

  '42501': {
    template:
      "The RLS policy on the '{table}' table does not allow {operation} operations for the current user role. " +
      "Check your RLS policies in the Supabase dashboard under Authentication > Policies for the '{table}' table. " +
      'Common causes: missing policy for the operation type, policy condition not matching the current user, ' +
      "or the user's JWT role not having the expected grants.",
    category: 'rls_violation',
  },

  '23505': {
    template:
      "A record with this value already exists. The unique constraint on table '{table}' was violated. " +
      'This typically means you are trying to insert or update a row with a value that must be unique ' +
      '(e.g. email, username, slug) but another row already has that value. ' +
      'Consider using .upsert() instead of .insert() if you want to update on conflict, ' +
      'or check for existing records before inserting.',
    category: 'unique_violation',
  },

  '23503': {
    template:
      "The referenced record does not exist. The foreign key constraint on table '{table}' failed. " +
      'This means you are trying to insert or update a row that references another row (via a foreign key) ' +
      'that does not exist in the referenced table. Ensure the referenced record exists before ' +
      'creating this relationship, or check that the foreign key value is correct.',
    category: 'foreign_key_violation',
  },

  '23502': {
    template:
      "A required field was not provided. The not-null constraint on table '{table}' was violated. " +
      'One or more columns that are defined as NOT NULL did not receive a value in the insert or update. ' +
      'Check your insert/update payload to ensure all required fields are present, ' +
      'or set a default value for the column in your database schema.',
    category: 'not_null_violation',
  },

  '42P01': {
    template:
      "The table '{table}' does not exist in the database. This could mean the table name is misspelled, " +
      'the table has not been created yet, or you are connecting to the wrong database/schema. ' +
      "Check the table name in your .from() call and verify it exists in the Supabase dashboard's " +
      'Table Editor.',
    category: 'undefined_table',
  },

  '42703': {
    template:
      "The column '{column}' does not exist in table '{table}'. Check that the column name is spelled " +
      'correctly and that any recent migrations have been applied.',
    category: 'undefined_column',
  },

  '42883': {
    template:
      "The function or operator does not exist. If you are using .rpc('{name}'), check that the function " +
      'exists in your database and that the argument types match.',
    category: 'undefined_function',
  },

  // -------------------------------------------------------------------------
  // PostgREST error codes
  // -------------------------------------------------------------------------

  PGRST116: {
    template:
      'Expected a single row but got none. The .single() call on the query returned 0 rows. ' +
      "This means no record matched your filter conditions in table '{table}'. " +
      'If the record might not exist, use .maybeSingle() instead of .single() ' +
      'to return null instead of an error when no rows match.',
    category: 'no_rows',
  },

  PGRST301: {
    template:
      'The authentication token (JWT) has expired. The user needs to re-authenticate. ' +
      'This typically happens when the session has been idle for longer than the JWT expiry time. ' +
      'Call supabase.auth.refreshSession() to attempt a token refresh, or redirect the user ' +
      'to the sign-in page. Consider setting up an onAuthStateChange listener to handle ' +
      'token refreshes automatically.',
    category: 'jwt_expired',
  },

  PGRST204: {
    template:
      "The column '{column}' specified in the query does not exist in the database schema. " +
      'PostgREST could not find this column when processing the query.',
    category: 'column_not_found',
  },

  PGRST200: {
    template:
      "An ambiguous embedding was detected. The relationship between '{table}' and the referenced " +
      'table could not be resolved because multiple foreign keys exist. ' +
      'Specify the foreign key explicitly using the !inner or !left join syntax.',
    category: 'ambiguous_embedding',
  },

  // -------------------------------------------------------------------------
  // Auth error patterns (matched by message content, not code)
  // -------------------------------------------------------------------------

  auth_invalid_credentials: {
    template:
      'The email or password is incorrect. Note: if the user recently signed up, their email ' +
      'may not be confirmed yet. Check the Supabase dashboard under Authentication > Users to see ' +
      "the user's confirmation status. Also verify that the email provider is enabled in " +
      'Authentication > Providers.',
    category: 'auth_invalid_credentials',
  },

  auth_email_not_confirmed: {
    template:
      'The user has signed up but has not confirmed their email address. ' +
      'Check your email confirmation settings in Authentication > Settings. ' +
      'You can disable email confirmation for development, or resend the confirmation email ' +
      'using supabase.auth.resend({ type: "signup", email }).',
    category: 'auth_email_not_confirmed',
  },

  auth_rate_limited: {
    template:
      'Too many authentication attempts. Supabase rate limits auth endpoints to prevent abuse. ' +
      'The default rate limit is approximately 30 requests per hour for auth endpoints. ' +
      'Wait a few minutes before trying again. If you are hitting this in production, ' +
      'consider implementing client-side rate limiting or CAPTCHA.',
    category: 'auth_rate_limited',
  },

  auth_user_not_found: {
    template:
      'No user was found with the provided credentials. The user may not have signed up yet, ' +
      'or the account may have been deleted.',
    category: 'auth_user_not_found',
  },

  auth_session_not_found: {
    template:
      'No active session was found. The user is not currently signed in or their session has expired. ' +
      'Redirect the user to the sign-in page.',
    category: 'auth_session_not_found',
  },

  auth_signup_disabled: {
    template:
      'New user signups have been disabled for this project. Enable signups in the Supabase dashboard ' +
      'under Authentication > Settings.',
    category: 'auth_signup_disabled',
  },

  // -------------------------------------------------------------------------
  // Edge Functions error patterns
  // -------------------------------------------------------------------------

  functions_timeout: {
    template:
      "The edge function '{name}' timed out. Edge functions have a default execution time limit " +
      '(typically 60 seconds on the free plan). Consider optimizing the function, ' +
      'breaking it into smaller operations, or upgrading your Supabase plan for longer execution times.',
    category: 'functions_timeout',
  },

  functions_crashed: {
    template:
      "The edge function '{name}' crashed during execution. Check the function logs in the " +
      'Supabase dashboard under Edge Functions > Logs for the specific error. ' +
      'Common causes: unhandled exceptions, out-of-memory errors, or missing environment variables.',
    category: 'functions_crashed',
  },

  functions_cors: {
    template:
      "The edge function '{name}' was blocked by CORS. Ensure the function sets the appropriate " +
      "CORS headers in its response. Add 'Access-Control-Allow-Origin' and other necessary CORS " +
      'headers, and handle OPTIONS preflight requests.',
    category: 'functions_cors',
  },

  functions_not_found: {
    template:
      "The edge function '{name}' was not found. Verify that the function has been deployed " +
      'and that the function name matches exactly (case-sensitive).',
    category: 'functions_not_found',
  },

  functions_relay_error: {
    template:
      "The edge function '{name}' encountered a relay error. This is typically a transient " +
      'infrastructure issue. Retry the request after a brief delay.',
    category: 'functions_relay_error',
  },

  functions_fetch_error: {
    template:
      "Failed to invoke the edge function '{name}'. This could be a network connectivity issue, " +
      'DNS resolution failure, or the Supabase project may be paused. Check your internet connection ' +
      'and verify the project is active in the Supabase dashboard.',
    category: 'functions_fetch_error',
  },

  // -------------------------------------------------------------------------
  // Storage error patterns
  // -------------------------------------------------------------------------

  storage_bucket_not_found: {
    template:
      'The storage bucket was not found. Verify the bucket name is correct and that it has been ' +
      "created in the Supabase dashboard under Storage. Bucket names are case-sensitive.",
    category: 'storage_bucket_not_found',
  },

  storage_object_too_large: {
    template:
      'The uploaded file exceeds the maximum allowed size. Check the file size limit configured ' +
      'for this bucket in the Supabase dashboard under Storage > Policies. ' +
      'The default maximum file size is 50MB on the free plan.',
    category: 'storage_object_too_large',
  },

  storage_permission_denied: {
    template:
      'Permission denied for this storage operation. Check the storage policies (RLS) configured ' +
      'for this bucket. Storage uses its own set of policies separate from table-level RLS. ' +
      'Configure policies in the Supabase dashboard under Storage > Policies.',
    category: 'storage_permission_denied',
  },

  storage_object_not_found: {
    template:
      'The requested file does not exist in storage. Verify the file path is correct and that ' +
      'the file has been uploaded. File paths in storage are case-sensitive.',
    category: 'storage_object_not_found',
  },
};

/**
 * Interpolate {variable} placeholders in a template string.
 *
 * Any variable in the template that is not found in the context is left
 * as-is (e.g. `{table}` remains if context.table is undefined).
 */
function interpolate(template: string, context: ExplainerContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = context[key];
    return value !== undefined ? value : match;
  });
}

/**
 * Get a human-readable explanation for a Supabase error code.
 *
 * @param errorCode - The error code (PostgreSQL code, PostgREST code, or
 *                    internal category key like 'auth_invalid_credentials').
 * @param context   - Optional context variables for template interpolation.
 * @returns A human-readable explanation string. Falls back to a generic
 *          message if the error code is not recognized.
 */
export function explainSupabaseError(
  errorCode: string,
  context?: ExplainerContext,
): string {
  const entry = EXPLANATIONS[errorCode];

  if (!entry) {
    return `Supabase error (code: ${errorCode}). Refer to the Supabase documentation or PostgreSQL error code reference for more details.`;
  }

  return interpolate(entry.template, context ?? {});
}

/**
 * Get the suggested category for a known error code.
 *
 * @param errorCode - The error code to look up.
 * @returns The category string, or 'unknown' if the code is not recognized.
 */
export function getCategoryForCode(errorCode: string): string {
  const entry = EXPLANATIONS[errorCode];
  return entry?.category ?? 'unknown';
}
