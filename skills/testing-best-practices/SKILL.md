---
name: testing-best-practices
description: Use when writing or reviewing TypeScript tests with vitest. Covers when to use testcontainers vs factories, database integration test setup with Prisma, mocking boundaries, async patterns, it.each, test structure, and naming conventions.
---

# Testing Best Practices — TypeScript / Vitest

## Running tests

Run `npx vitest run` from the project root. Always run the full suite. TypeScript errors are test failures.

After tests pass, run the linter: `pnpm lint` (or `npm run lint` if the project does not use pnpm). Zero errors required. Lint errors are not warnings — they are failures. Do not report back or invoke reviewers until both the test suite and the linter are clean.

---

## When to use testcontainers vs factories

This is the most important boundary in the test suite:

- **Code that directly calls the database** (repositories, query functions, raw SQL) → **integration tests with testcontainers**. Mock nothing. Use a real PostgreSQL container and run real queries.
- **Everything else** (services, domain logic, handlers, utilities) → **unit tests with factories**. No database, no container. Factories build plain in-memory objects.

Do not mock Prisma in unit tests — if the code under test calls Prisma directly, that code belongs in a repository, and the repository gets an integration test. Service-layer code should receive plain objects from its dependencies; those dependencies are what gets tested separately with testcontainers.

> **Rationalization to reject:** "Setting up a container is complex, I'll just mock Prisma." — A Prisma mock cannot catch schema mismatches, constraint violations, or query bugs. It tests nothing real. Use the real database.

---

## Integration tests with testcontainers + Prisma

Install: `npm install --save-dev @testcontainers/postgresql testcontainers`

### Container and connection lifecycle

The container starts **once per test file** in `beforeAll` and is torn down in `afterAll`. This avoids per-test cold-start cost (~2–5 s).

```ts
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

let container: StartedPostgreSqlContainer
let prisma: PrismaClient

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()

  // Run migrations against the fresh container DB
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
  })

  prisma = new PrismaClient({ datasources: { db: { url } } })
  await prisma.$connect()
}, 60_000) // allow time for image pull on first run

afterAll(async () => {
  await prisma.$disconnect()
  await container.stop()
})
```

### Test isolation — transaction rollback per test

Each test runs inside a Prisma interactive transaction that is **never committed**. A `reject` function is captured in `beforeEach` and called in `afterEach` to force the rollback. This means every test starts with a clean database and no `TRUNCATE` statements are needed.

All queries within a test **must use `tx`**, not the global `prisma` instance.

```ts
import type { Prisma } from '@prisma/client'

let tx: Prisma.TransactionClient
let rollback: (err: Error) => void

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    rollback = reject
    prisma.$transaction(async (t) => {
      tx = t
      resolve()             // unblock the test
      await new Promise<never>(() => {}) // keep transaction open
    }).catch(() => {})      // swallow the intentional rejection
  })
})

afterEach(() => {
  rollback(new Error('rollback')) // triggers Prisma to roll back
})
```

### Factories in integration tests

Use the same `xFactory.build()` factories from `test_utils/factories/` to create plain objects. Then insert them via `tx` with a thin `create` helper defined in the test file or a shared `test_utils/db.ts`:

```ts
async function createUser(overrides: Partial<User> = {}) {
  const data = userFactory.build(overrides)
  return tx.user.create({ data })
}
```

This keeps factories free of database concerns. The factory owns "what a valid object looks like"; the `create` helper owns "how to insert it."

### Example integration test

```ts
describe('findUserByEmail', () => {
  it('returns the user when found', async () => {
    await createUser({ email: 'alice@example.com' })
    const result = await findUserByEmail(tx, 'alice@example.com')
    expect(result?.email).toBe('alice@example.com')
  })

  it('returns null when not found', async () => {
    const result = await findUserByEmail(tx, 'nobody@example.com')
    expect(result).toBeNull()
  })
})
```

---

## Universal rules

- **Test behaviour, not implementation.** A test must survive an internal refactor as long as the external contract is unchanged.
- **One concept per `it`.** Multiple assertions are fine if they verify the same logical outcome. Independent cases (e.g. three different discount tiers) belong in separate tests or `it.each` — not combined in one `it`.
- **Tests must be hermetic.** No shared mutable state. No dependency on run order. Every test owns its data.
- **No logic in tests.** No conditionals, loops, or try/catch. If you need logic to build the expected value, the test is too complex.
- **Name the scenario and outcome:** `returns false when order is shipped`, `throws when items list is empty`.

