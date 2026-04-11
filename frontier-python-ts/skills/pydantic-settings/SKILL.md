---
name: pydantic-settings
description: Use when adding or modifying environment variable handling in any Python backend service. Triggers include adding a new env var, replacing direct os.environ / os.getenv access, sharing a settings module across packages, or fixing "missing env var" errors. Replaces the old zod-env approach for the Python backends in this harness.
---

# pydantic-settings

Validate every environment variable at process startup with a single Pydantic settings model. The process dies immediately with a clear error listing every missing or invalid variable — before serving a single request. `os.environ` is never accessed directly outside this module.

## Why

- Missing config should kill the process at boot, not produce a 500 on the first request that needs it.
- One source of truth for "what env vars does this service need" is greppable, type-checked, and editable in one place.
- Pydantic's validation gives free type coercion (`bool`, `int`, `list[str]`, `HttpUrl`) instead of hand-rolled `int(os.environ["PORT"])`.

## Install

```bash
uv add pydantic-settings
```

`pydantic-settings` is a separate package in Pydantic v2 — `from pydantic import BaseSettings` does not exist any more.

## The settings module

```python
# app/core/config.py
from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "myapp-api"
    version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"

    # Networking
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    cors_allowed_origins: list[str] = Field(default_factory=list)

    # Database
    database_url: PostgresDsn
    db_echo: bool = False

    # Redis (jobs, cache)
    redis_url: RedisDsn

    # Auth
    jwt_secret: str = Field(min_length=32)
    jwt_audience: str
    jwt_issuer: str

    # Observability
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    otel_exporter_otlp_endpoint: str | None = None


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as exc:
        # Format every issue on its own line so the operator can fix them all at once.
        lines = [
            f"  • {'.'.join(str(p) for p in err['loc'])}: {err['msg']}"
            for err in exc.errors()
        ]
        raise SystemExit(
            "Invalid environment variables:\n\n" + "\n".join(lines) + "\n"
        ) from exc
```

## How to use

Anywhere you would have written `os.getenv("X")`:

```python
from app.core.config import get_settings

settings = get_settings()
print(settings.database_url)
```

`@lru_cache` makes `get_settings()` a singleton — calling it from a hundred modules is free.

## In FastAPI

Use it as a dependency for testability:

```python
# app/deps.py
from functools import lru_cache
from app.core.config import Settings, get_settings


def settings_dep() -> Settings:
    return get_settings()
```

```python
@router.get("/info")
async def info(settings: Settings = Depends(settings_dep)) -> dict:
    return {"app": settings.app_name, "version": settings.version}
```

Tests can override with `app.dependency_overrides[settings_dep] = lambda: Settings(...)`.

## `.env` and `.env.example`

- `.env` — never committed. In `.gitignore`.
- `.env.example` — committed. Documents every variable with placeholder values. The `developer-advocate` agent owns this file and updates it when this skill's settings model changes.

```bash
# .env.example
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/myapp
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=replace-me-with-a-32-char-string-please
JWT_AUDIENCE=myapp
JWT_ISSUER=myapp
CORS_ALLOWED_ORIGINS=["http://localhost:5173"]
```

Lists are JSON-encoded in `.env`. Pydantic parses them automatically when the field type is `list[...]`.

## Rules

- **Never `os.getenv` outside `app/core/config.py`.** If you find one elsewhere, move it.
- **Never default a secret.** `jwt_secret` has no default — the process must die if it is missing.
- **Validate at startup, not lazily.** `get_settings()` is called from `lifespan` so the failure happens at boot, not at first request.
- **Use the right type.** `bool`, `int`, `PostgresDsn`, `HttpUrl`, `Literal[...]` — never raw `str` for things that have a structure.
- **Settings are immutable at runtime.** Do not mutate `settings.x = ...` in tests; use `Settings(...)` to construct an alternate instance and override the dependency.

## Multiple services in a monorepo

If you have multiple Python services that share env conventions, define a `BaseAppSettings` in a shared package and have each service extend it:

```python
# packages/shared_config/src/shared_config/__init__.py
class BaseAppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: Literal["development", "test", "production"]
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    database_url: PostgresDsn
    redis_url: RedisDsn
```

```python
# apps/api/app/core/config.py
from shared_config import BaseAppSettings

class Settings(BaseAppSettings):
    jwt_secret: str
    jwt_audience: str
```

## Common mistakes

- **Importing `BaseSettings` from `pydantic`** — moved. Use `from pydantic_settings import BaseSettings`.
- **Forgetting `extra="ignore"`** — every unrelated env var on the host throws a validation error.
- **Defaulting `database_url`** — silent fallback to a dev DB in production. No defaults for required values.
- **Reading env vars in `__init__.py` of a package** — pulls config side-effects into import order. Use `get_settings()` lazily.
- **Mutating settings in tests** — override the FastAPI dependency instead.
