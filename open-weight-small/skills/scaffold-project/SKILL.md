---
name: scaffold-project
description: Step-by-step instructions and templates for scaffolding a new multitenant SaaS project. FastAPI + async PG backend with JWT/RBAC, pnpm frontend monorepo with admin/portal/marketing apps and shared UI library.
---

# Scaffold Project

## Inputs

The scaffolder receives:
- **Project name** — used for directory name, package name, docker service names
- **Initial domains** (optional) — business domain names to scaffold beyond the built-in domains (health, auth, tenants, rbac)

## Placeholder conventions

Throughout this skill, replace:
- `${PROJECT_NAME}` — lowercase, underscores (e.g. `invoice_hub`)
- `${PROJECT_NAME_HYPHEN}` — lowercase, hyphens (e.g. `invoice-hub`)
- `${PROJECT_NAME_UPPER}` — uppercase, underscores (e.g. `INVOICE_HUB`)
- `${PROJECT_TITLE}` — title case, spaces (e.g. `Invoice Hub`)

## Process

Follow these steps in exact order. Do not skip steps. Run the verification command at the end of each section before proceeding.

---

## Step 1 — Root structure

```just
# justfile

# Run the full development stack
dev:
    docker compose up -d db
    sleep 2
    cd backend && uv run alembic upgrade head
    cd backend && uv run uvicorn app.main:app --reload --port 8000 &
    cd frontend && pnpm dev &
    wait

# Run all tests
test:
    cd backend && uv run pytest
    cd frontend && pnpm test -- --run

# Build everything
build:
    cd backend && uv run pytest
    cd frontend && pnpm build

# Generate OpenAPI spec from backend
openapi:
    cd backend && uv run python scripts/generate_openapi.py

# Regenerate frontend client from OpenAPI spec
codegen: openapi
    cp backend/openapi.json frontend/packages/ui/openapi.json
    cd frontend/packages/ui && pnpm codegen

# Lint both stacks
lint:
    cd backend && uv run ruff check . && uv run ruff format --check .
    cd frontend && pnpm lint

# Create a new migration: just migrate "description of change"
migrate msg:
    cd backend && uv run alembic revision --autogenerate -m "{{{{msg}}}}"

# Apply all pending migrations
db-upgrade:
    cd backend && uv run alembic upgrade head

# Run seed script
seed:
    cd backend && uv run python scripts/seed.py

# Tear down docker volumes
clean:
    docker compose down -v
```

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${PROJECT_NAME}_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```yaml
# docker-compose.yml — already shown above, create it here
```

### README

```markdown
# ${PROJECT_TITLE}

## Prerequisites

Install these tools before starting:

| Tool | Purpose | Install |
|------|---------|---------|
| [just](https://just.systems) | Command runner | `brew install just` |
| [uv](https://docs.astral.sh/uv) | Python package manager | `brew install uv` |
| [pnpm](https://pnpm.io) | Node package manager | `brew install pnpm` |
| [Docker](https://www.docker.com) | Database | [docker.com/get-started](https://www.docker.com/get-started/) |

> **Linux:** `just` — see [github.com/casey/just#packages](https://github.com/casey/just#packages); `uv` — `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Quick start

\`\`\`bash
# Install backend dependencies
cd backend && uv sync && cd ..

# Install frontend dependencies
cd frontend && pnpm install && cd ..

# Start everything (database, backend, frontend)
just dev
\`\`\`

The backend runs at http://localhost:8000 — API docs at http://localhost:8000/docs

Frontend apps:
- Admin: http://localhost:3001
- Portal: http://localhost:3002
- Marketing: http://localhost:3003

## Common commands

\`\`\`bash
just test                        # run all tests
just build                       # full build check
just lint                        # lint both stacks
just migrate "add invoice table" # create a migration
just db-upgrade                  # apply pending migrations
just seed                        # run seed data script
just codegen                     # regenerate frontend API client
just clean                       # tear down docker volumes
\`\`\`

Run \`just --list\` to see all available commands.

## Project structure

\`\`\`
backend/    FastAPI + PostgreSQL (Python, uv)
frontend/
  packages/ui/      Shared component library + API client
  apps/admin/       Superadmin panel (port 3001)
  apps/portal/      Customer portal (port 3002)
  apps/marketing/   Marketing site (port 3003)
\`\`\`
```

