"""SQLAlchemy integration for Uncaught — tracks database errors and queries."""

from __future__ import annotations

from typing import Any


def setup_sqlalchemy(engine: Any, client: Any = None) -> None:
    """Register SQLAlchemy event listeners for error tracking.

    Usage:
        from sqlalchemy import create_engine
        from uncaught import init_uncaught
        from uncaught.integrations.sqlalchemy import setup_sqlalchemy

        engine = create_engine("sqlite:///app.db")
        client = init_uncaught()
        setup_sqlalchemy(engine, client)
    """
    from sqlalchemy import event

    if client is None:
        from uncaught import get_client
        client = get_client()

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(
        conn: Any, cursor: Any, statement: str, parameters: Any,
        context: Any, executemany: bool,
    ) -> None:
        """Add a breadcrumb for every SQL query."""
        # Truncate long statements
        msg = statement[:200] + "..." if len(statement) > 200 else statement
        client.add_breadcrumb({
            "type": "db_query",
            "category": "sqlalchemy",
            "message": msg,
            "data": {"executemany": executemany},
        })

    @event.listens_for(engine, "handle_error")
    def handle_error(context: Any) -> None:
        """Capture database errors."""
        exc = context.original_exception
        statement = str(context.statement)[:500] if context.statement else ""

        client.capture_error(
            exc,
            level="error",
            operation={
                "provider": "sqlalchemy",
                "type": "query",
                "method": statement[:100],
                "errorCode": str(getattr(exc, "code", "")),
                "errorDetails": str(exc),
            },
        )
