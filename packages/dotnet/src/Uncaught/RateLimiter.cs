// ---------------------------------------------------------------------------
// Uncaught — sliding-window rate limiter (thread-safe)
// ---------------------------------------------------------------------------

namespace Uncaught;

/// <summary>
/// Sliding-window rate limiter that enforces:
///  - A global maximum of events per 60-second window.
///  - A per-fingerprint maximum of events per 60-second window.
/// </summary>
public sealed class RateLimiter
{
    private const long WindowMs = 60_000;

    private readonly int _globalMax;
    private readonly int _perFingerprintMax;
    private readonly object _lock = new();

    private readonly List<long> _globalTimestamps = new();
    private readonly Dictionary<string, List<long>> _buckets = new();

    public RateLimiter(int globalMax = 30, int perFingerprintMax = 5)
    {
        _globalMax = globalMax;
        _perFingerprintMax = perFingerprintMax;
    }

    /// <summary>
    /// Returns true if the event identified by fingerprint is allowed
    /// through, false if it should be dropped.
    /// </summary>
    public bool ShouldAllow(string fingerprint)
    {
        lock (_lock)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var cutoff = now - WindowMs;

            // Prune and check global limit
            _globalTimestamps.RemoveAll(t => t <= cutoff);
            if (_globalTimestamps.Count >= _globalMax)
            {
                return false;
            }

            // Prune and check per-fingerprint limit
            if (!_buckets.TryGetValue(fingerprint, out var fpTimestamps))
            {
                fpTimestamps = new List<long>();
                _buckets[fingerprint] = fpTimestamps;
            }

            fpTimestamps.RemoveAll(t => t <= cutoff);
            if (fpTimestamps.Count >= _perFingerprintMax)
            {
                return false;
            }

            // Record this event
            _globalTimestamps.Add(now);
            fpTimestamps.Add(now);

            // Periodic cleanup: remove empty buckets
            if (_buckets.Count > 1000)
            {
                var emptyKeys = _buckets
                    .Where(kvp => kvp.Value.Count == 0)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var key in emptyKeys)
                {
                    _buckets.Remove(key);
                }
            }

            return true;
        }
    }
}