---

## Step 2 — Backend

### 2a — Python project

```toml
# backend/pyproject.toml
[project]
name = "${PROJECT_NAME_HYPHEN}-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "alembic>=1.13",
    "pyjwt[crypto]>=2.9",
    "passlib[bcrypt]>=1.7",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "ruff>=0.8",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["app"]

[tool.ruff]
target-version = "py312"
line-length = 100
```

### 2b — Config

```python
# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/${PROJECT_NAME}_dev"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7
    debug: bool = False

    model_config = {"env_prefix": "${PROJECT_NAME_UPPER}_"}


settings = Settings()
```

### 2c — Database

```python
# backend/app/database.py
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

### 2d — Base model

```python
# backend/app/models.py
import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class TenantMixin:
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
```

### 2e — Shared utilities

```python
# backend/app/shared/__init__.py
```

```python
# backend/app/shared/pagination.py
from pydantic import BaseModel


class PaginationParams(BaseModel):
    offset: int = 0
    limit: int = 20


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    offset: int
    limit: int
```

```python
# backend/app/shared/exceptions.py
from fastapi import HTTPException, status


class NotFoundError(HTTPException):
    def __init__(self, entity: str, id: str | int):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} {id} not found")


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Insufficient privileges"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
```

```python
# backend/app/shared/testing.py
import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.config import settings
from app.database import async_session
from app.main import app
from app.models import Base


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def superadmin_headers():
    """Returns auth headers for a superadmin user. Use with authenticated_client."""
    from app.domains.auth.jwt import encode_access_token
    token = encode_access_token(
        user_id=uuid.uuid4(),
        tenant_id=None,
        is_superadmin=True,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def tenant_user_headers():
    """Returns auth headers for a regular tenant user."""
    from app.domains.auth.jwt import encode_access_token
    token = encode_access_token(
        user_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        is_superadmin=False,
    )
    return {"Authorization": f"Bearer {token}"}
```

### 2f — Health domain

```python
# backend/app/domains/health/__init__.py
```

```python
# backend/app/domains/health/routes.py
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok"}
```

```python
# backend/app/domains/health/tests/__init__.py
```

```python
# backend/app/domains/health/tests/test_routes.py
from app.shared.testing import client  # noqa: F401


async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

### 2g — Auth domain

```python
# backend/app/domains/auth/__init__.py
```

```python
# backend/app/domains/auth/models.py
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tenants.id"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RefreshToken(Base, TimestampMixin):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    expires_at: Mapped[datetime]
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
```

```python
# backend/app/domains/auth/schemas.py
import uuid
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    is_superadmin: bool
    tenant_id: uuid.UUID | None
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    tenant_id: uuid.UUID | None = None
```

```python
# backend/app/domains/auth/jwt.py
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


def encode_access_token(
    user_id: uuid.UUID,
    tenant_id: uuid.UUID | None,
    is_superadmin: bool,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "is_superadmin": is_superadmin,
        "exp": now + timedelta(minutes=settings.jwt_access_token_expire_minutes),
        "iat": now,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def encode_refresh_token(user_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "exp": now + timedelta(days=settings.jwt_refresh_token_expire_days),
        "iat": now,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
```

```python
# backend/app/domains/auth/dependencies.py
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.domains.auth.jwt import decode_token

bearer_scheme = HTTPBearer()


@dataclass
class CurrentUser:
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    is_superadmin: bool


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        return CurrentUser(
            id=uuid.UUID(payload["sub"]),
            tenant_id=uuid.UUID(payload["tenant_id"]) if payload.get("tenant_id") else None,
            is_superadmin=payload.get("is_superadmin", False),
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
```

```python
# backend/app/domains/auth/service.py
import uuid
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.domains.auth.jwt import encode_access_token, encode_refresh_token, decode_token
from app.domains.auth.models import RefreshToken, User
from app.domains.auth.schemas import TokenResponse

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def authenticate(session: AsyncSession, email: str, password: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    if user and pwd_context.verify(password, user.hashed_password):
        return user
    return None


async def create_tokens(session: AsyncSession, user: User) -> TokenResponse:
    access = encode_access_token(user.id, user.tenant_id, user.is_superadmin)
    refresh = encode_refresh_token(user.id)
    refresh_record = RefreshToken(
        user_id=user.id,
        token=refresh,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    session.add(refresh_record)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


async def refresh_tokens(session: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise ValueError("Invalid token type")
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.token == refresh_token,
            RefreshToken.revoked == False,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise ValueError("Token not found or revoked")
    record.revoked = True
    user_result = await session.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one()
    return await create_tokens(session, user)


async def create_user(
    session: AsyncSession,
    email: str,
    password: str,
    tenant_id: uuid.UUID | None = None,
    is_superadmin: bool = False,
) -> User:
    user = User(
        email=email,
        hashed_password=pwd_context.hash(password),
        tenant_id=tenant_id,
        is_superadmin=is_superadmin,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user
```

```python
# backend/app/domains/auth/routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.domains.auth.dependencies import CurrentUser, get_current_user
from app.domains.auth.schemas import LoginRequest, RefreshRequest, TokenResponse, UserRead
from app.domains.auth import service


router = APIRouter(prefix="/auth", tags=["auth"])


async def get_session():
    async with async_session() as session:
        yield session


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    user = await service.authenticate(session, body.email, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return await service.create_tokens(session, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    try:
        return await service.refresh_tokens(session, body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.get("/me", response_model=UserRead)
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from app.domains.auth.models import User
    from sqlalchemy import select

    result = await session.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
```

```python
# backend/app/domains/auth/tests/__init__.py
```

```python
# backend/app/domains/auth/tests/test_jwt.py
import uuid
from app.domains.auth.jwt import encode_access_token, decode_token


def test_encode_decode_access_token():
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    token = encode_access_token(user_id, tenant_id, is_superadmin=False)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["tenant_id"] == str(tenant_id)
    assert payload["is_superadmin"] is False
    assert payload["type"] == "access"


def test_superadmin_token_has_no_tenant():
    token = encode_access_token(uuid.uuid4(), None, is_superadmin=True)
    payload = decode_token(token)
    assert payload["tenant_id"] is None
    assert payload["is_superadmin"] is True
```

```python
# backend/app/domains/auth/tests/test_routes.py
from app.shared.testing import client  # noqa: F401


async def test_login_invalid_credentials(client):
    response = await client.post("/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
    assert response.status_code == 401
```

### 2h — Tenants domain

```python
# backend/app/domains/tenants/__init__.py
```

```python
# backend/app/domains/tenants/models.py
import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, TimestampMixin


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
```

```python
# backend/app/domains/tenants/schemas.py
import uuid
from pydantic import BaseModel


class TenantCreate(BaseModel):
    name: str
    slug: str


class TenantUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class TenantRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_active: bool

    model_config = {"from_attributes": True}
```

```python
# backend/app/domains/tenants/service.py
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.tenants.models import Tenant
from app.domains.tenants.schemas import TenantCreate, TenantUpdate


async def create_tenant(session: AsyncSession, data: TenantCreate) -> Tenant:
    tenant = Tenant(**data.model_dump())
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)
    return tenant


async def get_tenant(session: AsyncSession, tenant_id: uuid.UUID) -> Tenant | None:
    result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    return result.scalar_one_or_none()


async def list_tenants(session: AsyncSession) -> list[Tenant]:
    result = await session.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    return list(result.scalars().all())
```

```python
# backend/app/domains/tenants/routes.py
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.domains.rbac.guards import require_superadmin
from app.domains.tenants import service
from app.domains.tenants.schemas import TenantCreate, TenantRead


router = APIRouter(prefix="/superadmin/tenants", tags=["tenants"], dependencies=[Depends(require_superadmin)])


async def get_session():
    async with async_session() as session:
        yield session


@router.post("", response_model=TenantRead, status_code=201)
async def create_tenant(body: TenantCreate, session: AsyncSession = Depends(get_session)):
    return await service.create_tenant(session, body)


@router.get("", response_model=list[TenantRead])
async def list_tenants(session: AsyncSession = Depends(get_session)):
    return await service.list_tenants(session)


@router.get("/{tenant_id}", response_model=TenantRead)
async def get_tenant(tenant_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    tenant = await service.get_tenant(session, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant
```

```python
# backend/app/domains/tenants/tests/__init__.py
```

```python
# backend/app/domains/tenants/tests/test_routes.py
from app.shared.testing import client, superadmin_headers  # noqa: F401


async def test_list_tenants_requires_superadmin(client):
    response = await client.get("/superadmin/tenants")
    assert response.status_code == 403 or response.status_code == 401


async def test_list_tenants_as_superadmin(client, superadmin_headers):
    response = await client.get("/superadmin/tenants", headers=superadmin_headers)
    assert response.status_code == 200
```

### 2i — RBAC domain

```python
# backend/app/domains/rbac/__init__.py
```

```python
# backend/app/domains/rbac/models.py
import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, TimestampMixin


class Privilege(Base):
    __tablename__ = "privileges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    codename: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255), default="")


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tenants.id"), nullable=True, index=True
    )

    __table_args__ = (UniqueConstraint("name", "tenant_id", name="uq_role_name_tenant"),)


class RolePrivilege(Base):
    __tablename__ = "role_privileges"

    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    privilege_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("privileges.id"), primary_key=True)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"), primary_key=True)
```

```python
# backend/app/domains/rbac/guards.py
from fastapi import Depends, HTTPException, status

from app.domains.auth.dependencies import CurrentUser, get_current_user


def require_superadmin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current_user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin required")
    return current_user


def require_privilege(codename: str):
    async def _guard(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.is_superadmin:
            return current_user
        # TODO: Load user roles + privileges from DB and check codename
        # For scaffold, this is a placeholder — implement with real DB lookup
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing privilege: {codename}",
        )
    return Depends(_guard)
```

```python
# backend/app/domains/rbac/schemas.py
import uuid
from pydantic import BaseModel


class PrivilegeRead(BaseModel):
    id: uuid.UUID
    codename: str
    description: str

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str
    privilege_ids: list[uuid.UUID] = []


class RoleRead(BaseModel):
    id: uuid.UUID
    name: str
    tenant_id: uuid.UUID | None
    
    model_config = {"from_attributes": True}
```

```python
# backend/app/domains/rbac/service.py
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.rbac.models import Privilege, Role, RolePrivilege, UserRole


async def list_privileges(session: AsyncSession) -> list[Privilege]:
    result = await session.execute(select(Privilege).order_by(Privilege.codename))
    return list(result.scalars().all())


async def get_user_privilege_codenames(
    session: AsyncSession, user_id: uuid.UUID, tenant_id: uuid.UUID | None
) -> set[str]:
    query = (
        select(Privilege.codename)
        .join(RolePrivilege, RolePrivilege.privilege_id == Privilege.id)
        .join(Role, Role.id == RolePrivilege.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    if tenant_id:
        query = query.where((Role.tenant_id == tenant_id) | (Role.tenant_id.is_(None)))
    result = await session.execute(query)
    return set(result.scalars().all())
```

```python
# backend/app/domains/rbac/routes.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.domains.rbac.guards import require_superadmin
from app.domains.rbac import service
from app.domains.rbac.schemas import PrivilegeRead


router = APIRouter(prefix="/superadmin/rbac", tags=["rbac"], dependencies=[Depends(require_superadmin)])


async def get_session():
    async with async_session() as session:
        yield session


@router.get("/privileges", response_model=list[PrivilegeRead])
async def list_privileges(session: AsyncSession = Depends(get_session)):
    return await service.list_privileges(session)
```

```python
# backend/app/domains/rbac/tests/__init__.py
```

```python
# backend/app/domains/rbac/tests/test_guards.py
import uuid
from app.domains.auth.jwt import encode_access_token


def test_superadmin_token_generation():
    token = encode_access_token(uuid.uuid4(), None, is_superadmin=True)
    assert token is not None


def test_regular_user_token_generation():
    token = encode_access_token(uuid.uuid4(), uuid.uuid4(), is_superadmin=False)
    assert token is not None
```

### 2j — App factory (final)

```python
# backend/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.database import engine
from app.domains.health.routes import router as health_router
from app.domains.auth.routes import router as auth_router
from app.domains.tenants.routes import router as tenants_router
from app.domains.rbac.routes import router as rbac_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="${PROJECT_TITLE}", lifespan=lifespan)
    app.include_router(health_router, tags=["health"])
    app.include_router(auth_router)
    app.include_router(tenants_router)
    app.include_router(rbac_router)
    return app


app = create_app()
```

### 2k — OpenAPI generation script

```python
# backend/scripts/generate_openapi.py
import json
from pathlib import Path

from app.main import app

openapi = app.openapi()
output = Path(__file__).parent.parent / "openapi.json"
output.write_text(json.dumps(openapi, indent=2))
print(f"OpenAPI spec written to {output}")
```

### 2l — Alembic setup

Run:
```bash
cd backend && uv run alembic init alembic
```

Then replace the contents of `alembic/env.py` with:

```python
# backend/alembic/env.py
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.models import Base

# Import all domain models so alembic sees them
from app.domains.auth.models import User, RefreshToken  # noqa: F401
from app.domains.tenants.models import Tenant  # noqa: F401
from app.domains.rbac.models import Privilege, Role, RolePrivilege, UserRole  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=settings.database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

Update `alembic.ini` to set:
```ini
sqlalchemy.url = postgresql+asyncpg://postgres:postgres@localhost:5432/${PROJECT_NAME}_dev
```

### Verify backend

```bash
cd backend && uv sync && uv run pytest
```

All tests must pass before proceeding.

---

## Step 3 — Frontend

### 3a — Workspace root

```yaml
# frontend/pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

```json
// frontend/package.json
{
  "name": "${PROJECT_NAME_HYPHEN}",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "codegen": "pnpm --filter @${PROJECT_NAME_HYPHEN}/ui codegen"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7"
  }
}
```

```json
// frontend/turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "storybook:build": { "dependsOn": ["^build"], "outputs": ["storybook-static/**"] }
  }
}
```

### 3b — Shared UI package

```json
// frontend/packages/ui/package.json
{
  "name": "@${PROJECT_NAME_HYPHEN}/ui",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "codegen": "openapi-ts",
    "storybook": "storybook dev -p 6006",
    "storybook:build": "storybook build"
  },
  "dependencies": {
    "@tanstack/react-query": "^5",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@hey-api/openapi-ts": "^0.67",
    "@hey-api/client-fetch": "^0.8",
    "@storybook/react-vite": "^8",
    "@storybook/react": "^8",
    "@testing-library/react": "^16",
    "@testing-library/jest-dom": "^6",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "jsdom": "^25",
    "storybook": "^8",
    "typescript": "^5.7",
    "vite": "^6",
    "vitest": "^3"
  }
}
```

```json
// frontend/packages/ui/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "outDir": "dist",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

```typescript
// frontend/packages/ui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    globals: true,
  },
});
```

```typescript
// frontend/packages/ui/src/test-setup.ts
import "@testing-library/jest-dom/vitest";
```

```typescript
// frontend/packages/ui/src/index.ts
// Barrel export — re-export all public components, hooks, and providers
export { AuthProvider, useAuth } from "./providers/AuthProvider";
```

```typescript
// frontend/packages/ui/.storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/react-vite",
};
export default config;
```

```typescript
// frontend/packages/ui/.storybook/preview.ts
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};
export default preview;
```

```typescript
// frontend/packages/ui/openapi-ts.config.ts
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "./openapi.json",
  output: "./src/client",
});
```

### 3c — AuthProvider

```typescript
// frontend/packages/ui/src/providers/AuthProvider.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface User {
  id: string;
  email: string;
  isSuperadmin: boolean;
  tenantId: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ apiBaseUrl, children }: { apiBaseUrl: string; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    setAccessToken(data.access_token);

    const meRes = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (meRes.ok) {
      const meData = await meRes.json();
      setUser({
        id: meData.id,
        email: meData.email,
        isSuperadmin: meData.is_superadmin,
        tenantId: meData.tenant_id,
      });
    }
  }, [apiBaseUrl]);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, accessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

