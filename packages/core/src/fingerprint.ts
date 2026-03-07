// ---------------------------------------------------------------------------
// @uncaughtdev/core — error fingerprinting
// ---------------------------------------------------------------------------

/**
 * Generate a stable fingerprint for an error so that duplicate occurrences
 * of the same bug are grouped together.
 *
 * The fingerprint is an 8-character hex string derived from:
 *  1. The normalised error message (volatile parts stripped).
 *  2. The top 3 stack frames (file + function name, no line/col numbers).
 *
 * @param error - An object with at least `message` and optionally `stack` and `type`.
 */
export function generateFingerprint(error: {
  message?: string;
  type?: string;
  stack?: string;
}): string {
  const normalisedMessage = normaliseMessage(error.message ?? '');
  const frames = extractTopFrames(error.stack ?? '', 3);
  const input = [error.type ?? 'Error', normalisedMessage, ...frames].join(
    '\n'
  );
  return djb2(input);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strip volatile substrings from an error message so that trivially-different
 * occurrences of the same bug hash identically.
 */
function normaliseMessage(msg: string): string {
  return (
    msg
      // UUIDs  (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '<UUID>'
      )
      // Hex strings (8+ hex chars in a row)
      .replace(/\b[0-9a-f]{8,}\b/gi, '<HEX>')
      // Numbers longer than 3 digits
      .replace(/\b\d{4,}\b/g, '<NUM>')
      // ISO timestamps
      .replace(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g,
        '<TIMESTAMP>'
      )
      // Hashed file paths  — replace the hash portion  (e.g. chunk-abc123.js → chunk-<HASH>.js)
      .replace(
        /([/\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\.(js|ts|mjs|cjs|jsx|tsx)/g,
        '$1<FILE>.$3'
      )
      .trim()
  );
}

/**
 * Extract the top N stack frames as normalised "file:function" strings.
 * Line and column numbers are intentionally omitted so that minor code
 * changes do not alter the fingerprint.
 */
function extractTopFrames(stack: string, count: number): string[] {
  if (!stack) return [];

  const lines = stack.split('\n');
  const frames: string[] = [];

  for (const line of lines) {
    if (frames.length >= count) break;

    const trimmed = line.trim();

    // V8 format: "    at FunctionName (file:line:col)"
    // or         "    at file:line:col"
    const v8Match = trimmed.match(
      /at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?/
    );
    if (v8Match) {
      const fn = v8Match[1] || '<anonymous>';
      const file = normalisePath(v8Match[2] || '<unknown>');
      frames.push(`${file}:${fn}`);
      continue;
    }

    // SpiderMonkey / JavaScriptCore: "functionName@file:line:col"
    const smMatch = trimmed.match(/^(.+?)@(.+?):\d+:\d+/);
    if (smMatch) {
      const fn = smMatch[1] || '<anonymous>';
      const file = normalisePath(smMatch[2] || '<unknown>');
      frames.push(`${file}:${fn}`);
      continue;
    }
  }

  return frames;
}

/**
 * Normalise a file path by stripping query strings / hashes and collapsing
 * absolute filesystem prefixes.
 */
function normalisePath(p: string): string {
  return p
    .replace(/[?#].*$/, '') // strip query / hash
    .replace(/^.*\/node_modules\//, 'node_modules/') // collapse deep paths
    .replace(/^(https?:\/\/[^/]+)/, '') // strip origin in URLs
    .replace(/^.*[/\\]/, ''); // keep only filename
}

/**
 * DJB2 hash → 8-character lowercase hex string.
 */
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit then to 8-char hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
