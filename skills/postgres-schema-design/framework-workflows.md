# Framework Workflows

## Prisma (JS/TS)

### New project — initial schema

1. Initialize Prisma if not already done:
   ```bash
   npx prisma init
   ```
   This creates `prisma/schema.prisma` and `.env` with `DATABASE_URL`.

2. Set the provider in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   
   generator client {
     provider = "prisma-client-js"
   }
   ```

3. Define your models (see schema quality rules in SKILL.md).

4. Create and apply the initial migration:
   ```bash
   npx prisma migrate dev --name init
   ```

5. Commit: `prisma/schema.prisma` + `prisma/migrations/` folder.

---

### Adding or changing tables/columns

1. Edit `prisma/schema.prisma` — add models, fields, relations, indexes, constraints.

2. Generate the migration:
   ```bash
   npx prisma migrate dev --name <descriptive_name>
   ```
   Examples of good names: `add_teams`, `add_stripe_customer_id_to_orgs`, `drop_legacy_tokens`

3. Prisma writes `prisma/migrations/<timestamp>_<name>/migration.sql`. **Review this file** before committing. Check:
   - No unintended `DROP` statements
   - FKs have the `ON DELETE` clause you intended
   - Indexes are present on FK columns

4. Commit `prisma/schema.prisma` and the migration folder together in a single commit.

5. In CI, apply migrations with:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
   (`migrate deploy` applies pending migrations without creating new ones — safe for production.)

---

### Prisma schema patterns for common cases

**UUID primary key:**
```prisma
model User {
  id String @id @default(uuid())
  // ...
}
```

**Timestamps (audit columns):**
```prisma
model User {
  // ...
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt      @map("updated_at")
  deletedAt DateTime?                 @map("deleted_at")
}
```

**FK with explicit delete behavior:**
```prisma
model User {
  organizationId String       @map("organization_id")
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
```

**Index on FK:**
```prisma
model User {
  organizationId String @map("organization_id")

  @@index([organizationId])
}
```

**Unique constraint:**
```prisma
model User {
  email          String
  organizationId String @map("organization_id")

  @@unique([organizationId, email])
}
```

**Enum:**
```prisma
enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  PAUSED
}

model Subscription {
  status SubscriptionStatus @default(TRIALING)
}
```

**Explicit join table (preferred over implicit many-to-many):**
```prisma
model TeamMember {
  teamId    String   @map("team_id")
  userId    String   @map("user_id")
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@id([teamId, userId])
  @@index([userId])
  @@map("team_members")
}
```

Use explicit join tables (not implicit `@relation`) whenever you may want to add metadata to the join later (role, joined_at, etc.).

---

### Prisma — what not to do

- **Do not hand-write `migration.sql`** and place it in `prisma/migrations/` — Prisma tracks migration state via a checksum; hand-crafted files break this
- **Do not run `prisma db push`** in production — it applies schema changes without creating a migration, leaving the migrations folder out of sync
- **Do not use `prisma db push`** in development either, unless you are prototyping and accept that you will need to reset the DB
- **Do not use `SERIAL` or `BIGSERIAL`** for PKs — use `String @id @default(uuid())` or `Int @id @default(autoincrement())` with awareness that autoincrement leaks sequential IDs

---

## Alembic (Python / SQLAlchemy)

### New project — initial setup

1. Initialize Alembic if not already done:
   ```bash
   alembic init alembic
   ```

2. Configure `alembic.ini`:
   ```ini
   sqlalchemy.url = postgresql+psycopg2://user:pass@localhost/dbname
   ```
   (Or read from env in `env.py` — preferred.)

3. Configure `alembic/env.py` to import your models so autogenerate works:
   ```python
   from app.db.base import Base
   import app.models  # noqa: F401 — must import all models so metadata is populated
   
   target_metadata = Base.metadata
   ```
   Without this import, autogenerate sees an empty schema and generates empty migrations.

4. Set `compare_type=True` and `compare_server_default=True` in `env.py` so Alembic detects column type changes:
   ```python
   context.configure(
       connection=connection,
       target_metadata=target_metadata,
       compare_type=True,
       compare_server_default=True,
   )
   ```

---

### Adding or changing tables/columns

1. Edit the SQLAlchemy model in `app/models/`.

2. Generate the migration:
   ```bash
   alembic revision --autogenerate -m "<descriptive_name>"
   ```
   Examples: `add_teams`, `add_stripe_customer_id_to_orgs`, `drop_legacy_tokens`

3. **Review** the generated file in `alembic/versions/`. Common things to check/fix:
   - Postgres-specific types (`JSONB`, `UUID`) — autogenerate may emit `JSON` or `VARCHAR(36)` depending on environment; correct these
   - `server_default` values — autogenerate sometimes misses them
   - Ensure `downgrade()` is correct and complete

4. Apply the migration:
   ```bash
   alembic upgrade head
   ```

5. Commit the model file and the migration file together in a single commit.

---

### SQLAlchemy model patterns for common cases

**UUID primary key (Postgres-native):**
```python
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import UUID
import uuid

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
```

**Timestamps (audit columns):**
```python
from sqlalchemy import Column, DateTime, func

class User(Base):
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
```

**FK with explicit delete behavior:**
```python
from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

class User(Base):
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
```

**Index on FK:**
```python
from sqlalchemy import Column, Index

class User(Base):
    organization_id = Column(...)

    __table_args__ = (
        Index("idx_users_organization_id", "organization_id"),
    )
```

**Unique constraint:**
```python
from sqlalchemy import UniqueConstraint

class User(Base):
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_users_org_email"),
    )
```

**Enum:**
```python
import enum
from sqlalchemy import Column, Enum

class SubscriptionStatus(enum.Enum):
    trialing = "trialing"
    active   = "active"
    past_due = "past_due"
    canceled = "canceled"
    paused   = "paused"

class Subscription(Base):
    status = Column(Enum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.trialing)
```

**JSONB column:**
```python
from sqlalchemy.dialects.postgresql import JSONB

class Plan(Base):
    features = Column(JSONB, nullable=False, server_default="{}")
```

---

### Alembic — what not to do

- **Do not skip autogenerate** and hand-write the migration from scratch unless autogenerate is fundamentally broken for your case (very rare) — autogenerate catches things you forget
- **Do not run raw `ALTER TABLE` or `CREATE TABLE`** in `psql` and then write the migration "to match" — always generate first, then apply
- **Do not leave `downgrade()` as `pass`** — a migration without a downgrade is a one-way door; implement it
- **Do not forget to import all models** in `env.py` — missing imports cause autogenerate to emit empty or incorrect migrations
