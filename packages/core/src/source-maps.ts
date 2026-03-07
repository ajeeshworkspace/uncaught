// ---------------------------------------------------------------------------
// @uncaughtdev/core — Source map resolution
// ---------------------------------------------------------------------------

import { SourceMapConsumer } from 'source-map';

/**
 * Parsed representation of a single stack frame.
 */
interface StackFrame {
  raw: string;
  file?: string;
  line?: number;
  column?: number;
  fn?: string;
}

// Common build output directories to search for .map files
const DEFAULT_SEARCH_DIRS = [
  '.next/static',
  '.next/server',
  'dist',
  'build',
  'out',
  '.output',
];

/**
 * Parse a single line of a V8/Chrome stack trace into its components.
 * Handles formats like:
 *   at functionName (file:line:col)
 *   at file:line:col
 *   at functionName (webpack-internal:///./src/file.ts:line:col)
 */
function parseFrame(line: string): StackFrame {
  const trimmed = line.trim();

  // Match: at functionName (file:line:col)
  const withFn = trimmed.match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
  if (withFn) {
    return { raw: trimmed, fn: withFn[1], file: withFn[2], line: parseInt(withFn[3], 10), column: parseInt(withFn[4], 10) };
  }

  // Match: at file:line:col
  const noFn = trimmed.match(/^at\s+(.+?):(\d+):(\d+)$/);
  if (noFn) {
    return { raw: trimmed, file: noFn[1], line: parseInt(noFn[2], 10), column: parseInt(noFn[3], 10) };
  }

  return { raw: trimmed };
}

/**
 * Find a .map file for a given source file by searching common build directories.
 */
async function findSourceMap(
  sourceFile: string,
  searchDirs: string[]
): Promise<string | null> {
  try {
    const fs = await import('fs');
    const path = await import('path');

    // Extract the filename from the full path/URL
    const basename = path.basename(sourceFile);
    const mapName = basename + '.map';

    for (const dir of searchDirs) {
      const resolvedDir = path.resolve(dir);
      if (!fs.existsSync(resolvedDir)) continue;

      // Recursive search for the .map file
      const found = findFileRecursive(fs, path, resolvedDir, mapName, 3);
      if (found) return found;
    }

    // Also check if .map file exists next to the source file
    const directMap = sourceFile + '.map';
    if (fs.existsSync(directMap)) return directMap;

    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively search for a file up to maxDepth levels deep.
 */
function findFileRecursive(
  fs: typeof import('fs'),
  path: typeof import('path'),
  dir: string,
  filename: string,
  maxDepth: number
): string | null {
  if (maxDepth <= 0) return null;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const found = findFileRecursive(fs, path, fullPath, filename, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch {
    // Permission errors, etc.
  }
  return null;
}

// Cache for loaded source maps
const mapCache = new Map<string, SourceMapConsumer>();

/**
 * Resolve a minified/bundled stack trace to original source locations
 * using source maps found in common build output directories.
 *
 * @param stack - The raw stack trace string
 * @param searchDirs - Directories to search for .map files (defaults to common build dirs)
 * @returns The resolved stack trace with original file paths and line numbers
 */
export async function resolveStackTrace(
  stack: string,
  searchDirs?: string[]
): Promise<string> {
  if (!stack) return stack;

  const dirs = searchDirs ?? DEFAULT_SEARCH_DIRS;
  const lines = stack.split('\n');
  const resolvedLines: string[] = [];

  for (const line of lines) {
    const frame = parseFrame(line);

    if (!frame.file || !frame.line || !frame.column) {
      resolvedLines.push(line);
      continue;
    }

    try {
      // Check cache first
      let consumer = mapCache.get(frame.file);

      if (!consumer) {
        const mapPath = await findSourceMap(frame.file, dirs);
        if (!mapPath) {
          resolvedLines.push(line);
          continue;
        }

        const fs = await import('fs');
        const rawMap = fs.readFileSync(mapPath, 'utf-8');
        consumer = await new SourceMapConsumer(JSON.parse(rawMap));
        mapCache.set(frame.file, consumer);
      }

      const pos = consumer.originalPositionFor({
        line: frame.line,
        column: frame.column - 1, // source-map uses 0-based columns
      });

      if (pos.source && pos.line) {
        const fnName = pos.name || frame.fn || '<anonymous>';
        resolvedLines.push(`    at ${fnName} (${pos.source}:${pos.line}:${(pos.column ?? 0) + 1})`);
      } else {
        resolvedLines.push(line);
      }
    } catch {
      resolvedLines.push(line);
    }
  }

  return resolvedLines.join('\n');
}

/**
 * Clean up cached source map consumers to free memory.
 */
export function clearSourceMapCache(): void {
  for (const consumer of mapCache.values()) {
    try { consumer.destroy(); } catch { /* ignore */ }
  }
  mapCache.clear();
}
