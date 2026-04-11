---
name: postgres-schema-design
description: Use when designing or modifying a PostgreSQL database schema, adding tables or columns, creating indexes, writing migrations, or making any structural database change. The data layer in this harness is SQLAlchemy 2.0 async + Alembic. Use alongside the `sqlalchemy` skill (which covers querying, eager loading, transactions).
---

# Postgres Schema Design (SQLAlchemy 2.0 + Alembic)

## Core rule

**All schema changes go through Alembic migrations. Never apply raw DDL directly to the database.**

The migration files are the source of truth for schema state.

## Step 1: Confirm Alembic is set up

Look for `alembic.ini` and `alembic/env.py` at the backend service root. If they do not exist, run the bootstrap section below before changing any model.

---

## Bootstrapping Alembic in a new service

```bash
uv add alembic sqlalchemy[asyncio] asyncpg
uv run alembic init -t async alembic
```

The `-t async` template generates an `env.py` that uses an async engine. Edit it to import your `Base` and read the URL from settings:

```python
# alembic/env.py
import asyncio
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool
from alembic import context

from app.core.config import get_settings
from app.models.base import Base
import app.models  # noqa: F401  — ensure all models are imported

config = context.config
config.set_main_option("sqlalchemy.url", str(get_settings().database_url))
fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

`compare_type=True` and `compare_server_default=True` make autogenerate detect column-type and server-default changes, which Alembic does not catch by default.

The `import app.models` line is critical: autogenerate only sees what `Base.metadata` knows about, and `Base` only knows about modules that have been imported.

---

## The day-to-day workflow

### Adding or changing tables/columns

1. **Edit the SQLAlchemy model** in `app/models/<resource>.py`. Add the field, the relationship, the index, or the constraint.
2. **Generate the migration**:
   ```bash
   uv run alembic revision --autogenerate -m "add stripe_customer_id to users"
   ```
3. **Read the generated file** in `alembic/versions/`. Autogenerate is good but not perfect — verify:
   - No unintended `op.drop_column` or `op.drop_table` statements (autogenerate cannot tell a rename from a delete + add)
   - `nullable=` matches your intent
   - `ondelete=` clauses on foreign keys are correct
   - Indexes on FK columns exist
   - Server defaults match
4. **Apply locally**:
   ```bash
   uv run alembic upgrade head
   ```
5. **Commit** the model change and the migration file together. They are inseparable.

### Renames

Autogenerate **cannot detect renames** — it produces a `drop` + `add`, which destroys data. For renames, hand-edit the migration:

```python
def upgrade():
    op.alter_column("users", "name", new_column_name="full_name")

def downgrade():
    op.alter_column("users", "full_name", new_column_name="name")