```typescript
// frontend/packages/ui/src/providers/AuthProvider.test.tsx
import { render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthProvider";

function TestConsumer() {
  const { isAuthenticated } = useAuth();
  return <div>{isAuthenticated ? "yes" : "no"}</div>;
}

describe("AuthProvider", () => {
  it("provides unauthenticated state by default", () => {
    render(
      <AuthProvider apiBaseUrl="http://test">
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByText("no")).toBeInTheDocument();
  });
});
```

### 3d — App template (create for admin, portal, marketing)

Each app follows this structure. Differences are noted per app.

```json
// frontend/apps/{app}/package.json
{
  "name": "@${PROJECT_NAME_HYPHEN}/{app}",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port {port}",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "@${PROJECT_NAME_HYPHEN}/ui": "workspace:*",
    "@tanstack/react-query": "^5",
    "react": "^19",
    "react-dom": "^19",
    "react-router": "^7"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5.7",
    "vite": "^6",
    "vitest": "^3"
  }
}
```

Ports: admin=3001, portal=3002, marketing=3003.

```typescript
// frontend/apps/{app}/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: {port},
    proxy: { "/api": "http://localhost:8000" },
  },
});
```

```json
// frontend/apps/{app}/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"],
  "references": [{ "path": "../../packages/ui" }]
}
```

