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