---

## Factories

Every domain type has a factory. Factories live in `test_utils/factories/` and are the **only** place that knows how to build a valid object of that type.

**Always use `randomUUID()` for IDs and unique fields.** Static IDs like `'user-1'` cause hidden coupling — two factory calls return objects that share an ID, which can make unrelated tests interfere with each other.

**BaseFactory** — define once in `test_utils/factories/base.ts`:

```ts
export abstract class BaseFactory<T> {
  abstract build(overrides?: Partial<T>): T

  buildList(count: number, overrides?: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.build(overrides))
  }
}
```

**Domain factory** — one file per type in `test_utils/factories/`, spread overrides last:

```ts
import { randomUUID } from 'crypto'
import { BaseFactory } from './base'
import type { User } from '../../src/types'

class UserFactory extends BaseFactory<User> {
  build(overrides: Partial<User> = {}): User {
    return {
      id: randomUUID(),
      name: 'Test User',
      email: `test-${randomUUID()}@example.com`,
      isAdmin: false,
      tier: 'free',
      ...overrides,
    }
  }

  // Named variant for a meaningfully different object — no conditionals in build()
  admin(overrides: Partial<User> = {}): User {
    return this.build({ isAdmin: true, ...overrides })
  }
}

export const userFactory = new UserFactory()
```

**Usage:**

```ts
// Good — unique IDs, independent objects
const user = userFactory.build()
const admin = userFactory.admin()
const users = userFactory.buildList(3)

// Bad — inline object breaks when schema changes
const user = { id: 'user-1', name: 'Alice', ... }

// Bad — static IDs cause hidden inter-test coupling
function makeUser() { return { id: 'user-1', ... } }
```

---

## Mocking with vi.fn / vi.mock

Mock **at module boundaries only**: external services, database clients, HTTP clients, filesystem. Do not mock functions within the module under test.

- Prefer **dependency injection** over `vi.mock` — pass the dependency as a parameter when possible.
- Create `vi.fn()` mocks **inside each `it` block**, not at module or `describe` scope. This keeps call counts clean without needing `vi.clearAllMocks()`.

```ts
// Good — fresh mock per test, isolated call state
it('calls notifyFn with the correct args', async () => {
  const notify = vi.fn().mockResolvedValue(undefined)
  await processOrder(order, notify)
  expect(notify).toHaveBeenCalledWith('user-7', 'Order order-42 confirmed')
})

// Bad — shared mock leaks call count across tests
const notify = vi.fn()
describe('processOrder', () => {
  it('calls notify', async () => { ... }) // notify.mock.calls includes prior test's calls
})
```

---

## Async tests

Always `await` async calls. Never use `done` callbacks.

```ts
// Good
it('throws on empty items', async () => {
  await expect(processOrder(emptyOrder, notify)).rejects.toThrow('Order must have at least one item')
})

// Bad — missing await; test always passes silently
it('throws on empty items', () => {
  expect(processOrder(emptyOrder, notify)).rejects.toThrow(...)
})
```

---

## Table-driven tests with it.each

Use `it.each` instead of copy-pasting near-identical tests. This is the right tool when only the input values differ.

```ts
it.each([
  ['free',       100, 100],
  ['pro',        100,  90],
  ['enterprise', 100,  80],
] as const)('applies correct discount for %s tier', (tier, input, expected) => {
  const user = userFactory.build({ tier })
  expect(applyDiscount(input, user)).toBe(expected)
})
```

Use separate `it` blocks when the scenario description or assertion structure differs meaningfully between cases.

---

## describe structure

Mirror your `describe` nesting to the branching logic of the code under test:

```ts
describe('canCancelOrder', () => {
  describe('when order is shipped', () => {
    it('returns false for the owner', () => { ... })
    it('returns false even for an admin', () => { ... })
  })
  describe('when order is pending', () => {
    it('returns true for the owner', () => { ... })
    it('returns true for an admin', () => { ... })
    it('returns false for a non-owner non-admin', () => { ... })
  })
})
```

---

## React component tests

Use React Testing Library. Query by accessible role, label, or visible text. Never use `getByTestId` or inspect internal state.

```ts
// Good
expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()

// Bad
expect(wrapper.instance().state.isLoading).toBe(true)
```

---

## Coverage

Do not chase coverage numbers. 100% coverage with behaviour-free tests is worthless. Aim for tests that would catch real regressions.