```html
<!-- frontend/apps/{app}/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${PROJECT_TITLE} — {App Title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

App titles: admin="Admin", portal="Portal", marketing="${PROJECT_TITLE}".

```typescript
// frontend/apps/{app}/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Admin app** — wraps with AuthProvider, superadmin-only:
```typescript
// frontend/apps/admin/src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@${PROJECT_NAME_HYPHEN}/ui";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="/api">
        <div>
          <h1>${PROJECT_TITLE} Admin</h1>
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Portal app** — wraps with AuthProvider, tenant-scoped:
```typescript
// frontend/apps/portal/src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@${PROJECT_NAME_HYPHEN}/ui";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider apiBaseUrl="/api">
        <div>
          <h1>${PROJECT_TITLE} Portal</h1>
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Marketing app** — no auth:
```typescript
// frontend/apps/marketing/src/App.tsx
export default function App() {
  return (
    <div>
      <h1>${PROJECT_TITLE}</h1>
    </div>
  );
}
```

### Verify frontend

```bash
cd frontend && pnpm install && pnpm test && pnpm build
```

All tests must pass and all apps must build before proceeding.

---

## Step 4 — Scaffold initial business domains (if provided)

For each business domain name provided, create the following files exactly. Replace `{domain}` with the domain name (snake_case) and `{Entity}` with the PascalCase entity name (usually the singular domain name, e.g. domain=`orders` → Entity=`Order`).

