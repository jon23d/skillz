---
name: database-schema-design
description: Use when designing or modifying database schemas, writing migrations, or modeling data relationships. Covers naming, normalisation, indexing, constraints, and migration safety — ORM-agnostic.
---

# Database Schema Design

## Philosophy

The schema is the foundation. A poor schema creates problems no amount of application code can fully fix. Model what is true about the business domain, not what the current UI or API happens to need. Changing a schema after data is in production is expensive — design with that cost in mind.

## Naming conventions

- `snake_case` for all table and column names
- Tables: singular nouns (`user`, `order`, `product`)
- Primary keys: always `id`
- Foreign keys: `{relation}_id` — `user_id`, `order_id`
- Timestamp columns: `created_at` and `updated_at` on every table, defaulting to current time
- Booleans: prefixed `is_` or `has_` — `is_active`, `has_verified_email`

## Primary keys

Use `cuid` or `uuid` for primary keys — never auto-incrementing integers for externally exposed resources. Sequential IDs leak record counts and are trivially enumerable.

## Normalisation

- Normalise to third normal form by default; denormalise deliberately and document why
- Do not store derived data unless there is a measured performance requirement
- Do not store comma-separated values or JSON arrays where a relation table is appropriate — if you need to query into it, it belongs in a proper relation

## Relationships

- Define all foreign key constraints explicitly
- Choose cascade behaviour deliberately:
  - Cascade delete: child records have no meaning without the parent
  - Restrict delete: deleting a parent with children should be an error
  - Set null: child can exist without the parent
- Document non-obvious cascade choices with a comment
- Many-to-many joins use an explicit join table with its own `id`, `created_at`, and any relationship-specific metadata

## Constraints

Use database-level constraints to enforce invariants — do not rely solely on application-layer validation:
- Unique constraints for fields that must be unique
- Composite unique constraints for multi-column uniqueness
- Sensible defaults on columns
- Enum or check constraints for fields with a fixed set of valid values

## Indexing

- Index foreign key columns (many databases do not do this automatically)
- Index columns used in common `WHERE` clauses
- Index columns used in `ORDER BY` for large tables
- Use composite indexes for queries that filter on multiple columns; put the most selective column first
- Do not over-index — every index slows writes; add indexes when there is a query that needs them

## Soft deletes

Use sparingly. Soft deletes add complexity to every query and make constraints harder to reason about. When used, a `deleted_at DateTime?` column is conventional. Consider a partial unique index to allow re-use of unique fields after soft deletion.

## Migrations

- Every schema change is a migration — never modify a production database directly
- Write migrations as if they cannot be rolled back
- For destructive changes (dropping a column, changing a type), use a multi-step process across multiple deployments:
  1. Add the new column
  2. Deploy code that writes to both old and new
  3. Backfill the new column
  4. Deploy code that reads from the new column only
  5. Drop the old column in a later migration
- Never rename a column in a single migration with live traffic
- Keep migrations small and focused — one concern per migration

## Transactions

Any operation that must be atomic must run inside a transaction. Never perform multi-step mutations outside a transaction.

## Querying

- Select only the columns you need — avoid `SELECT *` or fetching entire records when only a subset is needed; this is especially important for tables with large text or JSON columns
- Parameterise all queries — never interpolate user input into SQL strings
