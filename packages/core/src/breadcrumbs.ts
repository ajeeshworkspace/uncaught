// ---------------------------------------------------------------------------
// @uncaught/core — breadcrumb ring-buffer store
// ---------------------------------------------------------------------------

import type { Breadcrumb, BreadcrumbStore } from './types';
import { isoTimestamp } from './utils';

/**
 * Create a fixed-capacity ring-buffer store for breadcrumbs.
 *
 * - O(1) `add`
 * - Oldest entries are silently overwritten when capacity is reached.
 * - Returned arrays are always copies — callers cannot mutate internal state.
 *
 * @param capacity Maximum breadcrumbs retained. Defaults to 20.
 */
export function createBreadcrumbStore(capacity: number = 20): BreadcrumbStore {
  const buffer: Array<Breadcrumb | undefined> = new Array(capacity);
  let head = 0; // next write index
  let size = 0; // current number of entries

  const store: BreadcrumbStore = {
    add(crumb: Omit<Breadcrumb, 'timestamp'>): void {
      const entry: Breadcrumb = {
        ...crumb,
        timestamp: isoTimestamp(),
      };

      buffer[head] = entry;
      head = (head + 1) % capacity;

      if (size < capacity) {
        size++;
      }
    },

    getAll(): Breadcrumb[] {
      if (size === 0) return [];

      const result: Breadcrumb[] = [];

      // The oldest entry sits at `(head - size + capacity) % capacity`
      const start = (head - size + capacity) % capacity;

      for (let i = 0; i < size; i++) {
        const idx = (start + i) % capacity;
        const entry = buffer[idx];
        if (entry) {
          // Return a shallow copy so callers cannot mutate internal data.
          result.push({ ...entry });
        }
      }

      return result;
    },

    getLast(n: number): Breadcrumb[] {
      if (n <= 0 || size === 0) return [];

      const count = Math.min(n, size);
      const result: Breadcrumb[] = [];

      // Walk backwards from the most recent entry.
      for (let i = 0; i < count; i++) {
        const idx = (head - 1 - i + capacity) % capacity;
        const entry = buffer[idx];
        if (entry) {
          result.unshift({ ...entry });
        }
      }

      return result;
    },

    clear(): void {
      buffer.fill(undefined);
      head = 0;
      size = 0;
    },
  };

  return store;
}
