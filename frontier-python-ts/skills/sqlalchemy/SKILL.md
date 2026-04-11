---
name: sqlalchemy
description: SQLAlchemy 2.0 async ORM implementation guide. Load whenever working with database access, models, queries, transactions, or relationships in any backend service in this harness. Covers the typed Mapped[] API, the async engine and session, eager loading and N+1 avoidance, transactions, soft deletes, pagination, and error handling. Use alongside `postgres-schema-design` for schema decisions and Alembic migrations.
---

# SQLAlchemy 2.0 (async)

This is the only ORM in this harness. Every backend service uses SQLAlchemy 2.0 with the async engine and the typed `Mapped[...]` API. Sync SQLAlchemy is not used.

## Engine and session

There is exactly one engine per process. Create it once, dispose it on shutdown.

```python
# app/core/db.py
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,             # postgresql+asyncpg://user:pass@host/db
    echo=settings.db_echo,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=5,
)

async_session_maker = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,            # required for FastAPI — see below
    class_=AsyncSession,
)
```

Rules:

- **`postgresql+asyncpg://...`** is the only supported URL scheme. `psycopg` is sync.
- **`expire_on_commit=False`** is non-negotiable. With it left on, every attribute on a returned model becomes a fresh DB roundtrip after `commit()` — and FastAPI's response serialisation runs *after* the dependency commits the session.
- **`pool_pre_ping=True`** transparently recovers from dropped connections (Postgres restarts, network blips, idle timeouts).
- **Engine is per-process, not per-request.** Sharing it across requests is correct. Sharing a *session* across requests is a bug.

## Models — typed `Mapped[...]` API

Use `DeclarativeBase` and the `Mapped[]` / `mapped_column()` API. The old `Column()` style is deprecated.

```python
# app/models/base.py
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

```python
# app/models/user.py
import uuid
from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_users_tenant_email", "tenant_id", "email", unique=True),
        Index("ix_users_tenant_created", "tenant_id", "created_at"),
    )
```

Rules:

- **`Mapped[T]`** drives both runtime behaviour and mypy. Always specify the Python type.
- **String UUIDs (`String(36)`)** are the default PK. Use `default=lambda: str(uuid.uuid4())` so the value is generated client-side and tests can pre-assign IDs. (If you need PG `uuid` type, use `from sqlalchemy.dialects.postgresql import UUID` — but stringify everywhere it crosses an API boundary.)
- **Every FK has an `ondelete` clause.** No silent cascades and no orphaned rows.
- **Every FK column has an index.** Postgres does *not* create one automatically.
- **Composite indexes for tenant-scoped queries** — see the `multi-tenancy` skill.
- **Models do not import schemas, services, or anything from `app/api/`.** They are the bottom of the stack.

## Querying

Always use `select()` from `sqlalchemy`. The legacy `session.query()` API does not exist on `AsyncSession`.

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_user(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def list_users_by_tenant(db: AsyncSession, tenant_id: str) -> list[User]:
    result = await db.execute(
        select(User)
        .where(User.tenant_id == tenant_id)
        .order_by(User.created_at.desc())
    )
    return list(result.scalars().all())
```

Rules:

- **`scalar_one_or_none()`** for "get one or nothing".
- **`scalar_one()`** when absence is a programmer error and a raised exception is correct.
- **`scalars().all()`** for lists of model instances.
- **Always `await db.execute(...)`.** Forgetting `await` is the most common SQLAlchemy async bug.

## Eager loading — N+1 avoidance

Lazy loading does not work in async mode. Accessing an unloaded relationship raises `MissingGreenlet`. Always declare what you need up front.

```python
from sqlalchemy.orm import selectinload, joinedload


# selectinload — best default for collections (one-to-many, many-to-many).
# Issues a second SELECT with WHERE id IN (...).
async def list_users_with_projects(db: AsyncSession) -> list[User]:
    result = await db.execute(
        select(User).options(selectinload(User.projects))
    )
    return list(result.scalars().all())


# joinedload — best for one-to-one and many-to-one.
# Single SELECT with a LEFT OUTER JOIN.
async def get_project_with_owner(db: AsyncSession, pid: str) -> Project | None:
    result = await db.execute(
        select(Project).options(joinedload(Project.owner)).where(Project.id == pid)
    )
    return result.scalar_one_or_none()
```

Rules:

- **`selectinload`** for collections. **`joinedload`** for scalar relationships. Mixing them is a code smell — pick the one that fits the cardinality.
- **Never access `obj.relationship` in async code without loading it first.** It will not lazy-load — it will raise.
- **Loading depth is part of the query, not the model.** Different endpoints want different shapes.