These are in addition to the built-in domains (health, auth, tenants, rbac).

### Backend files

```python
# backend/app/domains/{domain}/__init__.py
```

```python
# backend/app/domains/{domain}/models.py
import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base, TimestampMixin, TenantMixin


class {Entity}(Base, TimestampMixin, TenantMixin):
    __tablename__ = "{domain}"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
```

```python
# backend/app/domains/{domain}/schemas.py
import uuid
from pydantic import BaseModel


class {Entity}Create(BaseModel):
    name: str


class {Entity}Update(BaseModel):
    name: str | None = None


class {Entity}Read(BaseModel):
    id: uuid.UUID
    name: str
    tenant_id: uuid.UUID

    model_config = {"from_attributes": True}
```

```python
# backend/app/domains/{domain}/service.py
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.{domain}.models import {Entity}
from app.domains.{domain}.schemas import {Entity}Create


async def create_{domain_singular}(
    session: AsyncSession, data: {Entity}Create, tenant_id: uuid.UUID
) -> {Entity}:
    obj = {Entity}(**data.model_dump(), tenant_id=tenant_id)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def list_{domain}(
    session: AsyncSession, tenant_id: uuid.UUID
) -> list[{Entity}]:
    result = await session.execute(
        select({Entity}).where({Entity}.tenant_id == tenant_id)
    )
    return list(result.scalars().all())


async def get_{domain_singular}(
    session: AsyncSession, id: uuid.UUID, tenant_id: uuid.UUID
) -> {Entity} | None:
    result = await session.execute(
        select({Entity}).where({Entity}.id == id, {Entity}.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()
```

