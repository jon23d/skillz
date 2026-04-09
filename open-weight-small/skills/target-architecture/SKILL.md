---
name: target-architecture
description: Defines the standard project architecture — multitenant SaaS with FastAPI + async PG backend, multiple frontend apps sharing a component library, JWT auth, RBAC. Every agent loads this.
---

# Target Architecture

## Overview

Every project is a multitenant SaaS platform. The backend is Python (FastAPI + async PostgreSQL). The frontend is a pnpm monorepo with a shared component library and multiple apps (admin panel, customer portal, marketing site, and potentially others). OpenAPI bridges backend and frontend via codegen. JWT authentication and RBAC are built in from day one.

## Directory Layout

```
{project}/
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py                       # Async-aware, imports all domain models
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                      # FastAPI app factory
│   │   ├── config.py                    # Settings via pydantic-settings
│   │   ├── database.py                  # Async engine + session factory
│   │   ├── models.py                    # Base model class (shared across domains)
│   │   ├── domains/
│   │   │   ├── health/                  # Reference domain — always present
│   │   │   │   ├── routes.py
│   │   │   │   └── tests/
│   │   │   ├── auth/                    # JWT issuance, token refresh, current user
│   │   │   │   ├── models.py            # User, RefreshToken
│   │   │   │   ├── schemas.py           # LoginRequest, TokenResponse, UserRead
│   │   │   │   ├── routes.py            # /auth/login, /auth/refresh, /auth/me
│   │   │   │   ├── service.py           # Authenticate, create/refresh tokens
│   │   │   │   ├── jwt.py               # Encode/decode helpers, key config
│   │   │   │   ├── dependencies.py      # get_current_user, get_current_tenant
│   │   │   │   └── tests/
│   │   │   ├── tenants/                 # Tenant lifecycle
│   │   │   │   ├── models.py            # Tenant
│   │   │   │   ├── schemas.py
│   │   │   │   ├── routes.py            # /superadmin/tenants (admin), /tenants/me (portal)
│   │   │   │   ├── service.py
│   │   │   │   └── tests/
│   │   │   ├── rbac/                    # Roles, privileges, assignments
│   │   │   │   ├── models.py            # Role, Privilege, UserRole, RolePrivilege
│   │   │   │   ├── schemas.py
│   │   │   │   ├── routes.py            # /superadmin/roles, /tenants/{id}/roles
│   │   │   │   ├── service.py
│   │   │   │   ├── guards.py            # require_superadmin(), require_privilege()
│   │   │   │   └── tests/
│   │   │   └── {domain}/                # Business domains added per project
│   │   │       ├── __init__.py
│   │   │       ├── models.py
│   │   │       ├── schemas.py
│   │   │       ├── routes.py
│   │   │       ├── service.py
│   │   │       └── tests/
│   │   └── shared/
│   │       ├── __init__.py
│   │       ├── pagination.py
│   │       ├── exceptions.py
│   │       └── testing.py
│   └── scripts/
│       └── generate_openapi.py
├── frontend/
│   ├── pnpm-workspace.yaml
│   ├── package.json                     # Workspace root
│   ├── turbo.json                       # Build orchestration
│   ├── packages/
│   │   └── ui/                          # Shared component library
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       ├── src/
│   │       │   ├── components/
│   │       │   │   └── {domain}/
│   │       │   │       ├── {Component}.tsx
│   │       │   │       ├── {Component}.test.tsx
│   │       │   │       ├── {Component}.stories.tsx
│   │       │   │       └── index.ts
│   │       │   ├── hooks/
│   │       │   │   └── {domain}/
│   │       │   │       └── use{Entity}.ts
│   │       │   ├── client/              # Generated from OpenAPI — never hand-edit
│   │       │   ├── providers/
│   │       │   │   └── AuthProvider.tsx  # JWT storage, refresh, context
│   │       │   └── index.ts             # Package barrel export
│   │       ├── .storybook/
│   │       │   ├── main.ts
│   │       │   └── preview.ts
│   │       └── openapi.json
│   └── apps/
│       ├── admin/                       # Superadmin panel (you)
│       │   ├── package.json
│       │   ├── vite.config.ts
│       │   ├── tsconfig.json
│       │   ├── index.html
│       │   └── src/
│       │       ├── main.tsx
│       │       ├── App.tsx
│       │       └── routes/
│       ├── portal/                      # Customer/tenant portal
│       │   ├── package.json
│       │   ├── vite.config.ts
│       │   ├── tsconfig.json
│       │   ├── index.html
│       │   └── src/
│       │       ├── main.tsx
│       │       ├── App.tsx
│       │       └── routes/
│       └── marketing/                   # Public marketing site
│           ├── package.json
│           ├── vite.config.ts
│           ├── tsconfig.json
│           ├── index.html
│           └── src/
│               ├── main.tsx
│               ├── App.tsx
│               └── routes/
├── docker-compose.yml
├── Makefile
└── README.md
```