## Inserts and updates

```python
async def create_user(db: AsyncSession, *, tenant_id: str, email: str, name: str) -> User:
    user = User(tenant_id=tenant_id, email=email, name=name)
    db.add(user)
    await db.flush()        # populates server defaults / auto-increment IDs
    await db.refresh(user)  # pulls back any DB-side computed values
    return user


async def update_user_name(db: AsyncSession, user_id: str, name: str) -> User:
    user = await get_user(db, user_id)
    if user is None:
        raise NotFoundError("user", user_id)
    user.name = name
    await db.flush()
    return user
```

Rules:

- **Do not call `commit()` here.** The FastAPI `get_db` dependency commits at the end of the request. Services only `flush()` — and only when they need an ID or a server-default value back.
- **`flush()` ≠ `commit()`.** Flush sends pending SQL but does not end the transaction. Use it whenever you need to read back what the DB generated.

## Transactions

A FastAPI request gets one transaction (managed by `get_db`). For *nested* atomic blocks inside a single request, use savepoints:

```python
async def transfer(db: AsyncSession, *, from_id: str, to_id: str, amount: int) -> None:
    async with db.begin_nested():       # SAVEPOINT
        await db.execute(...)           # debit
        await db.execute(...)           # credit
```

For background workers (arq), each job gets its own session and its own transaction — see the `arq` skill.

**Never wrap a whole request in `async with db.begin():`** — that double-manages the transaction `get_db` already owns.

## Soft deletes

Soft deletes are opt-in per model. When you opt in, every query in the codebase that touches that model must filter `deleted_at IS NULL`. Forgetting that filter is a security bug. Codify it in a service-layer helper:

```python
class Project(Base, TimestampMixin):
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


def active_projects():
    return select(Project).where(Project.deleted_at.is_(None))
```

Use `active_projects()` everywhere instead of `select(Project)`. Hard deletes are also fine for many resources — only opt into soft delete when you have a real reason (audit, undo, billing reconciliation).

## Pagination

Cursor-based for any list that can grow unbounded. Offset-based only for admin tools where the dataset is small and the user wants to jump to page N.

```python
async def list_projects(
    db: AsyncSession,
    *,
    tenant_id: str,
    cursor: str | None,
    limit: int,
) -> tuple[list[Project], str | None]:
    query = (
        select(Project)
        .where(Project.tenant_id == tenant_id)
        .order_by(Project.created_at.desc(), Project.id.desc())
        .limit(limit + 1)
    )
    if cursor is not None:
        cursor_created_at, cursor_id = decode_cursor(cursor)
        query = query.where(
            (Project.created_at, Project.id) < (cursor_created_at, cursor_id)
        )
    result = await db.execute(query)
    rows = list(result.scalars().all())

    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_cursor(last.created_at, last.id)
        rows = rows[:limit]
    return rows, next_cursor
```

Rules:

- **`limit + 1`** trick: fetch one extra row to know whether a next page exists without a separate count.
- **Always order by a tiebreaker** (`created_at, id`) so cursors are deterministic.
- **Never return total counts on hot paths.** `SELECT COUNT(*)` is unbounded work.

## Error handling

Convert SQLAlchemy errors to domain errors at the service boundary. Routes never see raw `IntegrityError`.

```python
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError


async def create_user(db: AsyncSession, ...) -> User:
    user = User(...)
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Inspect exc.orig.sqlstate or the constraint name to be specific
        raise ConflictError("user", "email already exists") from exc
    return user
```

## Project layout (recap)

```
app/
  models/        # SQLAlchemy models — bottom layer
  schemas/       # Pydantic request/response — never imports models
  services/      # Functions taking AsyncSession — business logic
  api/           # FastAPI routers — wire schemas + services together
  core/db.py     # engine + async_session_maker
  deps.py        # get_db, get_current_user
```

## Common mistakes

- **Forgetting `await` on `db.execute(...)`** — the most common bug. Always await.
- **`expire_on_commit=True`** — every attribute access after commit becomes a roundtrip and FastAPI's serialisation will hang or fail.
- **Lazy loading in async** — raises `MissingGreenlet`. Use `selectinload`/`joinedload`.
- **`session.query(...)`** — does not exist on `AsyncSession`. Use `select(...)`.
- **Calling `commit()` in a service** — `get_db` owns the transaction.
- **Holding the session in a global** — one session per request, always.
- **Returning model instances from a route without a `response_model`** — see the `fastapi` skill.
- **Using sync `psycopg2`** — wrong driver. Always `asyncpg`.
- **Soft delete model without a service helper** — every query must filter, and humans forget.
