"""Build AI-ready fix prompts in Markdown format."""

from __future__ import annotations

from typing import Any

from uncaught.types import Breadcrumb, EnvironmentInfo, OperationInfo, RequestInfo, UncaughtEvent


def build_fix_prompt(event: dict) -> str:
    """Build a structured Markdown prompt for AI diagnosis.

    Matches the format from packages/core/src/prompt-builder.ts.
    """
    sections: list[str] = []

    # Intro
    sections.append(
        "I have a production bug in my application that I need help diagnosing and fixing.\n"
    )

    # Error
    error = event.get("error")
    if error:
        lines = ["## Error", ""]
        lines.append(f"- **Type:** {error.get('type', 'Error')}")
        lines.append(f"- **Message:** {error.get('message', '(no message)')}")
        location = _extract_location(error.get("stack"))
        if location:
            lines.append(f"- **Location:** {location}")
        sections.append("\n".join(lines))

    # Stack Trace
    stack_source = None
    if error:
        stack_source = error.get("resolvedStack") or error.get("stack")
    if stack_source:
        frame_lines = stack_source.split("\n")[:15]
        cleaned = "\n".join(line.rstrip() for line in frame_lines)
        label = "Stack Trace (source-mapped)" if error and error.get("resolvedStack") else "Stack Trace"
        sections.append(f"## {label}\n\n```\n{cleaned}\n```")

    # Failed Operation
    operation = event.get("operation")
    if operation:
        sections.append(_format_operation(operation))

    # HTTP Request
    request = event.get("request")
    if request:
        sections.append(_format_request(request))

    # User Session (last 5 breadcrumbs)
    breadcrumbs = event.get("breadcrumbs")
    if breadcrumbs:
        sections.append(_format_breadcrumbs(breadcrumbs))

    # Environment
    environment = event.get("environment")
    if environment:
        sections.append(_format_environment(environment))

    # What I need
    sections.append(
        "\n".join([
            "## What I need",
            "",
            "1. **Root cause analysis** — explain why this error is occurring.",
            "2. **A fix** — provide the corrected code with an explanation of the changes.",
            "3. **Prevention** — suggest any guards or tests to prevent this from happening again.",
        ])
    )

    return "\n\n".join(sections) + "\n"


def _extract_location(stack: str | None) -> str | None:
    """Extract the top-most location from a stack trace."""
    if not stack:
        return None

    import re
    for line in stack.split("\n"):
        trimmed = line.strip()
        # V8: "    at fn (file:line:col)"
        m = re.search(r"at\s+(?:.+?\s+\()?(.+?:\d+:\d+)\)?", trimmed)
        if m:
            return m.group(1)
        # SpiderMonkey / JSC
        m = re.search(r"@(.+?:\d+:\d+)", trimmed)
        if m:
            return m.group(1)
        # Python: File "path", line N
        m = re.search(r'File "(.+?)", line (\d+)', trimmed)
        if m:
            return f"{m.group(1)}:{m.group(2)}"

    return None


def _format_operation(op: dict) -> str:
    import json
    lines = ["## Failed Operation", ""]
    lines.append(f"- **Provider:** {op.get('provider', '')}")
    lines.append(f"- **Type:** {op.get('type', '')}")
    lines.append(f"- **Method:** {op.get('method', '')}")
    if op.get("params"):
        lines.append("- **Params:**")
        lines.append("```json")
        lines.append(json.dumps(op["params"], indent=2))
        lines.append("```")
    if op.get("errorCode"):
        lines.append(f"- **Error Code:** {op['errorCode']}")
    if op.get("errorDetails"):
        lines.append(f"- **Error Details:** {op['errorDetails']}")
    return "\n".join(lines)


def _format_request(req: dict) -> str:
    import json
    lines = ["## HTTP Request Context", ""]
    if req.get("method"):
        lines.append(f"- **Method:** {req['method']}")
    if req.get("url"):
        lines.append(f"- **URL:** {req['url']}")
    if req.get("body"):
        lines.append("- **Body:**")
        lines.append("```json")
        body = req["body"] if isinstance(req["body"], str) else json.dumps(req["body"], indent=2)
        lines.append(body)
        lines.append("```")
    return "\n".join(lines)


def _format_breadcrumbs(crumbs: list[dict]) -> str:
    recent = crumbs[-5:]
    lines = ["## User Session", ""]
    for crumb in recent:
        time_str = _format_time(crumb.get("timestamp", ""))
        lines.append(f"- `{time_str}` **[{crumb.get('type', 'custom')}]** {crumb.get('message', '')}")
    return "\n".join(lines)


def _format_time(iso: str) -> str:
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%H:%M:%S")
    except Exception:
        return iso


def _format_environment(env: dict) -> str:
    lines = ["## Environment", ""]
    entries = [
        ("Deploy Environment", env.get("deploy")),
        ("Framework", env.get("framework")),
        ("Framework Version", env.get("frameworkVersion")),
        ("Runtime", env.get("runtime")),
        ("Runtime Version", env.get("runtimeVersion")),
        ("Platform", env.get("platform")),
        ("OS", env.get("os")),
        ("Locale", env.get("locale")),
        ("Timezone", env.get("timezone")),
        ("URL", env.get("url")),
    ]
    for label, value in entries:
        if value:
            lines.append(f"- **{label}:** {value}")
    return "\n".join(lines)
