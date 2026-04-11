---
name: fastapi
description: FastAPI implementation guide. Load whenever building or modifying any backend HTTP service in this harness — defining routes, request/response models, dependencies, middleware, error handlers, lifespan events, or background tasks. Triggers include: APIRouter, Depends, FastAPI app instance, response_model, OpenAPI generation, async endpoint handlers. Use alongside `sqlalchemy`, `pydantic`, and `rest-api-design`.
---

# FastAPI

This is the canonical web framework for every backend service in this harness. There are no Fastify, Express, or Node-based backends — only FastAPI.

## Application factory

Always create the app via a factory, never as a top-level `FastAPI()` call. The factory makes testing trivial and lets you compose dependencies per environment.

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.api.v1 import users, projects
from app.core.config import get_settings
from app.core.db import engine
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        lifespan=lifespan,
        # Tighten the default OpenAPI URL only if you have a reason
        openapi_url="/openapi.json",
    )
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(projects.router, prefix="/api/v1")
    return app


app = create_app()
```

Run with: `uv run uvicorn app.main:app --reload`.

## Routers

One router per resource. The router lives next to the handlers it owns.

```python
# app/api/v1/users.py
from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user, get_db
from app.schemas.user import UserCreate, UserRead
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user",
)
async def create_user(
    payload: UserCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
) -> UserRead:
    user = await user_service.create(db, payload, actor=current_user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: str, db=Depends(get_db)) -> UserRead:
    user = await user_service.get(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

Rules:

- **Always async.** Every handler is `async def`. Sync handlers block the event loop.
- **Always typed.** Type-annotate every parameter and the return value. mypy enforces this.
- **`response_model` is non-negotiable.** It is what FastAPI uses to populate the OpenAPI spec, and it strips response data to the schema. Without it the frontend codegen has nothing to type against.
- **Status codes are explicit.** Use `status_code=status.HTTP_201_CREATED` (etc.) on the decorator. Do not return `Response(status_code=...)` from handler bodies for normal flows.
- **One router per resource.** Group by domain object, not by HTTP verb.
- **`tags=[...]`** drives OpenAPI grouping and is required.

## Dependency injection

Dependencies are FastAPI's superpower. Use them for everything that crosses a boundary: DB sessions, the current user, tenant resolution, feature flags, anything you would otherwise pass through a global.

```python
# app/deps.py
from typing import AsyncIterator
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_maker
from app.core.security import decode_jwt
from app.schemas.auth import AuthenticatedUser


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


async def get_current_user(
    authorization: str = Header(...),
) -> AuthenticatedUser:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_jwt(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    return AuthenticatedUser(**claims)
```

Rules:

- **`get_db` is the only place a session is created.** Never instantiate `AsyncSession` inside a handler or service. Always inject.
- **`get_db` commits on success and rolls back on exception.** Handlers do not call `commit()`/`rollback()` directly.
- **Auth is a dependency, never middleware.** Middleware cannot return a typed `current_user` to handlers; dependencies can.
- **Compose dependencies.** `get_current_admin = Depends(get_current_user)` then check the role inside — no copy-paste auth checks.

## Pydantic schemas (request/response)

Schemas are `BaseModel` subclasses. They live in `app/schemas/` and are **separate from ORM models**. Never return a SQLAlchemy model directly from a handler — always convert to a schema via `response_model` or explicit construction.

See the `pydantic` skill for full details. The relevant rule for FastAPI:

```python
# app/schemas/user.py
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)


class UserCreate(UserBase):
    password: str = Field(min_length=12)


class UserRead(UserBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}  # allow construction from ORM objects
```

`from_attributes=True` lets `response_model=UserRead` accept a SQLAlchemy `User` row directly.

## Error handling

Raise `HTTPException` for all expected errors. Register exception handlers for domain errors so handlers stay clean.

```python
# app/core/errors.py
class NotFoundError(Exception):
    def __init__(self, resource: str, identifier: str):
        self.resource = resource
        self.identifier = identifier


# app/main.py
from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(
        status_code=404,
        content={
            "error": "not_found",
            "resource": exc.resource,
            "identifier": exc.identifier,
        },
    )
```

Rules:

- **One error envelope shape.** Every error response is `{"error": "...", ...}`. Decide the shape once and reuse it.
- **Never leak internals.** No tracebacks, no DB error strings, no `repr(exc)` in responses. Log them, do not return them.
- **Validation errors are FastAPI's job.** A bad request body is automatically a `422` — do not write your own validation handlers.

## OpenAPI is automatic

FastAPI generates `/openapi.json` from your route signatures, `response_model`s, and Pydantic schemas. There is no codegen step on the backend, no hand-authored `openapi.yaml`, no decorators to add.

What this requires of you:

- Every handler has typed parameters and a `response_model`.
- Every router has `tags=[...]`.
- Every error response shape is registered via `responses={...}` on the route decorator if you want it documented.

```python
@router.get(
    "/{user_id}",
    response_model=UserRead,
    responses={
        404: {"model": ErrorResponse, "description": "User not found"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
)
```

The frontend `openapi-codegen` skill consumes the live `/openapi.json` from the running FastAPI app — see that skill for the full contract.

## Middleware

Use middleware for cross-cutting concerns that are not request-scoped state: CORS, request IDs, structured logging, metrics. Use dependencies for everything else.

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,  # explicit list, never ["*"] in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Rules:

- **Never `allow_origins=["*"]` in production.** Read from settings.
- **Request-ID middleware is mandatory.** It generates or propagates `X-Request-ID` and binds it to the structlog context. See the `observability` skill.
- **Order matters.** Middleware runs in the *reverse* order of registration. CORS goes first; logging goes last.

## Background tasks

For trivial fire-and-forget work that completes inside the response cycle, use FastAPI's built-in `BackgroundTasks`. For anything that must survive a process restart or run on a schedule, use **arq** — see the `arq` skill.

```python
from fastapi import BackgroundTasks

@router.post("/users", response_model=UserRead, status_code=201)
async def create_user(
    payload: UserCreate,
    background: BackgroundTasks,
    db=Depends(get_db),
) -> UserRead:
    user = await user_service.create(db, payload)
    background.add_task(send_welcome_email, user.email)
    return user
```

Do not use `BackgroundTasks` for anything that:
- Hits an external service that might be slow (use arq)
- Must retry on failure (use arq)
- Must run on a schedule (use arq)

## Project layout

```
app/
  main.py                # create_app + lifespan
  api/
    v1/
      users.py           # APIRouter(prefix="/users")
      projects.py
  core/
    config.py            # pydantic-settings
    db.py                # async engine + sessionmaker
    security.py          # JWT decode/encode
    logging.py
    errors.py
  models/                # SQLAlchemy ORM models
    user.py
    project.py
  schemas/               # Pydantic request/response models
    user.py
    project.py
  services/              # business logic — pure functions taking AsyncSession
    user_service.py
  deps.py                # FastAPI dependencies (get_db, get_current_user)
tests/
  conftest.py
  factories/
  api/
    test_users.py
alembic/
  versions/
pyproject.toml
```

Rules:

- **Models, schemas, services, and routes are four separate layers.** Never collapse them.
- **Services take an `AsyncSession` as the first argument.** They never import `get_db`. Dependency injection is the route's job, not the service's.
- **Models never import schemas; schemas never import models.** They are independent representations.

## Testing

See the `tdd` skill (Backend section) for the full testing methodology. The relevant FastAPI bit:

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import create_app

@pytest_asyncio.fixture
async def client():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

Use `httpx.AsyncClient` against the ASGI app — never spin up a real uvicorn process for unit tests.

## Common mistakes

- **Using `def` instead of `async def`** — blocks the event loop.
- **Returning ORM models without `response_model`** — produces uncontrolled responses and an empty OpenAPI spec.
- **Calling `session.commit()` inside a handler** — `get_db` owns the transaction.
- **Putting auth in middleware** — use a dependency.
- **`allow_origins=["*"]` with `allow_credentials=True`** — browsers reject this combination silently.
- **Importing `app` at module load time in tests** — creates one shared app across all tests; use the factory.