```

### Backfills and data migrations

If a column is `NOT NULL` but new, you cannot just add it — existing rows have no value. Split into three migrations:

1. Add the column as nullable.
2. Backfill it with `op.execute("UPDATE users SET tier = 'free' WHERE tier IS NULL")`.
3. Alter it to `NOT NULL`.

In practice, do this in one migration file with three sequential operations — but read it as three logical steps.

### In CI

```bash
uv run alembic upgrade head
```

That is the only command CI needs. Do not run autogenerate in CI.

---

## Schema patterns (canonical)

### UUID primary key

```python
id: Mapped[str] = mapped_column(
    String(36),
    primary_key=True,
    default=lambda: str(uuid.uuid4()),
)
```

String UUIDs are the default. They serialise cleanly to JSON and survive every layer without conversion. Use the Postgres `UUID` type only if you need DB-side `gen_random_uuid()`.

### Timestamp columns (audit)

Use the `TimestampMixin` from the `sqlalchemy` skill:

```python
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
deleted_at: Mapped[datetime | None] = mapped_column(  # only if soft delete
    DateTime(timezone=True),
    nullable=True,
)
```

**Always `timezone=True`.** Never `DateTime` without it. Postgres stores everything as UTC; `timezone=True` makes Python aware of that fact and prevents naïve-vs-aware bugs.

### Foreign keys with explicit delete behaviour

```python
organization_id: Mapped[str] = mapped_column(
    String(36),
    ForeignKey("organizations.id", ondelete="CASCADE"),
    nullable=False,
)
organization: Mapped["Organization"] = relationship(back_populates="users")
```

**Every FK has an `ondelete` clause.** The default is `NO ACTION`, which means orphaned rows. Pick one of:

- `CASCADE` — child rows go when the parent does (e.g. organization → its users)
- `SET NULL` — child rows survive but lose the link (rare)
- `RESTRICT` — block parent deletion if children exist (e.g. invoice → orders)

### Index every FK column

```python
__table_args__ = (
    Index("ix_users_organization_id", "organization_id"),
)
```

Postgres does **not** create indexes for FK columns automatically. Without one, every join and every cascade delete becomes a sequential scan.

### Composite indexes for the common query patterns

```python
__table_args__ = (
    Index("ix_users_org_email", "organization_id", "email", unique=True),
    Index("ix_users_org_created", "organization_id", "created_at"),
)
```

Index for the query you actually run. `tenant_id` alone is rarely enough — see the `multi-tenancy` skill.

### Unique constraints

```python
__table_args__ = (
    UniqueConstraint("organization_id", "email", name="uq_users_org_email"),
)
```

Always name your constraints. Postgres-generated names are unstable across migrations.

### Enums

Use Python `Enum` classes mapped to the Postgres `ENUM` type:

```python
import enum
from sqlalchemy import Enum

class SubscriptionStatus(str, enum.Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"

# In the model:
status: Mapped[SubscriptionStatus] = mapped_column(
    Enum(SubscriptionStatus, name="subscription_status"),
    nullable=False,
    default=SubscriptionStatus.TRIALING,
)
```

Two important things:

1. **`str, enum.Enum`** — the dual base class makes the values JSON-serialisable as plain strings.
2. **`name="subscription_status"`** — the Postgres ENUM type needs an explicit name; without one Alembic generates a random one.

Adding a new enum value requires `op.execute("ALTER TYPE subscription_status ADD VALUE 'paused'")` in a migration — autogenerate will miss it.

### Many-to-many — explicit join table

```python
class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

Always make the join table explicit. The day you need to add `granted_by`, `expires_at`, or any other column, you will be glad it is a real model.

---

## Quality rules

### Never store money as float

```python
amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
```

Or use `Numeric(precision=12, scale=2)` if you need decimals — never `Float`.

### Strings have a length

`String(200)`, `String(320)` (email max), `String(36)` (UUID). Bare `String` (= unbounded TEXT) is fine for prose-like content but explicit limits force you to think about size.

### Booleans have a default

```python
is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
```

A nullable boolean has three states (true, false, NULL). That is almost never what you want.

### Default to `NOT NULL`

Every column starts `nullable=False`. Only mark a column nullable when there is a real reason — e.g. an optional field that can legitimately be unset, or a soft-delete `deleted_at`.

---

## Anti-patterns

- **`session.execute(text("ALTER TABLE ..."))`** — never. Always Alembic.
- **`Base.metadata.create_all()`** in production code paths — Alembic owns the schema.
- **Editing an old migration after it has been applied** — never. Create a new migration.
- **One migration per model change, with no message** — descriptive `-m` messages are part of the audit trail.
- **`ondelete=NO ACTION`** by default — creates orphaned rows on delete.
- **No index on a FK** — sequential scans for every join.
- **Unbounded `String` for things with a known max length** — kicks the can on data hygiene.
- **`Float` for money** — incorrect arithmetic, eventually a billing incident.

## Reference

For querying, eager loading, transactions, soft deletes, and pagination patterns, see the `sqlalchemy` skill. This skill covers schema; that skill covers access.
