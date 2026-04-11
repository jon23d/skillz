# Python (FastAPI + uv)

## Base image

Use the official `python` slim image, pinned to the version in `apps/api/pyproject.toml` `requires-python`. Prefer `-slim`.

```dockerfile
FROM python:3.12-slim AS base
```

Avoid Alpine for Python — many wheels (asyncpg, pydantic-core, cryptography) ship CPython manylinux binaries that don't work on musl. The `-slim` Debian variant gets you small images without the compatibility headaches.

## Package manager — uv

Install uv into the image rather than running `pip install` directly. uv is dramatically faster, respects the lockfile, and produces deterministic installs.

```dockerfile
# Install uv from the official distroless image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
```

`uv` reads `pyproject.toml` and `uv.lock` from the working directory. **Always copy the lockfile** — `uv sync --frozen` will refuse to run without it, which is exactly the behaviour you want in CI/builds.

## Multi-stage pattern for Python

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Stage 1: builder — install dependencies into a venv
FROM base AS builder

# System packages needed for building wheels (drop after install).
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
 && rm -rf /var/lib/apt/lists/*

# Copy lockfile and manifest first — this layer caches across code changes.
COPY pyproject.toml uv.lock ./

# Sync into a project-local .venv. --frozen forbids resolver drift.
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv
RUN uv sync --frozen --no-install-project --no-dev

# Now copy the application source and install the project itself.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN uv sync --frozen --no-dev

# Stage 2: production — minimal runtime image
FROM python:3.12-slim AS production
WORKDIR /app

# Runtime libs only — no build-essential.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
 && rm -rf /var/lib/apt/lists/* \
 && addgroup --system app && adduser --system --ingroup app app

# Copy the prepared venv and the application from the builder.
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/app /app/app
COPY --from=builder --chown=app:app /app/alembic /app/alembic
COPY --from=builder --chown=app:app /app/alembic.ini /app/alembic.ini

# Put the venv on PATH so `uvicorn` resolves directly.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8000/health/live || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The two-step `uv sync` (first without the project, then with it) is the canonical pattern: the dependency layer caches across application code changes, so editing a route does not reinstall asyncpg.

## CMD — use exec form, not shell form

```dockerfile
# Bad — shell form spawns a shell process; signals not forwarded to uvicorn
CMD "uvicorn app.main:app --host 0.0.0.0 --port 8000"

# Good — exec form; uvicorn receives SIGTERM directly (graceful shutdown works)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Without exec form, `docker stop` waits 10 seconds and then `SIGKILL`s the container, which means in-flight requests get cut off and database connections leak.

## Workers in production

`uvicorn` alone is fine for development and for orchestrators that scale by replica count (Kubernetes, ECS). If you need multiple workers per container, use the `--workers` flag rather than `gunicorn -k uvicorn.workers.UvicornWorker`:

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

In Kubernetes, prefer one worker per pod and scale via `replicas`. It gives you per-pod observability and clean rolling restarts.

## Migrations — run as a separate command, not at container start

Do **not** chain `alembic upgrade head` into the `CMD`:

```dockerfile
# Bad — every replica races to run migrations on boot
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

Run migrations as a one-shot job (Kubernetes `Job`, ECS one-off task, GitHub Action) before rolling out new replicas. The container image already has `alembic` installed via the venv, so the same image can be invoked with `alembic upgrade head` as its command from the orchestrator.

## Environment variables

Inject everything at runtime — the image must contain no `DATABASE_URL`, no `JWT_SECRET`, no `OTEL_EXPORTER_OTLP_ENDPOINT`. The only `ENV` instructions in the production stage should be:

```dockerfile
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
```

`PYTHONUNBUFFERED=1` is critical — without it, structlog output is buffered and you lose logs on crash.

## .dockerignore for Python

```
.git
.env
*.env
.venv
__pycache__
*.pyc
*.pyo
.pytest_cache
.ruff_cache
.mypy_cache
.coverage
htmlcov
dist
build
*.egg-info
.DS_Store
```

`.venv` and `__pycache__` must be in `.dockerignore` — copying a host `.venv` into the build context can introduce platform-incompatible binaries (mac wheels into a linux image) and silently breaks `uv sync`.

## Health endpoint

The `HEALTHCHECK` above hits `/health/live`, which is the liveness endpoint defined by the `observability` skill. Confirm the route exists in `app/api/health.py` before relying on it — a `HEALTHCHECK` against a missing route will report unhealthy forever.

## Checklist

- [ ] Base image is `python:X.Y-slim`, version matches `requires-python` in `pyproject.toml`
- [ ] uv installed via `COPY --from=ghcr.io/astral-sh/uv:latest`
- [ ] `pyproject.toml` and `uv.lock` copied before source
- [ ] `uv sync --frozen --no-dev` (never `pip install`)
- [ ] Multi-stage build: builder installs deps, production copies the venv
- [ ] `build-essential` only in the builder stage
- [ ] Non-root `app` user in the production stage
- [ ] `PATH` includes `/app/.venv/bin`
- [ ] `PYTHONUNBUFFERED=1` set
- [ ] `CMD` uses exec form
- [ ] `HEALTHCHECK` points at `/health/live`
- [ ] `alembic upgrade head` runs as a separate job, not chained into `CMD`
- [ ] `.venv` and `__pycache__` in `.dockerignore`
- [ ] No secrets baked into `ENV` or `ARG`
