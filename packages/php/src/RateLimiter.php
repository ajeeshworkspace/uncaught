<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Sliding-window rate limiter.
 *
 * Enforces:
 *  - A global maximum of events per 60-second window.
 *  - A per-fingerprint maximum of events per 60-second window.
 */
class RateLimiter
{
    /** Window duration in seconds. */
    private const WINDOW_SECONDS = 60;

    private int $globalMax;
    private int $perFingerprintMax;

    /** @var float[] Global timestamps (microtime). */
    private array $globalTimestamps = [];

    /** @var array<string, float[]> Per-fingerprint timestamp arrays. */
    private array $buckets = [];

    public function __construct(int $globalMax = 30, int $perFingerprintMax = 5)
    {
        $this->globalMax = $globalMax;
        $this->perFingerprintMax = $perFingerprintMax;
    }

    /**
     * Returns true if the event is allowed through, false if it should be dropped.
     */
    public function shouldAllow(string $fingerprint): bool
    {
        $now = microtime(true);
        $cutoff = $now - self::WINDOW_SECONDS;

        // Prune and check global limit
        $this->globalTimestamps = array_values(
            array_filter($this->globalTimestamps, fn(float $t) => $t > $cutoff)
        );

        if (count($this->globalTimestamps) >= $this->globalMax) {
            return false;
        }

        // Prune and check per-fingerprint limit
        if (!isset($this->buckets[$fingerprint])) {
            $this->buckets[$fingerprint] = [];
        }

        $this->buckets[$fingerprint] = array_values(
            array_filter($this->buckets[$fingerprint], fn(float $t) => $t > $cutoff)
        );

        if (count($this->buckets[$fingerprint]) >= $this->perFingerprintMax) {
            return false;
        }

        // Record this event
        $this->globalTimestamps[] = $now;
        $this->buckets[$fingerprint][] = $now;

        // Periodic cleanup: remove empty buckets
        if (count($this->buckets) > 1000) {
            $this->buckets = array_filter(
                $this->buckets,
                fn(array $ts) => count($ts) > 0
            );
        }

        return true;
    }
}
