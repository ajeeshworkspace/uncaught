"""Django middleware for Uncaught error capture."""

from __future__ import annotations

from typing import Any


class UncaughtMiddleware:
    """Django middleware that captures unhandled exceptions.

    Usage in settings.py:
        MIDDLEWARE = [
            'uncaught.integrations.django.UncaughtMiddleware',
            ...
        ]

        UNCAUGHT = {
            'environment': 'production',
            'release': '1.0.0',
        }

    Call init_uncaught() in your Django settings or AppConfig.ready():
        from uncaught import init_uncaught
        init_uncaught(settings.UNCAUGHT)
    """

    def __init__(self, get_response: Any) -> None:
        self.get_response = get_response
        try:
            from uncaught import get_client
            self._client = get_client()
        except RuntimeError:
            self._client = None

    def __call__(self, request: Any) -> Any:
        if self._client:
            self._client.add_breadcrumb({
                "type": "api_call",
                "category": "http.request",
                "message": f"{request.method} {request.path}",
                "data": {
                    "method": request.method,
                    "url": request.build_absolute_uri(),
                },
            })

        response = self.get_response(request)
        return response

    def process_exception(self, request: Any, exception: Exception) -> None:
        """Called by Django when a view raises an exception."""
        if not self._client:
            return

        self._client.capture_error(
            exception,
            level="error",
            request={
                "method": request.method,
                "url": request.build_absolute_uri(),
                "headers": dict(request.headers) if hasattr(request, "headers") else {},
                "query": dict(request.GET),
                "body": request.body.decode("utf-8", errors="replace") if request.body else None,
            },
        )
