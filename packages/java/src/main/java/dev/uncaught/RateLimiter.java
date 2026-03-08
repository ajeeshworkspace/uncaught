// ---------------------------------------------------------------------------
// dev.uncaught — sliding-window rate limiter
// ---------------------------------------------------------------------------

package dev.uncaught;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window rate limiter that enforces:
 * <ul>
 *   <li>A global maximum of events per 60-second window.</li>
 *   <li>A per-fingerprint maximum of events per 60-second window.</li>
 * </ul>
 * <p>
 * Thread-safe via {@link ConcurrentHashMap} for per-fingerprint buckets
 * and {@code synchronized} for the global bucket.
 * Stale timestamps are lazily pruned on every call to {@link #shouldAllow}.
 */
public class RateLimiter {

    /** Window duration in milliseconds (60 seconds). */
    private static final long WINDOW_MS = 60_000L;

    private final int globalMax;
    private final int perFingerprintMax;

    /** Per-fingerprint timestamp lists. */
    private final ConcurrentHashMap<String, List<Long>> buckets = new ConcurrentHashMap<>();

    /** Global timestamp list — guarded by {@code synchronized(globalTimestamps)}. */
    private final List<Long> globalTimestamps = new ArrayList<>();

    /**
     * @param globalMax          max events across all fingerprints per minute (default 30)
     * @param perFingerprintMax  max events for a single fingerprint per minute (default 5)
     */
    public RateLimiter(int globalMax, int perFingerprintMax) {
        this.globalMax = globalMax > 0 ? globalMax : 30;
        this.perFingerprintMax = perFingerprintMax > 0 ? perFingerprintMax : 5;
    }

    public RateLimiter(int globalMax) {
        this(globalMax, 5);
    }

    public RateLimiter() {
        this(30, 5);
    }

    /**
     * Returns {@code true} if the event identified by {@code fingerprint} is
     * allowed through, {@code false} if it should be dropped.
     */
    public boolean shouldAllow(String fingerprint) {
        long now = System.currentTimeMillis();

        // --- Global limit ---
        synchronized (globalTimestamps) {
            prune(globalTimestamps, now);
            if (globalTimestamps.size() >= globalMax) {
                return false;
            }
        }

        // --- Per-fingerprint limit ---
        List<Long> fpTimestamps = buckets.computeIfAbsent(fingerprint, k -> new ArrayList<>());
        synchronized (fpTimestamps) {
            prune(fpTimestamps, now);
            if (fpTimestamps.size() >= perFingerprintMax) {
                return false;
            }
            fpTimestamps.add(now);
        }

        // Record in global
        synchronized (globalTimestamps) {
            globalTimestamps.add(now);
        }

        // Periodic cleanup: remove empty buckets to prevent unbounded memory growth
        if (buckets.size() > 1000) {
            cleanupEmptyBuckets();
        }

        return true;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Remove timestamps older than the sliding window from a list (in-place).
     * Must be called while holding the list's monitor.
     */
    private static void prune(List<Long> timestamps, long now) {
        long cutoff = now - WINDOW_MS;
        Iterator<Long> it = timestamps.iterator();
        while (it.hasNext()) {
            if (it.next() <= cutoff) {
                it.remove();
            } else {
                // Timestamps are ordered, so we can stop early
                break;
            }
        }
    }

    private void cleanupEmptyBuckets() {
        Iterator<Map.Entry<String, List<Long>>> it = buckets.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, List<Long>> entry = it.next();
            List<Long> ts = entry.getValue();
            synchronized (ts) {
                if (ts.isEmpty()) {
                    it.remove();
                }
            }
        }
    }
}
