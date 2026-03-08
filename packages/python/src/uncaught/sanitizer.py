"""Deep sanitization of event data — redacts PII and sensitive keys."""

from __future__ import annotations

import copy
import re
from typing import Any

# Default sensitive key patterns
_DEFAULT_PATTERNS = [
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"api[_-]?key", re.IGNORECASE),
    re.compile(r"auth", re.IGNORECASE),
    re.compile(r"credential", re.IGNORECASE),
    re.compile(r"private[_-]?key", re.IGNORECASE),
    re.compile(r"access[_-]?key", re.IGNORECASE),
]

# Value patterns to redact
_CREDIT_CARD_RE = re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b")
_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

_REDACTED = "[Redacted]"


def sanitize(data: Any, extra_keys: list[str] | None = None) -> Any:
    """Deep-clone and sanitize data, redacting sensitive keys and values."""
    patterns = list(_DEFAULT_PATTERNS)
    if extra_keys:
        for key in extra_keys:
            patterns.append(re.compile(re.escape(key), re.IGNORECASE))
    return _sanitize_value(copy.deepcopy(data), patterns)


def _is_sensitive_key(key: str, patterns: list[re.Pattern[str]]) -> bool:
    return any(p.search(key) for p in patterns)


def _sanitize_string(value: str) -> str:
    value = _CREDIT_CARD_RE.sub(_REDACTED, value)
    value = _SSN_RE.sub(_REDACTED, value)
    return value


def _sanitize_value(value: Any, patterns: list[re.Pattern[str]], depth: int = 0) -> Any:
    if depth > 20:
        return value

    if isinstance(value, dict):
        result = {}
        for k, v in value.items():
            if isinstance(k, str) and _is_sensitive_key(k, patterns):
                result[k] = _REDACTED
            else:
                result[k] = _sanitize_value(v, patterns, depth + 1)
        return result

    if isinstance(value, list):
        return [_sanitize_value(item, patterns, depth + 1) for item in value]

    if isinstance(value, str):
        return _sanitize_string(value)

    return value