```python
# backend/app/domains/{domain}/routes.py
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.domains.auth.dependencies import CurrentUser, get_current_user
from app.domains.rbac.guards import require_privilege
from app.domains.{domain} import service
from app.domains.{domain}.schemas import {Entity}Create, {Entity}Read


router = APIRouter(prefix="/{domain}", tags=["{domain}"])


async def get_session():
    async with async_session() as session:
        yield session


@router.post("", response_model={Entity}Read, status_code=201,
             dependencies=[require_privilege("{domain}.create")])
async def create_{domain_singular}(
    body: {Entity}Create,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    return await service.create_{domain_singular}(session, body, current_user.tenant_id)


@router.get("", response_model=list[{Entity}Read],
            dependencies=[require_privilege("{domain}.read")])
async def list_{domain}(
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    return await service.list_{domain}(session, current_user.tenant_id)


@router.get("/{id}", response_model={Entity}Read,
            dependencies=[require_privilege("{domain}.read")])
async def get_{domain_singular}(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    obj = await service.get_{domain_singular}(session, id, current_user.tenant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="{Entity} not found")
    return obj
```

```python
# backend/app/domains/{domain}/tests/__init__.py
```

```python
# backend/app/domains/{domain}/tests/test_routes.py
from app.shared.testing import client, tenant_user_headers  # noqa: F401


async def test_list_{domain}_requires_auth(client):
    response = await client.get("/{domain}")
    assert response.status_code in (401, 403)


async def test_list_{domain}_authenticated(client, tenant_user_headers):
    response = await client.get("/{domain}", headers=tenant_user_headers)
    # 200 or 403 depending on privilege setup — either is valid at scaffold time
    assert response.status_code in (200, 403)
```

