// ---------------------------------------------------------------------------
// @uncaught/core — PII / secret sanitizer
// ---------------------------------------------------------------------------

/** Default key patterns that are always redacted. */
const DEFAULT_SENSITIVE_KEYS: string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'credit_card',
  'creditcard',
  'card_number',
  'cvv',
  'ssn',
  'social_security',
  'private_key',
  'access_token',
  'refresh_token',
  'session_id',
  'cookie',
];

/** Headers that are always stripped regardless of key matching. */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 2048;

/**
 * Build a single RegExp that matches any of the sensitive key patterns
 * (case-insensitive).
 */
function buildKeyPattern(additionalKeys: string[] = []): RegExp {
  const all = [...DEFAULT_SENSITIVE_KEYS, ...additionalKeys];
  // Escape special regex characters in user-supplied keys
  const escaped = all.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('|'), 'i');
}

/**
 * Deep-clone and sanitise `obj`, redacting values whose keys match
 * sensitive patterns.
 *
 * - Handles circular references (returns `"[Circular]"`).
 * - Truncates strings longer than 2 048 characters.
 * - Never mutates the original object.
 *
 * @param obj            - The value to sanitise.
 * @param additionalKeys - Extra key patterns to redact on top of the defaults.
 */
export function sanitize<T>(obj: T, additionalKeys?: string[]): T {
  const pattern = buildKeyPattern(additionalKeys);
  const seen = new WeakSet();

  function walk(value: unknown, key?: string): unknown {
    // Redact if the current key is sensitive
    if (key && pattern.test(key)) {
      return REDACTED;
    }

    // Primitives
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      return value.length > MAX_STRING_LENGTH
        ? value.slice(0, MAX_STRING_LENGTH) + '...[truncated]'
        : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }

    // Dates — return ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Arrays
    if (Array.isArray(value)) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      const result = value.map((item) => walk(item));
      seen.delete(value);
      return result;
    }

    // Plain objects
    if (typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);

      const result: Record<string, unknown> = {};

      for (const k of Object.keys(value as Record<string, unknown>)) {
        // Always strip sensitive headers
        if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
          result[k] = REDACTED;
          continue;
        }

        result[k] = walk((value as Record<string, unknown>)[k], k);
      }

      seen.delete(value as object);
      return result;
    }

    return value;
  }

  return walk(obj) as T;
}
