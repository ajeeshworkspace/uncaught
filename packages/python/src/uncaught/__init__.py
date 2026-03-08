"""Uncaught — local-first, AI-ready error monitoring for Python."""

from uncaught.client import UncaughtClient, init_uncaught, get_client
from uncaught.types import UncaughtConfig, SeverityLevel

__version__ = "0.1.0"
__all__ = [
    "UncaughtClient",
    "init_uncaught",
    "get_client",
    "UncaughtConfig",
    "SeverityLevel",
    "__version__",
]
