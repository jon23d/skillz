---
name: tdd
description: Use when writing any code — functions, modules, APIs, UI components, scripts, or any other implementation. Use when asked to "implement", "build", "write", "add", "create", or "refactor" anything that involves code. Also covers TypeScript/Vitest testing patterns, factories, mocking, and integration tests with testcontainers.
---

# TDD — Test-Driven Development

Write the test first. Run it. Watch it fail. Then write the code.

## The sequence — no skipping, no combining steps

**Step 1 — Write the test file only.** The implementation file must not exist. Write tests that describe the required behavior from the outside.

**Step 2 — Run the tests and show the failure output.** Do not proceed until you have run the test command and shown the failure.

**Step 3 — Write the minimum implementation to make the tests pass.**

**Step 4 — Run the tests again and show them passing.**

**Step 5 — Refactor if needed, keeping tests green.**

Writing tests and implementation in the same step is not tdd.

## Running tests

Run every test that CI will run — locally, before reporting back. No test suite is "CI only." This includes unit tests (`npx vitest run`), integration tests, type checking, and linting (`pnpm lint` or `npm run lint`). If the project has e2e tests, run them too. Zero errors required across all of them.

Once everything is clean, invoke `@reviewer`. It will run `git diff main...HEAD` to determine what changed. If it returns `"fail"`, resolve all `critical` and `major` issues and re-invoke before continuing. Do not report back until the reviewer returns `"pass"` or `"pass_with_issues"` with no critical or major issues.

---

## Bug fixes

**Step 1 — Write a regression test that exposes the bug.** The test fails with an assertion error (wrong output), not "module not found".

**Step 2 — Run and show the failure.**

**Step 3 — Fix the code.**

**Step 4 — Run and show all tests passing.**

## Adding features to existing files

**Step 1 — Write tests for the new feature only.** Existing code stays untouched.

**Step 2 — Run: existing pass, new tests fail.**

**Step 3 — Add minimum implementation.**

**Step 4 — Run all tests: all pass.**

## Refactoring — new structure means new tests

**The rule: if you create it, you test it.** A new class extracted from an existing function is new code. It doesn't matter that the logic existed before — the unit is new.

1. Run existing tests — must pass (safety net)
2. Perform the structural refactor
3. Run existing tests — must still pass
4. Identify every new public interface
5. For each new unit, apply the standard tdd sequence
6. Run all tests — existing and new must pass

"Existing tests pass" is Step 3. It is not Step 6.

---

## When to use testcontainers vs MSW vs factories

- **Code that directly calls the database** (repositories, query functions) → **integration tests with testcontainers**. Mock nothing. Use a real PostgreSQL container.
- **Code that directly calls HTTP APIs** (API clients, services that call `fetch`, TanStack Query hooks) → **integration tests with MSW**. Mock nothing at the code level — MSW intercepts the network.
- **Everything else** (domain logic, handlers, utilities) → **unit tests with factories**.

Do not mock Prisma in unit tests — if the code calls Prisma, it belongs in a repository with an integration test.
Do not mock `fetch` or stub HTTP clients with `vi.fn()` — if the code makes HTTP requests, use MSW to intercept them at the network level.

---

## Integration tests with testcontainers + Prisma

Install: `npm install --save-dev @testcontainers/postgresql testcontainers`

### Container lifecycle (once per test file)

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

let container: StartedPostgreSqlContainer
let prisma: PrismaClient

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url } })
  prisma = new PrismaClient({ datasources: { db: { url } } })
  await prisma.$connect()
}, 60_000)

afterAll(async () => {
  await prisma.$disconnect()
  await container.stop()
})
```

### Test isolation — transaction rollback per test

Each test runs inside an interactive transaction that is never committed:

```ts
let tx: Prisma.TransactionClient
let rollback: (err: Error) => void

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    rollback = reject
    prisma.$transaction(async (t) => {
      tx = t
      resolve()
      await new Promise<never>(() => {})
    }).catch(() => {})
  })
})

afterEach(() => {
  rollback(new Error('rollback'))
})
```

All queries within a test **must use `tx`**, not the global `prisma`.

---

## Integration tests with MSW

Install: `npm install --save-dev msw`

### Server lifecycle (once per test file)

```ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

`onUnhandledRequest: 'error'` makes any request without a handler fail the test — no silent network leaks.

### Define handlers per test

Define handlers inside each test (or `beforeEach` for a shared happy path). Keep handlers close to the assertions that depend on them:

```ts
it('returns the user profile', async () => {
  server.use(
    http.get('https://api.example.com/users/:id', ({ params }) => {
      return HttpResponse.json({
        id: params.id,
        name: 'Jane Doe',
        email: 'jane@example.com',
      })
    }),
  )

  const profile = await userService.getProfile('user-1')

  expect(profile).toEqual({
    id: 'user-1',
    name: 'Jane Doe',
    email: 'jane@example.com',
  })
})
```

### Error and edge-case scenarios

Use `server.use()` to override the happy path for individual tests:

```ts
it('throws on server error', async () => {
  server.use(
    http.get('https://api.example.com/users/:id', () => {
      return new HttpResponse(null, { status: 500 })
    }),
  )

  await expect(userService.getProfile('user-1')).rejects.toThrow('Server error')
})

it('handles network failure', async () => {
  server.use(
    http.get('https://api.example.com/users/:id', () => {
      return HttpResponse.error()
    }),
  )

  await expect(userService.getProfile('user-1')).rejects.toThrow()
})
```

### Rules

