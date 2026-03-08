"""Flask integration for Uncaught error capture."""

from __future__ import annotations

from typing import Any


def init_app(app: Any, client: Any = None) -> None:
    """Register Uncaught error handling with a Flask app.

    Usage:
        from flask import Flask
        from uncaught import init_uncaught
        from uncaught.integrations.flask import init_app

        app = Flask(__name__)
        client = init_uncaught({"environment": "production"})
        init_app(app, client)
    """
    if client is None:
        from uncaught import get_client
        client = get_client()

    @app.errorhandler(Exception)
    def handle_exception(e: Exception) -> Any:
        from flask import request

        client.capture_error(
            e,
            level="error",
            request={
                "method": request.method,
                "url": request.url,
                "headers": dict(request.headers),
                "query": dict(request.args),
                "body": request.get_data(as_text=True) if request.content_length else None,
            },
        )
        raise

    @app.before_request
    def add_request_breadcrumb() -> None:
        from flask import request

        client.add_breadcrumb({
            "type": "api_call",
            "category": "http.request",
            "message": f"{request.method} {request.path}",
            "data": {
                "method": request.method,
                "url": request.url,
            },
        })
