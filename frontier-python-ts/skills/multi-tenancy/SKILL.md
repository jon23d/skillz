---
name: multi-tenancy
description: Use when building or modifying multi-tenant features in a FastAPI + SQLAlchemy backend in this harness — shared database with tenant isolation, per-request tenant context, query scoping, or any code where one deployment serves multiple organizations/tenants. Triggers include tenant_id, organization_id, workspace isolation, tenant-scoped queries, cross-tenant data leak risk, JWT tenant claims.
---

# Multi-Tenancy (FastAPI + SQLAlchemy 2.0 + PostgreSQL)

## Core principle

Tenant isolation must be **structural, not conventional**. If a developer can write a query that skips the tenant filter without getting a type error or a 401, the isolation is fragile. Every pattern below enforces this through FastAPI's dependency injection, not through developer discipline.

## Architecture overview

- Single PostgreSQL database, shared tables.
- `tenant_id: Mapped[str]` column on every tenant-scoped model, with composite indexes for the common query patterns.
- Tenant identity from a verified JWT claim, parsed by a FastAPI security dependency.
- A request-scoped "tenant repo" wrapper that exposes `select`/`get`/`create` helpers which inject `tenant_id` automatically. Routes never see the raw `AsyncSession` for tenant-scoped resources.
- A test that asserts cross-tenant access returns 404, run for every tenant-scoped endpoint.

---

## 1. SQLAlchemy schema

Every tenant-scoped model carries `tenant_id` and at least one composite index. See the `postgres-schema-design` skill for the index rationale.

```python
# app/models/project.py
from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    __table_args__ = (
        Index("ix_projects_tenant", "tenant_id"),
        Index("ix_projects_tenant_created", "tenant_id", "created_at"),
        Index("ix_projects_tenant_name", "tenant_id", "name", unique=True),
    )
```

`Index("ix_projects_tenant", "tenant_id")` alone is not enough — add composite indexes for the queries you actually run (listing, sorting, uniqueness within a tenant).

---

## 2. The authenticated user dependency

The JWT-decoding dependency returns a typed user with the tenant claim. This is the *only* source of truth for `tenant_id` — never read it from the request body, query params, or path.

```python
# app/schemas/auth.py
from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    sub: str          # user id
    tenant_id: str
    roles: list[str] = []
```

```python
# app/deps.py
from fastapi import Depends, Header, HTTPException

from app.core.security import decode_jwt
from app.schemas.auth import AuthenticatedUser


async def get_current_user(authorization: str = Header(...)) -> AuthenticatedUser:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        claims = decode_jwt(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if "tenant_id" not in claims:
        # The JWT issuer is required to set tenant_id. If it is missing, refuse the request.
        raise HTTPException(status_code=401, detail="Missing tenant context")

    return AuthenticatedUser(**claims)
```

---

## 3. The tenant-scoped session dependency

Routes do not get a raw `AsyncSession` for tenant-scoped resources. They get a `TenantSession` — a tiny wrapper that holds the session and the tenant id together, and provides helpers that inject the filter.

```python
# app/core/tenant_db.py
from dataclasses import dataclass
from typing import TypeVar

from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


@dataclass
class TenantSession:
    session: AsyncSession
    tenant_id: str

    def scope(self, stmt: Select[tuple[T]], model_tenant_col) -> Select[tuple[T]]:
        """Apply the tenant filter to a select() statement."""
        return stmt.where(model_tenant_col == self.tenant_id)

    async def get(self, model: type[T], obj_id: str) -> T | None:
        """Fetch by primary key, but only if it belongs to this tenant."""
        from sqlalchemy import select
        stmt = select(model).where(model.id == obj_id, model.tenant_id == self.tenant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    def add(self, obj) -> None:
        """Add an object to the session, asserting it belongs to this tenant."""
        if getattr(obj, "tenant_id", None) != self.tenant_id:
            raise ValueError(
                f"Tenant mismatch: object tenant_id={getattr(obj, 'tenant_id', None)} "
                f"does not match request tenant_id={self.tenant_id}"
            )
        self.session.add(obj)
```

```python
# app/deps.py (continued)
from app.core.db import async_session_maker
from app.core.tenant_db import TenantSession


async def get_tenant_db(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AsyncIterator[TenantSession]:
    async with async_session_maker() as session:
        try:
            yield TenantSession(session=session, tenant_id=user.tenant_id)
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()
```

Rules:

- **`get_tenant_db` is the only way to get a session inside a tenant-scoped route.** A plain `get_db` exists only for genuinely tenant-agnostic endpoints (health checks, public registration).
- **`TenantSession.add` raises if the model's tenant_id does not match the request's.** This catches "service forgot to set tenant_id" at the boundary.
- **`TenantSession.get` returns `None` for cross-tenant lookups** — the route should turn that into a 404, not a 403, so the existence of the resource is not leaked.

