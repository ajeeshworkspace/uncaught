"""Core Uncaught client — the main error capture pipeline."""

from __future__ import annotations

import re
import sys
import traceback
from typing import Any

from uncaught.breadcrumbs import BreadcrumbStore
from uncaught.env_detector import detect_environment
from uncaught.fingerprint import generate_fingerprint
from uncaught.prompt_builder import build_fix_prompt
from uncaught.rate_limiter import RateLimiter
from uncaught.sanitizer import sanitize
from uncaught.transport import ConsoleTransport, LocalFileTransport
from uncaught.types import Breadcrumb, UncaughtConfig, UncaughtEvent
from uncaught.utils import generate_uuid, iso_timestamp

# Global singleton
_client: UncaughtClient | None = None

SDK_NAME = "uncaught-python"
SDK_VERSION = "0.1.0"


class UncaughtClient:
    """The main Uncaught client that captures, processes, and stores errors."""

    def __init__(self, config: UncaughtConfig | None = None) -> None:
        config = config or {}
        self._config = config
        self._enabled = config.get("enabled", True)
        self._debug = config.get("debug", False)
        self._environment = config.get("environment")
        self._release = config.get("release")
        self._before_send = config.get("before_send")
        self._sanitize_keys = config.get("sanitize_keys", [])
        self._ignore_errors = config.get("ignore_errors", [])
        self._webhook_url = config.get("webhook_url")

        self._breadcrumbs = BreadcrumbStore(config.get("max_breadcrumbs", 20))
        self._rate_limiter = RateLimiter(config.get("max_events_per_minute", 30))
        self._seen_fingerprints: set[str] = set()

        # Setup transport
        transport_mode = config.get("transport", "local")
        if transport_mode == "console":
            self._transport = ConsoleTransport()
        else:
            self._transport = LocalFileTransport(config.get("local_output_dir"))

        # Set user context
        self._user: dict[str, Any] = {}

    def capture_error(
        self,
        error: BaseException | str | dict | Any,
        *,
        level: str = "error",
        request: dict | None = None,
        operation: dict | None = None,
        user: dict | None = None,
    ) -> str | None:
        """Capture an error through the full processing pipeline.

        Returns the event ID if sent, None if dropped.
        """
        if not self._enabled:
            return None

        try:
            # Normalise the error
            error_info = self._normalise_error(error)

            # Check ignore list
            if self._should_ignore(error_info.get("message", "")):
                return None

            # Generate fingerprint
            fingerprint = generate_fingerprint(error_info)

            # Rate limit
            if not self._rate_limiter.should_allow(fingerprint):
                if self._debug:
                    print(f"[uncaught] Rate limited: {fingerprint}")
                return None

            # Build event
            event: UncaughtEvent = {
                "eventId": generate_uuid(),
                "timestamp": iso_timestamp(),
                "level": level,
                "fingerprint": fingerprint,
                "error": error_info,
                "breadcrumbs": self._breadcrumbs.get_all(),
                "environment": detect_environment(),
                "sdk": {"name": SDK_NAME, "version": SDK_VERSION},
            }

            if self._release:
                event["release"] = self._release
            if self._environment:
                event["environment"]["deploy"] = self._environment
            if request:
                event["request"] = request
            if operation:
                event["operation"] = operation
            if user or self._user:
                event["user"] = {**self._user, **(user or {})}
            if self._config.get("project_key"):
                event["projectKey"] = self._config["project_key"]

            # Build fix prompt
            event["fixPrompt"] = build_fix_prompt(event)

            # Sanitize
            event = sanitize(event, self._sanitize_keys)

            # Before send hook
            if self._before_send:
                result = self._before_send(event)
                if result is None:
                    return None
                event = result

            # Send
            self._transport.send(event)

            # Webhook on first occurrence
            if self._webhook_url and fingerprint not in self._seen_fingerprints:
                self._seen_fingerprints.add(fingerprint)
                self._send_webhook(event)

            if self._debug:
                print(f"[uncaught] Captured: {error_info.get('type')}: {error_info.get('message')} ({fingerprint})")

            return event["eventId"]

        except Exception as e:
            if self._debug:
                print(f"[uncaught] Internal error: {e}")
            return None

    def capture_exception(self, **kwargs: Any) -> str | None:
        """Capture the current exception from sys.exc_info()."""
        exc_info = sys.exc_info()
        if exc_info[1] is not None:
            return self.capture_error(exc_info[1], **kwargs)
        return None

    def add_breadcrumb(self, crumb: dict) -> None:
        """Add a breadcrumb to the ring buffer."""
        self._breadcrumbs.add(crumb)

    def set_user(self, user: dict[str, Any]) -> None:
        """Set user context for all subsequent events."""
        self._user = user

    def flush(self) -> None:
        """Flush pending events."""
        self._transport.flush()

    def _normalise_error(self, error: BaseException | str | dict | Any) -> dict:
        """Normalise any error type into a structured ErrorInfo dict."""
        if isinstance(error, BaseException):
            tb = "".join(traceback.format_exception(type(error), error, error.__traceback__))
            return {
                "message": str(error),
                "type": type(error).__name__,
                "stack": tb,
            }
        if isinstance(error, str):
            return {"message": error, "type": "Error"}
        if isinstance(error, dict):
            return {
                "message": error.get("message", str(error)),
                "type": error.get("type", "Error"),
                "stack": error.get("stack", ""),
            }
        return {"message": str(error), "type": type(error).__name__}

    def _should_ignore(self, message: str) -> bool:
        """Check if the error message matches any ignore pattern."""
        for pattern in self._ignore_errors:
            if isinstance(pattern, str):
                if pattern in message:
                    return True
            else:
                try:
                    if re.search(pattern, message):
                        return True
                except Exception:
                    pass
        return False

    def _send_webhook(self, event: UncaughtEvent) -> None:
        """Fire-and-forget webhook notification."""
        try:
            import urllib.request
            import json
            error = event.get("error", {})
            payload = json.dumps({
                "title": error.get("message", ""),
                "errorType": error.get("type", ""),
                "fingerprint": event.get("fingerprint", ""),
                "level": event.get("level", ""),
                "timestamp": event.get("timestamp", ""),
                "release": event.get("release"),
                "environment": event.get("environment", {}).get("deploy"),
                "fixPrompt": event.get("fixPrompt", ""),
            }).encode("utf-8")
            req = urllib.request.Request(
                self._webhook_url,
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass  # Fire and forget

    def _setup_global_handlers(self) -> None:
        """Install global exception hooks."""
        original_excepthook = sys.excepthook

        def uncaught_excepthook(exc_type: type, exc_value: BaseException, exc_tb: Any) -> None:
            self.capture_error(exc_value, level="fatal")
            original_excepthook(exc_type, exc_value, exc_tb)

        sys.excepthook = uncaught_excepthook


def init_uncaught(config: UncaughtConfig | None = None) -> UncaughtClient:
    """Initialize the global Uncaught client singleton."""
    global _client
    _client = UncaughtClient(config)
    _client._setup_global_handlers()
    return _client


def get_client() -> UncaughtClient:
    """Get the global Uncaught client. Raises if not initialized."""
    if _client is None:
        raise RuntimeError("Uncaught not initialized. Call init_uncaught() first.")
    return _client