```python
# backend/app/domains/{domain}/tests/test_service.py
# Service tests require a real database session — add integration tests here
# once the test database fixture is configured.
```

After creating these files:
1. Register the router in `backend/app/main.py`:
   ```python
   from app.domains.{domain}.routes import router as {domain}_router
   app.include_router({domain}_router)
   ```
2. Add the model import to `backend/alembic/env.py`:
   ```python
   from app.domains.{domain}.models import {Entity}  # noqa: F401
   ```

### Frontend files

```typescript
// frontend/packages/ui/src/components/{domain}/{Entity}List.tsx
interface {Entity}ListProps {
  items: { id: string; name: string }[];
  isLoading?: boolean;
}

export function {Entity}List({ items, isLoading = false }: {Entity}ListProps) {
  if (isLoading) return <div>Loading...</div>;
  if (items.length === 0) return <div>No {domain} found.</div>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

```typescript
// frontend/packages/ui/src/components/{domain}/{Entity}List.test.tsx
import { render, screen } from "@testing-library/react";
import { {Entity}List } from "./{Entity}List";

describe("{Entity}List", () => {
  it("shows loading state", () => {
    render(<{Entity}List items={[]} isLoading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(<{Entity}List items={[]} />);
    expect(screen.getByText(/no {domain} found/i)).toBeInTheDocument();
  });

  it("renders items", () => {
    render(<{Entity}List items={[{ id: "1", name: "Test" }]} />);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
```

```typescript
// frontend/packages/ui/src/components/{domain}/{Entity}List.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { {Entity}List } from "./{Entity}List";

const meta: Meta<typeof {Entity}List> = {
  component: {Entity}List,
};
export default meta;

type Story = StoryObj<typeof {Entity}List>;

export const Empty: Story = { args: { items: [] } };
export const Loading: Story = { args: { items: [], isLoading: true } };
export const WithItems: Story = {
  args: { items: [{ id: "1", name: "Example {Entity}" }] },
};
```

```typescript
// frontend/packages/ui/src/components/{domain}/index.ts
export { {Entity}List } from "./{Entity}List";
```

```typescript
// frontend/packages/ui/src/hooks/{domain}/use{Entity}.ts
// Placeholder — implement after running just codegen to generate the API client
export {};
```

Add the component export to `frontend/packages/ui/src/index.ts`:
```typescript
export { {Entity}List } from "./components/{domain}";
```

---

## Step 5 — Final verification

Run the full suite from the project root:

```bash
just test
just build
just openapi
```

All three must pass. Report any failures — do not ignore them.
