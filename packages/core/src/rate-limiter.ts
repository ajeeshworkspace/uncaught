// ---------------------------------------------------------------------------
// @uncaught/core — sliding-window rate limiter
// ---------------------------------------------------------------------------

/** Window duration in milliseconds (60 seconds). */
const WINDOW_MS = 60_000;

export interface RateLimiter {
  /**
   * Returns `true` if the event identified by `fingerprint` is allowed
   * through, `false` if it should be dropped.
   */
  shouldAllow(fingerprint: string): boolean;
}

/**
 * Create a rate limiter that enforces:
 *  - A global maximum of `globalMax` events per 60-second window.
 *  - A per-fingerprint maximum of `perFingerprintMax` events per 60-second window.
 *
 * Stale timestamps are lazily cleaned on every call to `shouldAllow`.
 *
 * @param globalMax          Max events across all fingerprints. Defaults to 30.
 * @param perFingerprintMax  Max events for a single fingerprint. Defaults to 5.
 */
export function createRateLimiter(
  globalMax: number = 30,
  perFingerprintMax: number = 5
): RateLimiter {
  /** Per-fingerprint timestamp arrays. */
  const buckets = new Map<string, number[]>();
  /** Global timestamp array. */
  let globalTimestamps: number[] = [];

  /**
   * Remove timestamps older than the sliding window from an array (in-place)
   * and return the pruned array.
   */
  function prune(timestamps: number[], now: number): number[] {
    const cutoff = now - WINDOW_MS;
    // Find the first index that is within the window
    let start = 0;
    while (start < timestamps.length && timestamps[start] <= cutoff) {
      start++;
    }
    if (start > 0) {
      timestamps.splice(0, start);
    }
    return timestamps;
  }

  return {
    shouldAllow(fingerprint: string): boolean {
      const now = Date.now();

      // --- Global limit ---
      globalTimestamps = prune(globalTimestamps, now);
      if (globalTimestamps.length >= globalMax) {
        return false;
      }

      // --- Per-fingerprint limit ---
      let fpTimestamps = buckets.get(fingerprint);
      if (!fpTimestamps) {
        fpTimestamps = [];
        buckets.set(fingerprint, fpTimestamps);
      }
      prune(fpTimestamps, now);

      if (fpTimestamps.length >= perFingerprintMax) {
        return false;
      }

      // Record this event
      globalTimestamps.push(now);
      fpTimestamps.push(now);

      // Periodic cleanup: remove empty buckets to prevent unbounded memory growth
      if (buckets.size > 1000) {
        for (const [key, ts] of buckets) {
          if (ts.length === 0) {
            buckets.delete(key);
          }
        }
      }

      return true;
    },
  };
}
