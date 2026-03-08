// ---------------------------------------------------------------------------
// uncaught — sliding-window rate limiter (thread-safe)
// ---------------------------------------------------------------------------

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Window duration (60 seconds).
const WINDOW_DURATION: Duration = Duration::from_secs(60);

/// Sliding-window rate limiter that enforces:
///  - A global maximum of events per 60-second window.
///  - A per-fingerprint maximum of events per 60-second window.
pub struct RateLimiter {
    global_max: usize,
    per_fingerprint_max: usize,
    state: Mutex<RateLimiterState>,
}

struct RateLimiterState {
    global_timestamps: Vec<Instant>,
    buckets: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    /// Create a new rate limiter.
    ///
    /// - `global_max`: Max events across all fingerprints per window.
    /// - `per_fingerprint_max`: Max events for a single fingerprint per window.
    pub fn new(global_max: usize, per_fingerprint_max: usize) -> Self {
        Self {
            global_max,
            per_fingerprint_max,
            state: Mutex::new(RateLimiterState {
                global_timestamps: Vec::new(),
                buckets: HashMap::new(),
            }),
        }
    }

    /// Returns `true` if the event identified by `fingerprint` is allowed
    /// through, `false` if it should be dropped.
    pub fn should_allow(&self, fingerprint: &str) -> bool {
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };

        let now = Instant::now();
        let cutoff = now.checked_sub(WINDOW_DURATION).unwrap_or(now);

        // Prune and check global limit
        state.global_timestamps.retain(|&t| t > cutoff);
        if state.global_timestamps.len() >= self.global_max {
            return false;
        }

        // Prune and check per-fingerprint limit
        {
            let fp_timestamps = state
                .buckets
                .entry(fingerprint.to_string())
                .or_insert_with(Vec::new);
            fp_timestamps.retain(|&t| t > cutoff);

            if fp_timestamps.len() >= self.per_fingerprint_max {
                return false;
            }
        }

        // Record this event
        state.global_timestamps.push(now);
        state.buckets.get_mut(fingerprint).unwrap().push(now);

        // Periodic cleanup: remove empty buckets
        if state.buckets.len() > 1000 {
            state.buckets.retain(|_, ts| !ts.is_empty());
        }

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allows_within_limit() {
        let limiter = RateLimiter::new(10, 3);
        assert!(limiter.should_allow("fp1"));
        assert!(limiter.should_allow("fp1"));
        assert!(limiter.should_allow("fp1"));
    }

    #[test]
    fn test_blocks_per_fingerprint() {
        let limiter = RateLimiter::new(10, 2);
        assert!(limiter.should_allow("fp1"));
        assert!(limiter.should_allow("fp1"));
        // Third should be blocked
        assert!(!limiter.should_allow("fp1"));
        // Different fingerprint should still be allowed
        assert!(limiter.should_allow("fp2"));
    }

    #[test]
    fn test_blocks_global() {
        let limiter = RateLimiter::new(3, 10);
        assert!(limiter.should_allow("fp1"));
        assert!(limiter.should_allow("fp2"));
        assert!(limiter.should_allow("fp3"));
        // Fourth should be blocked globally
        assert!(!limiter.should_allow("fp4"));
    }
}
