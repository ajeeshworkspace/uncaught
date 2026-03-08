"""Utility functions for the Uncaught Python SDK."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone


def generate_uuid() -> str:
    """Generate a UUID v4 string."""
    return str(uuid.uuid4())


def iso_timestamp() -> str:
    """Return the current time as an ISO 8601 string with Z suffix."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def safe_json_dumps(obj: object, **kwargs: object) -> str:
    """Safely serialize an object to JSON, handling non-serializable values."""
    def default_handler(o: object) -> object:
        try:
            return str(o)
        except Exception:
            return "<unserializable>"

    try:
        return json.dumps(obj, default=default_handler, ensure_ascii=False, **kwargs)  # type: ignore[arg-type]
    except Exception:
        return "{}"


def timestamp_to_filename(ts: str) -> str:
    """Convert an ISO timestamp to a filename-safe string.

    Matches JS: event.timestamp.replace(/[:.]/g, '-')
    """
    return ts.replace(":", "-").replace(".", "-")
