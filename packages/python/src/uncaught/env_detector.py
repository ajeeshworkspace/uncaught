"""Environment detection for Python runtimes and frameworks."""

from __future__ import annotations

import platform
import sys

from uncaught.types import EnvironmentInfo


def detect_environment() -> EnvironmentInfo:
    """Detect the current Python runtime, framework, and platform."""
    info: EnvironmentInfo = {
        "runtime": "Python",
        "runtimeVersion": platform.python_version(),
        "platform": sys.platform,
        "os": platform.system(),
    }

    # Detect framework
    if "fastapi" in sys.modules:
        try:
            import fastapi
            info["framework"] = "FastAPI"
            info["frameworkVersion"] = fastapi.__version__
        except (ImportError, AttributeError):
            pass
    elif "flask" in sys.modules:
        try:
            import flask
            info["framework"] = "Flask"
            info["frameworkVersion"] = flask.__version__
        except (ImportError, AttributeError):
            pass
    elif "django" in sys.modules:
        try:
            import django
            info["framework"] = "Django"
            info["frameworkVersion"] = django.get_version()
        except (ImportError, AttributeError):
            pass
    elif "starlette" in sys.modules:
        try:
            import starlette
            info["framework"] = "Starlette"
            info["frameworkVersion"] = starlette.__version__
        except (ImportError, AttributeError):
            pass

    return info
