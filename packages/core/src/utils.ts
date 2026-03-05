// ---------------------------------------------------------------------------
// @uncaught/core — utility helpers
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string using `Math.random`.
 * Not cryptographically secure — suitable for event IDs.
 */
export function generateUUID(): string {
  // RFC 4122 version 4 UUID template
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Safely serialise a value to JSON, handling circular references.
 *
 * @param obj      - The value to serialise.
 * @param maxDepth - Maximum nesting depth before values are replaced with
 *                   `"[Max Depth]"`. Defaults to 10.
 */
export function safeStringify(obj: unknown, maxDepth: number = 10): string {
  const seen = new WeakSet();

  function walk(value: unknown, depth: number): unknown {
    // Primitives pass through
    if (value === null || value === undefined) return value;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;

    // Depth guard
    if (depth > maxDepth) return '[Max Depth]';

    // Dates → ISO string
    if (value instanceof Date) return value.toISOString();

    // Objects and arrays — circular reference detection
    if (typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);

      let result: unknown;
      if (Array.isArray(value)) {
        result = value.map((item) => walk(item, depth + 1));
      } else {
        const obj: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>)) {
          obj[key] = walk((value as Record<string, unknown>)[key], depth + 1);
        }
        result = obj;
      }

      seen.delete(value as object);
      return result;
    }

    return value;
  }

  try {
    const safe = walk(obj, 0);
    return JSON.stringify(safe);
  } catch {
    return '"[Unserializable]"';
  }
}

/**
 * Return the current date/time as an ISO 8601 string.
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Truncate a string to `maxLen` characters, appending "..." when truncated.
 */
export function truncate(str: string, maxLen: number = 200): string {
  if (str.length <= maxLen) {
    return str;
  }
  return str.slice(0, maxLen - 3) + '...';
}
