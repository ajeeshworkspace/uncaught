"""Ring-buffer breadcrumb store."""

from __future__ import annotations

import copy
from collections import deque

from uncaught.types import Breadcrumb
from uncaught.utils import iso_timestamp


class BreadcrumbStore:
    """Thread-safe ring buffer for breadcrumbs."""

    def __init__(self, max_breadcrumbs: int = 20) -> None:
        self._buffer: deque[Breadcrumb] = deque(maxlen=max_breadcrumbs)

    def add(self, crumb: dict) -> None:
        """Append a breadcrumb, auto-adding a timestamp if missing."""
        entry: Breadcrumb = {
            "type": crumb.get("type", "custom"),
            "category": crumb.get("category", ""),
            "message": crumb.get("message", ""),
            "timestamp": crumb.get("timestamp", iso_timestamp()),
        }
        if crumb.get("data"):
            entry["data"] = crumb["data"]
        if crumb.get("level"):
            entry["level"] = crumb["level"]
        self._buffer.append(entry)

    def get_all(self) -> list[Breadcrumb]:
        """Return all stored breadcrumbs in chronological order (copies)."""
        return [copy.deepcopy(b) for b in self._buffer]

    def get_last(self, n: int) -> list[Breadcrumb]:
        """Return the most recent n breadcrumbs (copies)."""
        items = list(self._buffer)[-n:]
        return [copy.deepcopy(b) for b in items]

    def clear(self) -> None:
        """Empty the buffer."""
        self._buffer.clear()