---

## 4. Service layer pattern

Services take a `TenantSession`, not an `AsyncSession`. The wrapper carries the tenant id with the session, so the service signature is enough to enforce isolation.

```python
# app/services/project_service.py
from sqlalchemy import select

from app.core.tenant_db import TenantSession
from app.models.project import Project
from app.schemas.project import ProjectCreate


async def list_projects(tdb: TenantSession) -> list[Project]:
    stmt = tdb.scope(select(Project), Project.tenant_id).order_by(Project.created_at.desc())
    result = await tdb.session.execute(stmt)
    return list(result.scalars().all())


async def get_project(tdb: TenantSession, project_id: str) -> Project | None:
    return await tdb.get(Project, project_id)


async def create_project(tdb: TenantSession, payload: ProjectCreate) -> Project:
    project = Project(
        tenant_id=tdb.tenant_id,            # always sourced from the wrapper
        name=payload.name,
    )
    tdb.add(project)                        # raises if tenant_id is wrong
    await tdb.session.flush()
    return project
```

A service that takes a plain `AsyncSession` for tenant-scoped work is a code smell — the reviewer should flag it.

---

## 5. Route handler

```python
# app/api/v1/projects.py
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_tenant_db
from app.core.tenant_db import TenantSession
from app.schemas.project import ProjectCreate, ProjectRead
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
async def list_projects(tdb: TenantSession = Depends(get_tenant_db)):
    return await project_service.list_projects(tdb)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: str, tdb: TenantSession = Depends(get_tenant_db)):
    project = await project_service.get_project(tdb, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate,
    tdb: TenantSession = Depends(get_tenant_db),
):
    return await project_service.create_project(tdb, payload)
```

Note: the route never reads `tenant_id` from the request. It only ever comes from the JWT.

---

## 6. The cross-tenant test (mandatory)

Every tenant-scoped endpoint gets a test that asserts cross-tenant access returns 404. This is the test that catches the entire class of "I forgot the filter" bugs.

```python
# tests/api/test_projects_isolation.py
async def test_cannot_access_other_tenants_project(client_for, db):
    tenant_a = await create_tenant(db)
    tenant_b = await create_tenant(db)

    project = await create_project(db, tenant_id=tenant_a.id, name="A's project")

    # Issue a token for tenant B and try to fetch tenant A's project
    response = await client_for(tenant_id=tenant_b.id).get(f"/api/v1/projects/{project.id}")
    assert response.status_code == 404


async def test_list_only_returns_my_tenant(client_for, db):
    tenant_a = await create_tenant(db)
    tenant_b = await create_tenant(db)
    await create_project(db, tenant_id=tenant_a.id, name="A1")
    await create_project(db, tenant_id=tenant_b.id, name="B1")

    response = await client_for(tenant_id=tenant_a.id).get("/api/v1/projects")
    names = [p["name"] for p in response.json()]
    assert names == ["A1"]
```

A `client_for(tenant_id=...)` test fixture builds an `httpx.AsyncClient` with an Authorization header carrying a JWT for the requested tenant. Define it once in `tests/conftest.py`.

---

## Common mistakes

- **Reading `tenant_id` from request body/query/path** — only ever from the JWT.
- **Service taking `AsyncSession` instead of `TenantSession`** — bypasses the wrapper. Reviewer should flag.
- **`TenantSession.session.execute(select(Project))`** without `.scope(...)` — defeats the purpose. Always go through the helper or the explicit `where(Project.tenant_id == tdb.tenant_id)`.
- **Returning 403 for cross-tenant access** — leaks existence. Use 404.
- **Forgetting the cross-tenant test for a new endpoint** — every tenant-scoped resource gets one.
- **Composite index missing** — `SELECT * FROM projects WHERE tenant_id = ? ORDER BY created_at DESC` against a single-column `tenant_id` index does a sort scan. Add `(tenant_id, created_at)`.
- **Trusting the `current_user.tenant_id` set by middleware** — middleware in FastAPI cannot return typed values to handlers. Use a dependency.

---

## When to add PostgreSQL Row-Level Security on top

The shared-table + dependency-injected approach above is correct for most applications. Add Postgres RLS only when:

- Regulatory requirements demand DB-level isolation (HIPAA, SOC 2 Type II, PCI-DSS).
- You have untrusted query paths (raw SQL from analytics tools, admin shells).
- Defence-in-depth is mandated: a compromised application layer must still not leak cross-tenant data.

See `references/rls.md` for the RLS setup pattern with SQLAlchemy.
