"""Local file transport — writes to .uncaught/ directory matching the JS SDK format."""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

from uncaught.types import IssueEntry, UncaughtEvent
from uncaught.utils import safe_json_dumps, timestamp_to_filename


class LocalFileTransport:
    """Writes events to the .uncaught/ directory structure.

    File layout matches packages/core/src/transport.ts exactly:
      .uncaught/
        events/{fingerprint}/event-{ts}.json
        events/{fingerprint}/latest.json
        fix-prompts/{fingerprint}.md
        issues.json
        uncaught.db (best-effort)
    """

    def __init__(self, base_dir: str | None = None) -> None:
        self._base_dir = base_dir or os.path.join(os.getcwd(), ".uncaught")
        self._initialised = False

    def _init(self) -> None:
        if self._initialised:
            return
        os.makedirs(os.path.join(self._base_dir, "events"), exist_ok=True)
        os.makedirs(os.path.join(self._base_dir, "fix-prompts"), exist_ok=True)
        self._ensure_gitignore()
        self._initialised = True

    def _ensure_gitignore(self) -> None:
        try:
            gitignore_path = os.path.join(os.path.dirname(self._base_dir), ".gitignore")
            content = ""
            try:
                with open(gitignore_path, "r") as f:
                    content = f.read()
            except FileNotFoundError:
                pass
            if ".uncaught" not in content:
                with open(gitignore_path, "a") as f:
                    f.write("\n# Uncaught local error store\n.uncaught/\n")
        except Exception:
            pass

    def send(self, event: UncaughtEvent) -> None:
        """Write an event to the local file system."""
        try:
            self._init()
            fp = event["fingerprint"]
            event_dir = os.path.join(self._base_dir, "events", fp)
            os.makedirs(event_dir, exist_ok=True)

            event_json = safe_json_dumps(event, indent=2)

            # Write timestamped event file (atomic: tmp → rename)
            ts = timestamp_to_filename(event["timestamp"])
            event_file = f"event-{ts}.json"
            event_path = os.path.join(event_dir, event_file)
            _atomic_write(event_path, event_json)

            # Write / overwrite latest.json
            latest_path = os.path.join(event_dir, "latest.json")
            _atomic_write(latest_path, event_json)

            # Write fix-prompt Markdown file
            prompt_file = f"{fp}.md"
            prompt_path = os.path.join(self._base_dir, "fix-prompts", prompt_file)
            _atomic_write(prompt_path, event.get("fixPrompt", ""))

            # Update issues.json index
            self._update_issues_index(event, event_file, prompt_file)

            # Write to SQLite (best-effort)
            try:
                self._write_to_sqlite(event, event_file, prompt_file)
            except Exception:
                pass

        except Exception:
            # Never crash the host app
            pass

    def flush(self) -> None:
        """No-op for local file transport."""
        pass

    def _update_issues_index(
        self, event: UncaughtEvent, event_file: str, prompt_file: str
    ) -> None:
        """Read, update, and atomically write the issues.json index."""
        index_path = os.path.join(self._base_dir, "issues.json")

        issues: list[dict[str, Any]] = []
        try:
            with open(index_path, "r") as f:
                issues = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            pass

        fp = event["fingerprint"]
        user_id = (
            event.get("user", {}).get("id")
            or event.get("user", {}).get("email")
            or "anonymous"
        )

        existing = next((i for i in issues if i["fingerprint"] == fp), None)

        if existing:
            existing["count"] = existing.get("count", 0) + 1
            existing["lastSeen"] = event["timestamp"]
            existing["latestEventFile"] = event_file
            existing["fixPromptFile"] = prompt_file
            if user_id not in existing.get("affectedUsers", []):
                existing.setdefault("affectedUsers", []).append(user_id)
            if existing.get("status") == "resolved":
                existing["status"] = "open"
        else:
            error = event.get("error", {})
            env_info = event.get("environment", {})
            issues.append({
                "fingerprint": fp,
                "title": error.get("message", "Unknown error"),
                "errorType": error.get("type", "Error"),
                "count": 1,
                "affectedUsers": [user_id],
                "firstSeen": event["timestamp"],
                "lastSeen": event["timestamp"],
                "status": "open",
                "fixPromptFile": prompt_file,
                "latestEventFile": event_file,
                "release": event.get("release"),
                "environment": env_info.get("deploy"),
            })

        _atomic_write(index_path, json.dumps(issues, indent=2, ensure_ascii=False))

    def _write_to_sqlite(
        self, event: UncaughtEvent, event_file: str, prompt_file: str
    ) -> None:
        """Write event to SQLite database (best-effort)."""
        db_path = os.path.join(self._base_dir, "uncaught.db")
        conn = sqlite3.connect(db_path)
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA foreign_keys = ON")

            # Create tables if needed
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS issues (
                    fingerprint TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    error_type TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 1,
                    affected_users TEXT NOT NULL DEFAULT '[]',
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    fix_prompt_file TEXT NOT NULL DEFAULT '',
                    latest_event_file TEXT NOT NULL DEFAULT '',
                    release TEXT NOT NULL DEFAULT '',
                    environment TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
                CREATE INDEX IF NOT EXISTS idx_issues_last_seen ON issues(last_seen);
                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL DEFAULT 'error',
                    fix_prompt TEXT NOT NULL DEFAULT '',
                    payload TEXT NOT NULL,
                    FOREIGN KEY (fingerprint) REFERENCES issues(fingerprint)
                );
                CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
                CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
                CREATE TABLE IF NOT EXISTS _meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)

            fp = event["fingerprint"]
            error = event.get("error", {})
            user_id = (
                event.get("user", {}).get("id")
                or event.get("user", {}).get("email")
                or "anonymous"
            )
            env_info = event.get("environment", {})

            # Upsert issue
            existing = conn.execute(
                "SELECT * FROM issues WHERE fingerprint = ?", (fp,)
            ).fetchone()

            if existing:
                # existing = (fingerprint, title, error_type, count, affected_users, first_seen, last_seen, status, ...)
                count = existing[3] + 1
                affected = json.loads(existing[4])
                if user_id not in affected:
                    affected.append(user_id)
                status = "open" if existing[7] == "resolved" else existing[7]
                conn.execute(
                    """UPDATE issues SET count=?, affected_users=?, last_seen=?,
                       status=?, fix_prompt_file=?, latest_event_file=?,
                       release=?, environment=?
                       WHERE fingerprint=?""",
                    (
                        count, json.dumps(affected), event["timestamp"],
                        status, prompt_file, event_file,
                        event.get("release", ""),
                        env_info.get("deploy", ""),
                        fp,
                    ),
                )
            else:
                conn.execute(
                    """INSERT INTO issues (fingerprint, title, error_type, count,
                       affected_users, first_seen, last_seen, status,
                       fix_prompt_file, latest_event_file, release, environment)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        fp,
                        error.get("message", "Unknown error"),
                        error.get("type", "Error"),
                        1,
                        json.dumps([user_id]),
                        event["timestamp"],
                        event["timestamp"],
                        "open",
                        prompt_file,
                        event_file,
                        event.get("release", ""),
                        env_info.get("deploy", ""),
                    ),
                )

            # Insert event
            conn.execute(
                """INSERT OR IGNORE INTO events (event_id, fingerprint, timestamp, level, fix_prompt, payload)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    event["eventId"],
                    fp,
                    event["timestamp"],
                    event.get("level", "error"),
                    event.get("fixPrompt", ""),
                    safe_json_dumps(event),
                ),
            )

            conn.commit()
        finally:
            conn.close()


class ConsoleTransport:
    """Prints events to the console for development."""

    def send(self, event: UncaughtEvent) -> None:
        error = event.get("error", {})
        title = f"[uncaught] {error.get('type', 'Error')}: {error.get('message', '')}"
        print(f"\n--- {title} ---")
        print(f"Event ID: {event.get('eventId', '')}")
        print(f"Fingerprint: {event.get('fingerprint', '')}")
        if error.get("stack"):
            print(f"Stack: {error['stack']}")
        if event.get("fixPrompt"):
            print(f"\nFix Prompt:\n{event['fixPrompt']}")
        print("---\n")

    def flush(self) -> None:
        pass


def _atomic_write(path: str, content: str) -> None:
    """Write content to a file atomically via tmp + rename."""
    dir_name = os.path.dirname(path)
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise
