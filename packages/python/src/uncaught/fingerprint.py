"""Error fingerprinting — DJB2 hash matching the TypeScript reference implementation."""

from __future__ import annotations

import re


def generate_fingerprint(error: dict) -> str:
    """Generate a stable 8-char hex fingerprint for an error.

    Must produce identical output to the TypeScript implementation in
    packages/core/src/fingerprint.ts for the same inputs.
    """
    normalised_message = normalise_message(error.get("message", ""))
    frames = extract_top_frames(error.get("stack", ""), 3)
    error_type = error.get("type", "Error")
    parts = [error_type, normalised_message] + frames
    fingerprint_input = "\n".join(parts)
    return djb2(fingerprint_input)


def djb2(s: str) -> str:
    """DJB2 hash → 8-character lowercase hex string.

    Must match JavaScript: ((hash << 5) + hash + charCode) | 0
    then (hash >>> 0).toString(16).padStart(8, '0')
    """
    hash_val = 5381
    for c in s:
        # Simulate JS signed 32-bit: ((hash << 5) + hash + charCode) | 0
        hash_val = ((hash_val << 5) + hash_val + ord(c)) & 0xFFFFFFFF
        # Convert to signed 32-bit (match JS | 0)
        if hash_val >= 0x80000000:
            hash_val -= 0x100000000
    # Convert to unsigned 32-bit (match JS >>> 0)
    unsigned = hash_val & 0xFFFFFFFF
    return format(unsigned, "08x")


# -- Message Normalization --------------------------------------------------

_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
_HEX_RE = re.compile(r"\b[0-9a-f]{8,}\b", re.IGNORECASE)
_NUM_RE = re.compile(r"\b\d{4,}\b")
_TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?")
_HASHED_FILE_RE = re.compile(
    r"([/\\])[a-zA-Z0-9_-]+[-.]([a-f0-9]{6,})\.(js|ts|mjs|cjs|jsx|tsx)"
)


def normalise_message(msg: str) -> str:
    """Strip volatile substrings so trivially-different occurrences hash identically."""
    msg = _UUID_RE.sub("<UUID>", msg)
    msg = _HEX_RE.sub("<HEX>", msg)
    msg = _NUM_RE.sub("<NUM>", msg)
    msg = _TIMESTAMP_RE.sub("<TIMESTAMP>", msg)
    msg = _HASHED_FILE_RE.sub(r"\1<FILE>.\3", msg)
    return msg.strip()


# -- Stack Frame Extraction -------------------------------------------------

# V8: "    at FunctionName (file:line:col)" or "    at file:line:col"
_V8_FRAME_RE = re.compile(r"at\s+(?:(.+?)\s+\()?(?:(.+?):\d+:\d+)\)?")
# SpiderMonkey / JSC: "functionName@file:line:col"
_SM_FRAME_RE = re.compile(r"^(.+?)@(.+?):\d+:\d+")
# Python: '  File "path", line N, in function'
_PY_FRAME_RE = re.compile(r'File "(.+?)", line \d+, in (.+)')
# Go: "	/path/to/file.go:42 +0x1a5" preceded by "package.Function(...)"
_GO_FUNC_RE = re.compile(r"^([a-zA-Z0-9_./*]+)\(")
_GO_FILE_RE = re.compile(r"^\t(.+?):\d+")
# Java: "	at package.Class.method(File.java:42)"
_JAVA_FRAME_RE = re.compile(r"at\s+(.+?)\.(\w+)\((\w+\.\w+):\d+\)")
# Ruby: "/path/to/file.rb:42:in `method'"
_RUBY_FRAME_RE = re.compile(r"^(.+?):(\d+):in [`'](.+?)'")
# C#: "   at Namespace.Class.Method() in /path/File.cs:line 42"
_CSHARP_FRAME_RE = re.compile(r"at\s+(.+?)\.(\w+)\(.*?\)\s+in\s+(.+?):\w+ \d+")
# Rust: "   at src/main.rs:42:5" with fn on previous line
_RUST_FRAME_RE = re.compile(r"^\s+at\s+(.+?):\d+:\d+")
# PHP: "#0 /path/to/file.php(42): ClassName->methodName()"
_PHP_FRAME_RE = re.compile(r"#\d+\s+(.+?)\(\d+\):\s+(.+?)(?:\(|$)")
# Elixir: "    (app 0.1.0) lib/module.ex:42: Module.function/2"
_ELIXIR_FRAME_RE = re.compile(r"\(.+?\)\s+(.+?):\d+:\s+(.+?)(?:/\d+)?$")


def extract_top_frames(stack: str, count: int = 3) -> list[str]:
    """Extract the top N stack frames as 'filename:functionName' strings.

    Supports V8, SpiderMonkey, Python, Go, Java, Ruby, Rust, C#, PHP, Elixir formats.
    """
    if not stack:
        return []

    lines = stack.split("\n")
    frames: list[str] = []

    # Try Python format first (multi-line: File line + code line)
    py_frames = _extract_python_frames(lines, count)
    if py_frames:
        return py_frames

    # Try Go format (function line + file line pairs)
    go_frames = _extract_go_frames(lines, count)
    if go_frames:
        return go_frames

    # Single-line formats
    for line in lines:
        if len(frames) >= count:
            break
        trimmed = line.strip()

        # V8 format
        m = _V8_FRAME_RE.search(trimmed)
        if m:
            fn = m.group(1) or "<anonymous>"
            file = _normalise_path(m.group(2) or "<unknown>")
            frames.append(f"{file}:{fn}")
            continue

        # SpiderMonkey / JSC
        m = _SM_FRAME_RE.match(trimmed)
        if m:
            fn = m.group(1) or "<anonymous>"
            file = _normalise_path(m.group(2) or "<unknown>")
            frames.append(f"{file}:{fn}")
            continue

        # Java
        m = _JAVA_FRAME_RE.search(trimmed)
        if m:
            fn = m.group(2)
            file = m.group(3)
            frames.append(f"{file}:{fn}")
            continue

        # Ruby
        m = _RUBY_FRAME_RE.match(trimmed)
        if m:
            file = _normalise_path(m.group(1))
            fn = m.group(3)
            frames.append(f"{file}:{fn}")
            continue

        # C#
        m = _CSHARP_FRAME_RE.search(trimmed)
        if m:
            fn = m.group(2)
            file = _normalise_path(m.group(3))
            frames.append(f"{file}:{fn}")
            continue

        # PHP
        m = _PHP_FRAME_RE.match(trimmed)
        if m:
            file = _normalise_path(m.group(1))
            fn = m.group(2).split("->")[-1].split("::")[-1]
            frames.append(f"{file}:{fn}")
            continue

        # Elixir
        m = _ELIXIR_FRAME_RE.search(trimmed)
        if m:
            file = _normalise_path(m.group(1))
            fn = m.group(2)
            frames.append(f"{file}:{fn}")
            continue

        # Rust
        m = _RUST_FRAME_RE.match(trimmed)
        if m:
            file = _normalise_path(m.group(1))
            frames.append(f"{file}:<anonymous>")
            continue

    return frames


def _extract_python_frames(lines: list[str], count: int) -> list[str]:
    """Extract frames from Python traceback format. Returns last N frames."""
    frames: list[str] = []
    for line in lines:
        m = _PY_FRAME_RE.search(line)
        if m:
            file = _normalise_path(m.group(1))
            fn = m.group(2)
            frames.append(f"{file}:{fn}")
    # Python tracebacks list frames chronologically (most recent last)
    return frames[-count:] if frames else []


def _extract_go_frames(lines: list[str], count: int) -> list[str]:
    """Extract frames from Go stack trace format (func line + file line pairs)."""
    frames: list[str] = []
    i = 0
    while i < len(lines) and len(frames) < count:
        trimmed = lines[i].strip()
        func_m = _GO_FUNC_RE.match(trimmed)
        if func_m and i + 1 < len(lines):
            fn_raw = func_m.group(1)
            # Extract just the function name (last part after /)
            fn = fn_raw.split("/")[-1] if "/" in fn_raw else fn_raw
            file_m = _GO_FILE_RE.match(lines[i + 1])
            if file_m:
                file = _normalise_path(file_m.group(1))
                frames.append(f"{file}:{fn}")
                i += 2
                continue
        i += 1
    return frames


def _normalise_path(p: str) -> str:
    """Normalise a file path by stripping query strings and keeping only filename."""
    # Strip query / hash
    p = re.sub(r"[?#].*$", "", p)
    # Collapse deep node_modules paths
    p = re.sub(r"^.*/node_modules/", "node_modules/", p)
    # Strip URL origin
    p = re.sub(r"^https?://[^/]+", "", p)
    # Keep only filename
    p = re.sub(r"^.*[/\\]", "", p)
    return p
