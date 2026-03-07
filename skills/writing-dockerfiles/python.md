# Python

## Base image

Pin to the version in `.python-version`, `pyproject.toml`, or `.tool-versions` if present. Prefer `-slim`.

```dockerfile
FROM python:3.12-slim AS base
```

Avoid Alpine for Python — many packages (numpy, Pillow, psycopg2, etc.) require native libraries that aren't present on Alpine and must be compiled from source, causing unpredictable failures.

## Dependency installation — pin and layer correctly

```dockerfile
# Copy dependency files first, install, then copy source
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

`--no-cache-dir` prevents pip from storing the download cache in the image layer, reducing image size.

If using `pyproject.toml` with pip:

```dockerfile
COPY pyproject.toml ./
RUN pip install --no-cache-dir .
```

## Virtual environments in Docker — skip them

Virtual environments exist to isolate dependencies per project on a shared machine. Inside Docker, the container is already isolated — a venv adds complexity and size with no benefit. Install directly into the system Python.

## Multi-stage pattern for Python

Use a multi-stage build when any of the following are true:
- You need system packages to compile Python extensions (e.g. `gcc`, `libpq-dev` for building `psycopg2` from source)
- You have dev-only dependencies (test runners, linters) that shouldn't reach production

If all dependencies are pre-built binary wheels and there are no dev-only deps, a single-stage build is acceptable — but multi-stage is still preferred for consistency and future-proofing.

**Note on `-binary` packages:** `psycopg2-binary` and `Pillow` (when installed via pip) ship bundled native libraries and do not require `gcc` or `libpq-dev` at install time. Do not add system packages for them unless you are building from source (i.e. using `psycopg2` without `-binary`).

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Stage 1: install dependencies
FROM base AS builder
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: production
FROM base AS production
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Environment variables — always set these two

```dockerfile
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
```

- `PYTHONDONTWRITEBYTECODE=1` — prevents `.pyc` files from being written to disk, reducing image size
- `PYTHONUNBUFFERED=1` — ensures stdout/stderr are flushed immediately, so logs appear in `docker logs` without delay

## CMD — use exec form

```dockerfile
# Bad — shell form; signals not forwarded to Python process
CMD "uvicorn app.main:app --host 0.0.0.0 --port 8000"

# Good — exec form; process receives signals directly (graceful shutdown works)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## System dependencies — clean up in the same layer

If you need system packages (e.g. for psycopg2, Pillow):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
 && rm -rf /var/lib/apt/lists/*
```

Install and clean in a single `RUN` step — splitting them into separate steps leaves the package lists in an intermediate layer.

## .dockerignore for Python

```
.git
.env
*.env
__pycache__
*.pyc
*.pyo
.venv
venv
.pytest_cache
.mypy_cache
dist
build
.DS_Store
```

## Checklist

- [ ] Base image version matches `.python-version` / `pyproject.toml` / `.tool-versions`
- [ ] `-slim` variant used (not Alpine)
- [ ] `PYTHONDONTWRITEBYTECODE=1` and `PYTHONUNBUFFERED=1` set
- [ ] `pip install --no-cache-dir` used
- [ ] No virtual environment created inside the container
- [ ] System deps installed and cleaned in a single `RUN` step
- [ ] `__pycache__`, `.venv`, `.pyc` in `.dockerignore`
- [ ] Multi-stage build used when there are build-only system packages or dev-only deps (preferred even when not strictly required)
- [ ] `CMD` uses exec form
- [ ] Non-root user set
- [ ] `HEALTHCHECK` defined
