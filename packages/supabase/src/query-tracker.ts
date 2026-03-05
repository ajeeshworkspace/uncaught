// ---------------------------------------------------------------------------
// @uncaught/supabase — query chain tracker
// ---------------------------------------------------------------------------
//
// Records each method call in a Supabase query builder chain so that errors
// can be reported with full context about what the developer was trying to do.
// ---------------------------------------------------------------------------

import { sanitize } from '@uncaught/core';
import type { OperationInfo } from '@uncaught/core';
import type { QueryChainStep, TrackedQuery } from './types';

/** Maximum number of items to keep from bulk insert/upsert arrays. */
const MAX_BULK_PREVIEW = 3;

/** Primary CRUD operations that determine the query type. */
const CRUD_METHODS = new Set([
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
]);

/**
 * Sanitize a single argument value.
 * - Arrays of objects (bulk inserts) are truncated to the first N items.
 * - Everything is run through the core sanitizer to redact sensitive keys.
 */
function sanitizeArg(value: unknown): unknown {
  try {
    if (Array.isArray(value) && value.length > MAX_BULK_PREVIEW) {
      const truncated = value.slice(0, MAX_BULK_PREVIEW).map((item) => {
        if (item !== null && typeof item === 'object') {
          return sanitize(item as Record<string, unknown>);
        }
        return item;
      });
      return `[${truncated.map((v) => JSON.stringify(v)).join(', ')} ... and ${value.length - MAX_BULK_PREVIEW} more]`;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return sanitize(value as Record<string, unknown>);
    }

    return value;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Sanitize an array of arguments for safe storage and display.
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map(sanitizeArg);
}

/**
 * Format a single value for the human-readable query string.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      if (str.length > 120) {
        return str.slice(0, 117) + '...';
      }
      return str;
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/**
 * Tracks method calls in a Supabase query builder chain.
 *
 * Usage:
 * ```ts
 * const tracker = new QueryTracker();
 * tracker.track('from', ['orders']);
 * tracker.track('select', ['*']);
 * tracker.track('eq', ['user_id', '123']);
 *
 * tracker.getTable();        // 'orders'
 * tracker.getOperation();    // 'select'
 * tracker.toHumanReadable(); // ".from('orders').select('*').eq('user_id', '123')"
 * ```
 */
export class QueryTracker {
  private readonly steps: QueryChainStep[] = [];
  private tableName = '';
  private operationType = 'unknown';

  /**
   * Record a method call in the chain.
   *
   * @param method - The method name (e.g. 'from', 'select', 'eq').
   * @param args   - The arguments passed to the method.
   */
  track(method: string, args: unknown[]): void {
    const sanitizedArgs = sanitizeArgs(args);
    this.steps.push({ method, args: sanitizedArgs });

    // Extract table name from .from('tableName')
    if (method === 'from' && args.length > 0 && typeof args[0] === 'string') {
      this.tableName = args[0];
    }

    // Extract operation type from CRUD methods
    if (CRUD_METHODS.has(method)) {
      this.operationType = method;
    }

    // Also detect .rpc() calls
    if (method === 'rpc') {
      this.operationType = 'rpc';
    }
  }

  /**
   * Get the table name extracted from .from() calls.
   */
  getTable(): string {
    return this.tableName;
  }

  /**
   * Get the primary CRUD operation type.
   */
  getOperation(): string {
    return this.operationType;
  }

  /**
   * Get all tracked steps.
   */
  getSteps(): QueryChainStep[] {
    return [...this.steps];
  }

  /**
   * Build a human-readable representation of the full query chain.
   *
   * @example
   * ".from('orders').select('*').eq('user_id', '123').limit(10)"
   */
  toHumanReadable(): string {
    if (this.steps.length === 0) {
      return '(empty chain)';
    }

    return this.steps
      .map((step) => {
        const formattedArgs = step.args.map(formatValue).join(', ');
        return `.${step.method}(${formattedArgs})`;
      })
      .join('');
  }

  /**
   * Convert the tracked query into a full TrackedQuery object.
   */
  toTrackedQuery(): TrackedQuery {
    return {
      table: this.tableName,
      operation: this.operationType,
      chain: [...this.steps],
      humanReadable: this.toHumanReadable(),
    };
  }

  /**
   * Convert the tracked query into an OperationInfo compatible with UncaughtEvent.
   */
  toOperationInfo(): OperationInfo {
    return {
      provider: 'supabase',
      type: 'query',
      method: this.operationType,
      params: {
        table: this.tableName,
        chain: this.toHumanReadable(),
      },
    };
  }

  /**
   * Check if any steps have been tracked.
   */
  isEmpty(): boolean {
    return this.steps.length === 0;
  }

  /**
   * Reset the tracker for reuse.
   */
  reset(): void {
    this.steps.length = 0;
    this.tableName = '';
    this.operationType = 'unknown';
  }
}
