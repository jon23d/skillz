---
name: postgres-schema-design
description: Use when designing or modifying a PostgreSQL database schema, adding tables or columns, creating indexes, or making any structural database change in a project that uses Prisma (JS/TS) or Alembic (Python).
---

# Postgres Schema Design

## Core rule

**All schema changes go through migrations. Never apply raw DDL directly to the database.**

The migration tool is the source of truth for schema state. Editing `schema.prisma` or a SQLAlchemy model without generating a migration, or running `CREATE TABLE` by hand, breaks that truth.

## Step 1: Identify the migration framework

Before writing anything, confirm which tool the project uses:
- **Prisma** — look for `prisma/schema.prisma`
- **Alembic** — look for `alembic/` directory and `alembic.ini`
- If neither exists, ask before proceeding.

## Step 2: Make the change correctly by framework

See [framework-workflows.md](framework-workflows.md) for full step-by-step workflows.

**Prisma (JS/TS) — short form:**
1. Edit `prisma/schema.prisma` — models, fields, relations, `@@index`, `@@unique`
2. Run `npx prisma migrate dev --name <descriptive-name>` — Prisma generates the SQL
3. Review the generated `prisma/migrations/<timestamp>_<name>/migration.sql`
4. Commit both `schema.prisma` and the migration folder together

Never hand-write the `.sql` migration file. Never create raw numbered `.sql` files outside `prisma/migrations/`.

**Alembic (Python) — short form:**
1. Edit the SQLAlchemy model(s) in `app/models/`
2. Run `alembic revision --autogenerate -m "<descriptive-name>"` to generate the migration
3. Review and adjust the generated file in `alembic/versions/`
4. Run `alembic upgrade head` to apply
5. Commit model changes and the migration file together

Prefer autogenerate over hand-writing. If autogenerate produces wrong output for Postgres-specific types (e.g. `JSONB`, `UUID`), fix the generated file — don't skip generation entirely.

## Step 3: Schema quality checklist

Apply these to every new table. See [schema-quality.md](schema-quality.md) for details and examples.

**Column types:**
- PKs: `UUID` (use `gen_random_uuid()` / `@default(uuid())`) — not `SERIAL` or `BIGSERIAL`
- Timestamps: `TIMESTAMPTZ` — not `TIMESTAMP` (always store in UTC)
- Enums: use a DB-level `ENUM` type (or Prisma `enum`) — not `VARCHAR` + app-level validation
- Free-form structured data: `JSONB` — not `TEXT` storing JSON, not `JSON`
- Short bounded strings: `VARCHAR(n)` — not unbounded `TEXT` when a max length is meaningful
- Money/currency: `NUMERIC(precision, scale)` — never `FLOAT` or `REAL`

**Naming conventions (snake_case everywhere):**
- Tables: plural nouns — `users`, `organizations`, `audit_logs`
- Foreign keys: `<referenced_table_singular>_id` — `organization_id`, `user_id`
- Booleans: `is_` or `has_` prefix — `is_active`, `has_verified_email`
- Timestamps: `_at` suffix — `created_at`, `updated_at`, `deleted_at`
- Indexes: `idx_<table>_<columns>` — `idx_users_organization_id`

**Audit columns — add to every table:**
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at  TIMESTAMPTZ  -- soft delete; NULL means active
```

**Constraints:**
- Every FK must have an explicit `ON DELETE` clause — choose `CASCADE`, `SET NULL`, or `RESTRICT` deliberately
- Add `NOT NULL` by default; make nullable only when NULL has a distinct meaning
- Use `CHECK` constraints for bounded values (e.g. `CHECK (amount > 0)`)
- Add `UNIQUE` constraints at DB level — not just in application code

**Indexing:**
- Index every FK column — queries that join or filter by FK are extremely common
- Add `UNIQUE INDEX` for natural keys (e.g. `email`, `slug`)
- Use partial indexes for filtered queries (e.g. `WHERE deleted_at IS NULL`)
- Composite index column order: highest-cardinality or equality-filter columns first

**Multi-tenancy:**
- Every tenant-scoped table must have an `organization_id` FK column
- Index `organization_id` on every scoped table
- Consider Postgres Row-Level Security (RLS) for tenant isolation at the DB layer

## What not to do

- **Do not create a `schema.sql` or `db/schema.sql` canonical file** that re-runs all migrations — it drifts from actual state and causes confusion
- **Do not hand-write raw numbered `.sql` files** (e.g. `001_create_users.sql`) unless the project explicitly uses a raw SQL migration tool (Flyway, raw SQL runner)
- **Do not apply schema changes directly** with `psql` or a DB GUI and then try to write a migration after — generate the migration first, then apply it
- **Do not commit a migration without the model change** (or vice versa) — they must ship together

## Red flags — stop and check

- About to create a `.sql` file outside the framework's migrations folder → stop, use the framework
- About to run `CREATE TABLE` in a scratch SQL block "to show the schema" → use the framework's schema file instead
- Model edited but no migration generated → incomplete, do not commit
- Migration exists but `prisma generate` / model update not done → client will be out of sync