## Authentication & Authorization

### JWT flow

1. User submits credentials to `POST /auth/login`
2. Backend validates, returns `{ access_token, refresh_token }` as JSON
3. Frontend stores tokens (access in memory, refresh in httpOnly cookie or secure storage)
4. Every API request includes `Authorization: Bearer {access_token}`
5. When access token expires, frontend calls `POST /auth/refresh` with refresh token
6. Backend validates refresh token, issues new pair

### Endpoint gating

Every endpoint falls into one of three categories:

| Gate | Dependency | Use |
|------|-----------|-----|
| **Public** | None | Health check, marketing content, login |
| **`require_superadmin()`** | `get_current_user` | All `/superadmin/*` routes — tenant CRUD, system roles, global config |
| **`require_privilege("codename")`** | `get_current_user` + RBAC lookup | Tenant-scoped actions — checks user has a role with that privilege in their tenant |

```python
# Usage in routes:
@router.get("/superadmin/tenants", dependencies=[Depends(require_superadmin)])
async def list_tenants(...): ...

@router.post("/invoices", dependencies=[Depends(require_privilege("invoices.create"))])
async def create_invoice(...): ...
```

### Superadmin

There is exactly one superadmin concept: `User.is_superadmin = True`. This is set directly in the database or via a seed script — there is no API to grant superadmin. All `/superadmin/*` routes check this flag.

### RBAC model

```
User ──many-to-many──▶ Role ──many-to-many──▶ Privilege
                         │
                         └── tenant_id (nullable)
```

- **Privilege**: A string codename like `invoices.create`, `users.manage`, `reports.view`. Privileges are system-defined — they don't belong to tenants.
- **Role**: A named collection of privileges. Roles with `tenant_id = NULL` are system roles (managed by superadmin). Roles with a `tenant_id` are tenant-scoped (managed by tenant admins with `roles.manage` privilege).
- **UserRole**: Links user to role. A user can have multiple roles.
- **Guard resolution**: `require_privilege("invoices.create")` loads the user's roles (for their tenant), unions all privileges, checks if the codename is present.

### Multitenancy

Every tenant-scoped model has a `tenant_id` foreign key. Services filter by tenant — the current tenant comes from the JWT (via `get_current_user` → `user.tenant_id`).

Superadmin routes are tenant-agnostic — they can operate across tenants.

## Frontend Architecture

### Multiple apps, shared library

The `packages/ui/` library is the product. Apps are thin shells that:
1. Configure routing
2. Wire `AuthProvider` from `@{project}/ui`
3. Compose pages from library components

An app's `package.json` depends on `@{project}/ui` via workspace protocol:
```json
{ "dependencies": { "@{project}/ui": "workspace:*" } }
```

### App responsibilities

| App | Audience | Auth | Routes |
|-----|----------|------|--------|
| **admin** | You (superadmin) | JWT, `is_superadmin` required | `/tenants`, `/roles`, `/users`, system config |
| **portal** | Tenant users | JWT, privilege-gated | Business features, tenant settings |
| **marketing** | Public | None | Landing pages, pricing, signup |

### Adding a new frontend app

1. Copy an existing app directory (e.g. `apps/portal/`)
2. Update `package.json` name
3. Configure `vite.config.ts` with appropriate port and proxy
4. Build routes that compose components from `@{project}/ui`

## Conventions

### Domain isolation

Each domain is a self-contained vertical slice. Backend: models, schemas, routes, service, tests in one directory. Frontend: components, hooks in one directory within `packages/ui/`.

Cross-domain references go through service imports (backend) or component composition (frontend), never direct model/schema imports across domains.

### Backend conventions

