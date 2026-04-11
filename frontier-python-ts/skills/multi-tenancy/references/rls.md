# PostgreSQL Row-Level Security for Multi-Tenancy (SQLAlchemy)

Use this when you need DB-level tenant isolation in addition to (or instead of) the application-layer `TenantSession` approach.

## When RLS is appropriate

- Regulatory compliance requires DB-level enforcement (HIPAA, SOC 2 Type II, PCI-DSS).
- Direct DB access by admin tools or analytics queries that bypass the application.
- Defense-in-depth: a compromised application layer still cannot read another tenant's rows.

## Setup

### 1. Enable RLS on the table (Alembic migration)

```python
def upgrade():
    op.execute('ALTER TABLE projects ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE projects FORCE ROW LEVEL SECURITY')  # applies to table owner too
    op.execute("""
        CREATE POLICY tenant_isolation ON projects
            USING (tenant_id = current_setting('app.tenant_id', true))
    """)


def downgrade():
    op.execute('DROP POLICY IF EXISTS tenant_isolation ON projects')
    op.execute('ALTER TABLE projects DISABLE ROW LEVEL SECURITY')
```

`FORCE ROW LEVEL SECURITY` is critical — without it, the table owner (used by Alembic migrations) bypasses RLS.

### 2. Set the tenant context per session

In SQLAlchemy 2.0 async, set the Postgres session variable on the connection at the start of each request, inside the `get_tenant_db` dependency:

```python
# app/deps.py
from sqlalchemy import text


async def get_tenant_db(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AsyncIterator[TenantSession]:
    async with async_session_maker() as session:
        # Bind the session variable for the duration of this request.
        # set_config(key, value, true) — the `true` makes it transaction-local.
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": user.tenant_id},
        )
        try:
            yield TenantSession(session=session, tenant_id=user.tenant_id)
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()
```

Every query on this session will now be filtered by RLS using the bound `tenant_id`.

### 3. Create a restricted role

```sql
-- Create an app role that cannot bypass RLS
CREATE ROLE app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

The application connects as `app_user`. The migration tool connects as a privileged role (typically `postgres` or a dedicated `migrator` role with `BYPASSRLS`).

### 4. Two database URLs

```bash
# .env
DATABASE_URL=postgresql+asyncpg://app_user:password@localhost:5432/myapp
ALEMBIC_DATABASE_URL=postgresql+asyncpg://migrator:password@localhost:5432/myapp
```

Alembic's `env.py` reads `ALEMBIC_DATABASE_URL` for migrations:

```python
config.set_main_option(
    "sqlalchemy.url",
    str(get_settings().alembic_database_url or get_settings().database_url),
)
```

## Caveats

- **Performance:** RLS adds a policy evaluation step to every query. Index `tenant_id` on every table (you should be doing this anyway).
- **Migrations:** Run migrations with a role that has `BYPASSRLS` or is the table owner. Never use the app role for `alembic upgrade`.
- **Testing:** RLS policies are bypassed by superusers. Test with the restricted app role — easy to forget when running pytest against a testcontainer.
- **Connection pooling:** `set_config(..., true)` is transaction-local. SQLAlchemy's `AsyncSession` runs each unit of work in a transaction, so the binding holds for the request. Do not switch to `set_config(..., false)` (session-local) — connections are reused across tenants.
- **`FORCE ROW LEVEL SECURITY`:** Without this, the table owner bypasses RLS. Always set it.

## Combining RLS with the `TenantSession` approach

The recommended pattern is to use both:

- **`TenantSession` (application layer)** — prevents developer mistakes, fails loudly with a `ValueError` on tenant mismatch, and keeps services clean.
- **RLS (database layer)** — defence-in-depth, protects against compromised application code, raw SQL paths, and direct DB access.

The `TenantSession` filters are technically redundant when RLS is active, but the redundancy is intentional. One layer is the safety net for the other.
