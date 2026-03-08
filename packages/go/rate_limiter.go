// ---------------------------------------------------------------------------
// uncaught-go — sliding-window rate limiter (thread-safe)
// ---------------------------------------------------------------------------

package uncaught

import (
	"sync"
	"time"
)

// windowDuration is the sliding window size (60 seconds).
const windowDuration = 60 * time.Second

// RateLimiter enforces a global maximum and per-fingerprint maximum of events
// per 60-second sliding window.
type RateLimiter struct {
	mu                sync.Mutex
	globalMax         int
	perFingerprintMax int
	globalTimestamps  []int64
	buckets           map[string][]int64
}

// NewRateLimiter creates a rate limiter with the given limits.
// globalMax defaults to 30 if <= 0. perFingerprintMax defaults to 5 if <= 0.
func NewRateLimiter(globalMax, perFingerprintMax int) *RateLimiter {
	if globalMax <= 0 {
		globalMax = 30
	}
	if perFingerprintMax <= 0 {
		perFingerprintMax = 5
	}
	return &RateLimiter{
		globalMax:         globalMax,
		perFingerprintMax: perFingerprintMax,
		globalTimestamps:  make([]int64, 0),
		buckets:           make(map[string][]int64),
	}
}

// ShouldAllow returns true if the event identified by fingerprint is allowed
// through, false if it should be dropped.
func (rl *RateLimiter) ShouldAllow(fingerprint string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now().UnixMilli()

	// Prune and check global limit
	rl.globalTimestamps = prune(rl.globalTimestamps, now)
	if len(rl.globalTimestamps) >= rl.globalMax {
		return false
	}

	// Prune and check per-fingerprint limit
	fpTimestamps, exists := rl.buckets[fingerprint]
	if !exists {
		fpTimestamps = make([]int64, 0)
	}
	fpTimestamps = prune(fpTimestamps, now)
	rl.buckets[fingerprint] = fpTimestamps

	if len(fpTimestamps) >= rl.perFingerprintMax {
		return false
	}

	// Record this event
	rl.globalTimestamps = append(rl.globalTimestamps, now)
	rl.buckets[fingerprint] = append(fpTimestamps, now)

	// Periodic cleanup: remove empty buckets to prevent unbounded memory growth
	if len(rl.buckets) > 1000 {
		for key, ts := range rl.buckets {
			if len(ts) == 0 {
				delete(rl.buckets, key)
			}
		}
	}

	return true
}

// prune removes timestamps older than the sliding window.
func prune(timestamps []int64, nowMs int64) []int64 {
	cutoff := nowMs - windowDuration.Milliseconds()
	start := 0
	for start < len(timestamps) && timestamps[start] <= cutoff {
		start++
	}
	if start > 0 {
		return timestamps[start:]
	}
	return timestamps
}
