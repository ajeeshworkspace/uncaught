"""Per-fingerprint sliding window rate limiter."""

from __future__ import annotations

import time
from collections import defaultdict


class RateLimiter:
    """Sliding window rate limiter with per-fingerprint tracking."""

    def __init__(self, max_per_minute: int = 30, window_seconds: float = 60.0) -> None:
        self._max = max_per_minute
        self._window = window_seconds
        self._timestamps: dict[str, list[float]] = defaultdict(list)

    def should_allow(self, fingerprint: str) -> bool:
        """Return True if the event should be allowed through."""
        now = time.monotonic()
        cutoff = now - self._window

        # Clean old entries
        entries = self._timestamps[fingerprint]
        self._timestamps[fingerprint] = [t for t in entries if t > cutoff]

        if len(self._timestamps[fingerprint]) >= self._max:
            return False

        self._timestamps[fingerprint].append(now)
        return True
