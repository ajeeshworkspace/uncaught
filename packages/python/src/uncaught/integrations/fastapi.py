"""FastAPI / Starlette middleware for Uncaught error capture."""

from __future__ import annotations

from typing import Any


def uncaught_middleware(app: Any, client: Any = None) -> Any:
    """Create ASGI middleware that captures unhandled exceptions.

    Usage:
        from uncaught import init_uncaught
        from uncaught.integrations.fastapi import uncaught_middleware

        client = init_uncaught({"environment": "production"})
        app = FastAPI()
        app.add_middleware(uncaught_middleware, client=client)
    """
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response

    if client is None:
        from uncaught import get_client
        client = get_client()

    class UncaughtMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Response:
            # Add request breadcrumb
            client.add_breadcrumb({
                "type": "api_call",
                "category": "http.request",
                "message": f"{request.method} {request.url.path}",
                "data": {
                    "method": request.method,
                    "url": str(request.url),
                },
            })
            try:
                response = await call_next(request)
                return response
            except Exception as exc:
                client.capture_error(
                    exc,
                    level="error",
                    request={
                        "method": request.method,
                        "url": str(request.url),
                        "headers": dict(request.headers),
                        "query": dict(request.query_params),
                    },
                )
                raise

    return UncaughtMiddleware
