# uncaught

Local-first, AI-ready error monitoring for Python. Zero-config error capture with automatic fix prompts.

## Install

```bash
pip install uncaught
```

## Quick Start

```python
from uncaught import init_uncaught

client = init_uncaught({
    "environment": "development",
})

# Errors are automatically captured via sys.excepthook
# Or capture manually:
try:
    risky_operation()
except Exception as e:
    client.capture_error(e)
```

## Framework Integrations

### FastAPI

```python
from fastapi import FastAPI
from uncaught.integrations.fastapi import UncaughtMiddleware

app = FastAPI()
app.add_middleware(UncaughtMiddleware)
```

### Flask

```python
from flask import Flask
from uncaught.integrations.flask import init_app

app = Flask(__name__)
init_app(app)
```

### Django

Add to `MIDDLEWARE` in `settings.py`:

```python
MIDDLEWARE = [
    "uncaught.integrations.django.UncaughtMiddleware",
    # ...
]
```

### SQLAlchemy

```python
from uncaught.integrations.sqlalchemy import setup_sqlalchemy

setup_sqlalchemy(engine)
```

## How It Works

Errors are written to a local `.uncaught/` directory with AI-ready fix prompts. Use the MCP server to query errors from Claude, Cursor, or any MCP-compatible AI tool.

## License

MIT