- **Models** (`models.py`): SQLAlchemy 2.0 `DeclarativeBase` with `mapped_column`. All tenant-scoped models include `tenant_id: Mapped[uuid.UUID]`. All models include `id` (UUID), `created_at`, `updated_at`.
- **Schemas** (`schemas.py`): Pydantic v2 models. Separate `Create`, `Update`, and `Read` schemas per entity. `Read` is the API response shape. `tenant_id` is never in `Create` schemas — it comes from the JWT.
- **Routes** (`routes.py`): One `APIRouter` per domain. Routes are thin — validate input via schema, call service, return response. No business logic. Every non-public route has an explicit gate dependency.
- **Service** (`service.py`): All business logic. Receives `AsyncSession` and `tenant_id` (or `user`) as parameters. Returns domain objects or raises domain exceptions. Never touches `Request` or `Response`.
- **Tests**: `pytest` + `pytest-asyncio` + `httpx.AsyncClient`. Test services directly for unit tests. Test routes via `AsyncClient` for integration tests. Auth-required routes: tests use a helper fixture that provides a pre-authenticated client.
- **Migrations**: Alembic with async support. `alembic/env.py` imports all domain models. Run `alembic revision --autogenerate -m "description"` then `alembic upgrade head`.

### Frontend conventions

- **Components are the product.** Each component has a clear props interface, its own test, and a Storybook story. Components never fetch data — they receive it via props.
- **Hooks own data fetching.** TanStack Query hooks in `hooks/{domain}/` call the generated client. Components consume hooks. Pages compose components and connect hooks.
- **Pages are glue.** Route files in apps compose components and wire hooks. If a page file is getting complex, extract a component to the UI library.
- **Generated client is the API boundary.** Never hand-write fetch calls or API types. Always use the generated client.
- **AuthProvider wraps every app** (except marketing). Handles token storage, refresh, and exposes `useAuth()` hook with `user`, `login()`, `logout()`, `isAuthenticated`.

### The OpenAPI bridge

```
Backend (Pydantic schemas + FastAPI routes) → openapi.json → Frontend (generated client in packages/ui)
```

1. Backend defines routes with Pydantic schemas and response models
2. `make openapi` outputs `openapi.json`
3. `make codegen` copies spec to `packages/ui/` and runs codegen
4. All apps import the generated client via `@{project}/ui`

FastAPI serves Swagger UI at `/docs` and ReDoc at `/redoc` by default. These are always available in dev. In production, disable with `docs_url=None, redoc_url=None` in the app factory.

### File naming

| Layer | Convention | Example |
|-------|-----------|---------|
| Backend models | `snake_case.py` | `models.py`, `schemas.py` |
| Backend tests | `test_{module}.py` | `test_service.py` |
| Frontend components | `PascalCase.tsx` | `AccountSummary.tsx` |
| Frontend tests | `PascalCase.test.tsx` | `AccountSummary.test.tsx` |
| Frontend stories | `PascalCase.stories.tsx` | `AccountSummary.stories.tsx` |
| Frontend hooks | `camelCase.ts` | `useAccount.ts` |

### Test commands

```bash
# Backend
cd backend && uv run pytest                           # all tests
cd backend && uv run pytest app/domains/{domain}/     # one domain

# Frontend (from frontend/ root)
pnpm --filter @{project}/ui test -- --run      # UI library tests
pnpm --filter @{project}/admin build           # admin app build
pnpm --filter @{project}/ui storybook:build    # verify stories compile
pnpm test                                      # all frontend tests
pnpm build                                     # all frontend builds

# Full suite
just test                                      # backend + frontend
just build                                     # full build check
```

### Alembic migrations

```bash
# Create a migration after changing models
cd backend && uv run alembic revision --autogenerate -m "add invoice table"

# Apply migrations
cd backend && uv run alembic upgrade head

# Check current state
cd backend && uv run alembic current
```

Migrations run against a real database. `docker compose up -d db` must be running. The `just dev` target starts the database automatically.

### Adding a new domain

1. Create `backend/app/domains/{domain}/` with models, schemas, routes, service, tests
2. Register the router in `app/main.py` with appropriate prefix and gate
3. Create an alembic migration: `alembic revision --autogenerate -m "add {domain} tables"`
4. Run `just openapi && just codegen`
5. Create `frontend/packages/ui/src/components/{domain}/` with components, tests, stories
6. Create `frontend/packages/ui/src/hooks/{domain}/` with query hooks
7. Add routes in the appropriate app(s) that compose the new components