- **One `setupServer()` per test file.** Do not share server instances across files.
- **`onUnhandledRequest: 'error'`** is non-negotiable. Silent passthrough hides real bugs.
- **Define handlers in tests, not in shared fixture files.** The test must be readable without jumping to another file. Exception: a shared `handlers.ts` for a large API surface where every test uses the same happy path — but per-test overrides via `server.use()` still go in the test.
- **Do not assert on request details** (headers, body) unless the test is specifically about how the request is formed. Test the *outcome* (what your code does with the response), not the *request*.
- **Use `HttpResponse.json()`, `HttpResponse.text()`, or `new HttpResponse()`** — never return plain objects.

---

## Factories

Every domain type has a factory in `test_utils/factories/`. **Never define factory functions inside a test file.** Always use `randomUUID()` for IDs.

**BaseFactory:**
```ts
export abstract class BaseFactory<T> {
  abstract build(overrides?: Partial<T>): T
  buildList(count: number, overrides?: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.build(overrides))
  }
}
```

**Domain factory:**
```ts
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
  admin(overrides: Partial<User> = {}): User {
    return this.build({ isAdmin: true, ...overrides })
  }
}
export const userFactory = new UserFactory()
```

For integration tests, use a thin `create` helper that inserts via `tx`:
```ts
async function createUser(overrides: Partial<User> = {}) {
  return tx.user.create({ data: userFactory.build(overrides) })
}
```

---

## Universal test rules

- **Test behaviour, not implementation.** A test must survive an internal refactor.
- **One concept per `it`.** Multiple assertions OK if same logical outcome.
- **Tests must be hermetic.** No shared mutable state, no run-order dependency.
- **No logic in tests.** No conditionals, loops, or try/catch.
- **Name the scenario and outcome:** `returns false when order is shipped`.

## Mocking with vi.fn / vi.mock

Mock at module boundaries only: external services, database clients, filesystem. Prefer dependency injection over `vi.mock`. Create `vi.fn()` mocks inside each `it` block. For HTTP APIs, use MSW instead of `vi.fn()` — see the MSW section above.

## Async tests

Always `await` async calls. Never use `done` callbacks.

## Table-driven tests

```ts
it.each([
  ['free', 100, 100],
  ['pro', 100, 90],
  ['enterprise', 100, 80],
] as const)('applies correct discount for %s tier', (tier, input, expected) => {
  const user = userFactory.build({ tier })
  expect(applyDiscount(input, user)).toBe(expected)
})
```

## React component tests

Use React Testing Library. Query by accessible role, label, or visible text. Never `getByTestId`. Use `userEvent` (not `fireEvent`). Test all three data states: loading, error, success.

## E2e tests — default answer is no

If the project has **both** API endpoint tests and RTL+MSW component tests, the existing layers already cover the seams e2e is meant to catch. Do not add e2e tests by default.

Before writing any e2e test, answer: does this scenario require a real browser against a real backend, and would it be caught by nothing lower in the stack?

**Legitimate e2e scenarios:**
- Critical user paths where failure would be a significant incident (login, checkout, the core paid flow) — one test per path, happy path only
- Browser behaviors MSW cannot intercept: OAuth redirects, cookie/session mechanics, file downloads, clipboard, drag-and-drop, the file picker
- Documented regression traps: a specific bug that has burned the team and that lower-level tests demonstrably failed to catch

**Not legitimate — use RTL+MSW or endpoint tests instead:**
- Form validation and inline error messages
- Loading and error states
- Page or route "coverage"
- Happy-path duplication of what the endpoint tests already prove
- Any scenario that can be fully described with a mocked API response

If none of the legitimate cases apply, do not write the e2e test. Write or improve the RTL or endpoint test instead.

## Coverage

Do not chase numbers. Aim for tests that would catch real regressions.

---

## Implementation ordering

This skill governs the red-green-refactor mechanics within a single test cycle. When a task involves multiple collaborating modules or services, also load the `outside-in-double-loop` skill — it governs the order in which you build those modules (outer test first, stub dependencies, then build each stub via its own tdd cycle).

## Red flags — stop and reassess

- About to write an implementation file without a failing test
- Wrote both files without running the test in between
- Showing passing tests without first showing failing ones
- Created new classes/functions in a refactor but wrote zero new tests
- About to mock Prisma instead of using testcontainers
- About to mock `fetch` or stub an HTTP client with `vi.fn()` instead of using MSW
- About to write an e2e test when endpoint tests + RTL/MSW component tests exist and the scenario doesn't require a real browser or has no documented history of slipping through lower layers
- Wrote e2e tests but planning to skip running them ("CI only")
- All tests pass but about to report back without invoking `@reviewer`

## Rationalizations — and the responses

- **"It's too simple"** → Simple things break. Write it.
- **"I'll add tests after"** → Tests after prove what code does, not what it should do.
- **"We're in a hurry"** → Code without tests creates more delays.
- **"Setting up a container is complex"** → A Prisma mock tests nothing real.
- **"I'll just mock fetch, it's simpler"** → A fetch mock tests your mock, not your HTTP integration. MSW intercepts real requests.
- **"Existing tests cover the extracted code"** → They cover it through the old structure. New units need direct tests.
- **"E2E gives us confidence the whole thing works"** → Endpoint tests prove the API contract. RTL+MSW proves the UI against that contract. E2e proves the wiring — which is a small gap when both layers exist. Write to the gap, not for confidence.
- **"It's easier to just write a Playwright test"** → Easier is the wrong reason. An e2e test that duplicates what RTL covers adds maintenance cost and flakiness without adding signal.
- **"E2E tests need CI / a special environment"** → Every test CI runs, you run first. Install a headless browser, start the DB, run them.
