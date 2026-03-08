# Schema Quality Reference

## Column types — full guide

### Primary keys

Always use UUIDs. Never use `SERIAL` or `BIGSERIAL` for new tables.

**Why not SERIAL/BIGSERIAL:**
- Sequential IDs leak information (total record count, creation order)
- They collide when merging data from multiple environments
- UUIDs are safe to generate client-side or in distributed systems

**Prisma:**
```prisma
id String @id @default(uuid())
```

**Raw SQL:**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

---

### Timestamps

Always use `TIMESTAMPTZ` (timestamp with time zone). Never use `TIMESTAMP` (without time zone).

- `TIMESTAMP` stores local time with no timezone — ambiguous across DST boundaries and server moves
- `TIMESTAMPTZ` stores UTC internally and converts on read — always unambiguous

---

### Strings

- **Unbounded text with no meaningful max length:** `TEXT`
- **Text with a meaningful max length:** `VARCHAR(n)` — enforces the constraint at DB level
- **Short, fixed set of values:** `ENUM` type — not `VARCHAR` with app-level validation
- **Never store JSON as `TEXT`** — use `JSONB` (queryable, indexable) or `JSON` (only when preserving insertion order matters, which is rare)

---

### Numbers

- **Money / currency / financial values:** `NUMERIC(precision, scale)` — e.g. `NUMERIC(12, 2)` for amounts up to 10 billion with cent precision
- **Never use `FLOAT` or `REAL` for money** — floating-point rounding causes financial errors
- **Integer counts:** `INTEGER` (up to ~2 billion) or `BIGINT` (larger)

---

### Booleans

Use `BOOLEAN NOT NULL DEFAULT false` — don't use `INTEGER` flags (0/1) or `VARCHAR` ('Y'/'N').

---

## Naming conventions

All identifiers use `snake_case`.

### Tables
- Plural nouns: `users`, `organizations`, `audit_logs`, `team_members`
- No prefixes: `tbl_users` is wrong, `users` is correct
- Join tables: combine both table names — `team_members`, `role_permissions`, `user_invitations`

### Columns
- Foreign keys: `<singular_referenced_table>_id` → `organization_id`, `user_id`, `plan_id`
- Booleans: `is_` or `has_` prefix → `is_active`, `has_verified_email`, `is_system`
- Timestamps: `_at` suffix → `created_at`, `updated_at`, `deleted_at`, `last_login_at`
- `_count` suffix for denormalized counters: `member_count`, `post_count`

### Constraints and indexes
- Primary keys: Postgres auto-names these; no manual naming needed
- Unique constraints: `uq_<table>_<columns>` → `uq_users_org_email`
- Foreign key constraints: `fk_<table>_<column>` → `fk_users_organization_id`
- Indexes: `idx_<table>_<columns>` → `idx_users_organization_id`, `idx_audit_logs_org_created`
- Check constraints: `chk_<table>_<description>` → `chk_subscriptions_positive_amount`

---

## Constraints — full reference

### NOT NULL
Default to `NOT NULL`. Make a column nullable only when `NULL` carries a distinct semantic meaning:
- `deleted_at TIMESTAMPTZ` — `NULL` means "not deleted"
- `password_hash TEXT` — `NULL` means "SSO-only account, no password"
- `canceled_at TIMESTAMPTZ` — `NULL` means "not yet canceled"

### Foreign keys
Every FK must have an explicit `ON DELETE` behavior. Choose deliberately:

| Behavior | When to use |
|---|---|
| `ON DELETE CASCADE` | Child rows have no meaning without the parent (e.g. user's sessions, org's subscriptions) |
| `ON DELETE SET NULL` | The relationship is optional; the child can exist without the parent (e.g. `granted_by` on a role assignment) |
| `ON DELETE RESTRICT` | Prevent deletion if children exist — use when deletion should be a deliberate, guarded operation |

Never leave the default (`RESTRICT`) unintentionally — be explicit.

### Unique constraints
Always enforce uniqueness at the DB level, not just in application code. Application-level checks have race conditions.

Common patterns:
- `email` globally unique if single-identity model
- `(organization_id, email)` unique if per-tenant identity
- `(organization_id, slug)` for URL-friendly identifiers scoped to a tenant

### Check constraints
Use for value bounds and business rules that can be expressed as a condition:

**Raw SQL:**
```sql
CONSTRAINT chk_plans_positive_price CHECK (monthly_price >= 0),
CONSTRAINT chk_subscriptions_period  CHECK (current_period_end > current_period_start)
```

---

## Indexing strategy

### Always index
- Every foreign key column — joins and filters on FKs are universal
- Unique natural keys — `email`, `slug`, `external_id`
- `(organization_id, <primary_sort_column>)` composite index for tenant-scoped list queries

### Partial indexes
Use when queries consistently filter by a condition:

```sql
-- Active subscriptions only
CREATE UNIQUE INDEX idx_subscriptions_active_org
    ON subscriptions (organization_id)
    WHERE status NOT IN ('canceled');

-- Non-deleted users only
CREATE INDEX idx_users_active_email
    ON users (email)
    WHERE deleted_at IS NULL;
```

### Composite index column order
Put the most selective column (or equality-filter column) first:
- `(organization_id, created_at)` — filter by org (equality), sort by date (range)
- `(status, organization_id)` — if you filter by status first and it has low cardinality, this is poor; reverse it

### What not to index
- Every column automatically — indexes have write and storage costs
- Low-cardinality boolean columns alone — a `WHERE is_active = true` index on a column that's almost always `true` won't be used

---

## Audit columns and soft delete

Add these to every table:

```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at  TIMESTAMPTZ  -- soft delete sentinel; NULL = active
```

**Soft delete pattern:**
- Filter all queries with `WHERE deleted_at IS NULL`
- Add a partial index: `CREATE INDEX idx_<table>_active ON <table> (id) WHERE deleted_at IS NULL`
- Never hard-delete rows that could be referenced by audit logs or other history tables

**`updated_at` trigger (raw SQL):**
```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```
Prisma handles `updatedAt` automatically. SQLAlchemy uses `onupdate=func.now()`.

---

## Multi-tenancy patterns

### Row-level tenancy (recommended for most SaaS)

Every tenant-scoped table has an `organization_id` column with a FK to `organizations`:

```sql
organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
```

- Index `organization_id` on every scoped table
- All queries include `WHERE organization_id = $1` — never query across tenants

### Postgres Row-Level Security (RLS)

For strict tenant isolation enforced at the DB layer:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
    USING (organization_id = current_setting('app.current_org_id')::uuid);
```

Set the session variable at connection time:
```sql
SET LOCAL app.current_org_id = '<org_uuid>';
```

In application code (Node.js with Prisma): use `$executeRaw` to set the session variable before queries.

### Schema-per-tenant (alternative — higher complexity)

Each tenant gets their own Postgres schema (`CREATE SCHEMA tenant_<id>`). Tables are identical across schemas. Use only if:
- Tenants require strict data isolation for compliance
- Cross-tenant queries are never needed
- You accept the operational complexity of managing N schemas

Not recommended as the default approach.
