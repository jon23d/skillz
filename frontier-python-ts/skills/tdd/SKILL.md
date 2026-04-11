---
name: tdd
description: Use when writing any code — functions, modules, APIs, UI components, scripts, or any other implementation. Use when asked to "implement", "build", "write", "add", "create", or "refactor" anything that involves code. Covers the universal red-green-refactor discipline plus stack-specific testing patterns for the Python (FastAPI + SQLAlchemy) backend and the Vite + React + TypeScript frontend in this harness.
---

# TDD — Test-Driven Development

Write the test first. Run it. Watch it fail. Then write the code.

## The sequence — no skipping, no combining steps

**Step 1 — Write the test file only.** The implementation file must not exist. Write tests that describe the required behaviour from the outside.

**Step 2 — Run the tests and show the failure output.** Do not proceed until you have run the test command and shown the failure.

**Step 3 — Write the minimum implementation to make the tests pass.**

**Step 4 — Run the tests again and show them passing.**

**Step 5 — Refactor if needed, keeping tests green.**

Writing tests and implementation in the same step is not tdd.

## Running tests — universal rule

Run every test that CI will run — locally, before reporting back. No test suite is "CI only." That includes unit tests, integration tests, type checking, and linting. Zero errors required across all of them.

| Stack | The full set |
|---|---|
| **Backend (Python)** | `uv run ruff format --check .` · `uv run ruff check .` · `uv run mypy app` · `uv run pytest` |
| **Frontend (TS)** | `pnpm format:check` · `pnpm lint` · `pnpm test` · `pnpm build` (which runs `tsc -b`) |

Once everything is clean, invoke `@reviewer`. It will run `git diff main...HEAD` to determine what changed. If it returns `"fail"`, resolve all `critical` and `major` issues and re-invoke before continuing. Do not report back until the reviewer returns `"pass"` or `"pass_with_issues"` with no critical or major issues.

---

## Bug fixes — both stacks

**Step 1 — Write a regression test that exposes the bug.** The test fails with an assertion error (wrong output), not "module not found" / "ImportError".

**Step 2 — Run and show the failure.**

**Step 3 — Fix the code.**

**Step 4 — Run and show all tests passing.**

## Adding features to existing files

**Step 1 — Write tests for the new feature only.** Existing code stays untouched.

**Step 2 — Run: existing pass, new tests fail.**

**Step 3 — Add minimum implementation.**

**Step 4 — Run all tests: all pass.**

## Refactoring — new structure means new tests

**The rule: if you create it, you test it.** A new class extracted from an existing function is new code. It does not matter that the logic existed before — the unit is new.

1. Run existing tests — must pass (safety net)
2. Perform the structural refactor
3. Run existing tests — must still pass
4. Identify every new public interface
5. For each new unit, apply the standard tdd sequence
6. Run all tests — existing and new must pass

"Existing tests pass" is Step 3. It is not Step 6.

---

# Backend — Python (pytest + pytest-asyncio + testcontainers)

The backend test stack:

| Tool | Purpose |
|---|---|
| `pytest` | Test runner |
| `pytest-asyncio` | `async def` test functions |
| `httpx` (`AsyncClient` + `ASGITransport`) | Calling FastAPI without uvicorn |
| `testcontainers` (Python) | Real Postgres for integration tests |
| `respx` | Intercepting outbound `httpx` requests in tests of code that calls third-party APIs |

Install:

```bash
uv add --dev pytest pytest-asyncio httpx testcontainers respx
```

`pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "-ra -q --strict-markers"
```

`asyncio_mode = "auto"` means every `async def test_...` runs in an event loop without needing the `@pytest.mark.asyncio` decorator.

## When to use testcontainers vs respx vs plain unit tests

- **Code that directly calls the database** (services that take an `AsyncSession`, repository functions) → **integration tests with testcontainers**. Mock nothing. Use a real PostgreSQL container.
- **Code that calls a third-party HTTP API** (Stripe client, email provider, OAuth provider) → **integration tests with respx**. Intercept at the network layer.
- **Everything else** (Pydantic schemas, pure functions, validators, business logic that takes already-loaded data) → **unit tests with factories, no I/O**.

Do not mock SQLAlchemy in unit tests. If the code calls SQLAlchemy, it belongs in a service with an integration test against a real container.

Do not mock `httpx.AsyncClient` with `unittest.mock`. If the code makes HTTP requests, use `respx` to intercept them.

## Integration tests with testcontainers + SQLAlchemy

### Container lifecycle (once per session)

```python
# tests/conftest.py
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from alembic import command
from alembic.config import Config
from app.models.base import Base


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine", driver="asyncpg") as pg:
        yield pg


@pytest_asyncio.fixture(scope="session")
async def engine(postgres_container):
    url = postgres_container.get_connection_url()
    engine = create_async_engine(url, echo=False)

    # Run Alembic migrations against the container
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")

    yield engine
    await engine.dispose()
```

### Test isolation — transaction rollback per test

Each test runs inside a transaction that is *never committed*. After the test, the transaction rolls back, leaving the database in its starting state.

```python
@pytest_asyncio.fixture
async def db(engine) -> AsyncIterator[AsyncSession]:
    connection = await engine.connect()
    transaction = await connection.begin()
    session_maker = async_sessionmaker(bind=connection, expire_on_commit=False)
    session = session_maker()

    # Begin a SAVEPOINT so the test can call commit() without ending the outer txn.
    nested = await connection.begin_nested()

    @event.listens_for(session.sync_session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            nested = connection.sync_connection.begin_nested()

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()
```

Every test that touches the DB takes the `db` fixture. The fixture yields an `AsyncSession`; the test uses it directly and any commits inside the test are rolled back at the end.

### Overriding `get_db` for API tests

```python
@pytest_asyncio.fixture
async def client(db) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

Now any API test can write:

```python
async def test_create_user(client: AsyncClient, db: AsyncSession):
    response = await client.post("/api/v1/users", json={
        "email": "alice@example.com",
        "name": "Alice",
        "password": "x" * 12,
    })
    assert response.status_code == 201
    assert response.json()["email"] == "alice@example.com"
```

## Integration tests with respx

```python
import respx
import httpx
import pytest

from app.services.email_client import EmailClient


@respx.mock
async def test_email_client_sends():
    route = respx.post("https://api.email.example/send").mock(
        return_value=httpx.Response(200, json={"id": "msg_123"})
    )

    client = EmailClient(api_key="test")
    result = await client.send(to="a@b.test", subject="hi", body="hello")

    assert route.called
    assert result.message_id == "msg_123"


@respx.mock
async def test_email_client_handles_server_error():
    respx.post("https://api.email.example/send").mock(
        return_value=httpx.Response(500)
    )
    client = EmailClient(api_key="test")
    with pytest.raises(EmailClient.UpstreamError):
        await client.send(to="a@b.test", subject="hi", body="hello")
```

Rules:

- **`@respx.mock`** scopes the interception to the test. Never set up a global mock that other tests inherit.
- **Assert on the *outcome*, not the request shape** — unless the test is specifically about how the request is constructed.
- **`respx.routes` are LIFO** — later routes override earlier ones for the same URL pattern.
- **Use `httpx.Response`** — never return raw dicts.

## Factories

Every domain type has a factory in `tests/factories/`. **Never define factory functions inside a test file.**

```python
# tests/factories/user_factory.py
import uuid
from app.models.user import User


def build_user(**overrides) -> User:
    defaults = dict(
        id=str(uuid.uuid4()),
        tenant_id=str(uuid.uuid4()),
        email=f"user-{uuid.uuid4()}@example.test",
        name="Test User",
    )
    return User(**{**defaults, **overrides})


async def create_user(db, **overrides) -> User:
    user = build_user(**overrides)
    db.add(user)
    await db.flush()
    return user
```

`build_*` returns a model instance that has not been persisted. `create_*` persists it via the test session. Tests pick whichever they need.

Use plain functions, not classes — they are simpler and the DI in pytest fixtures handles everything `BaseFactory` would. (If a project already uses `factory-boy`, that is fine; do not introduce it where it does not exist.)

## Pytest universal rules

- **Test behaviour, not implementation.** A test must survive an internal refactor.
- **One concept per test.** Multiple assertions OK if they all pertain to the same outcome.
- **Tests must be hermetic.** No shared mutable state, no order dependence.
- **No logic in tests.** No conditionals, loops, or try/except inside the test body.
- **Name the scenario:** `test_returns_404_when_user_not_found`, not `test_get_user_2`.

---

# Frontend — TypeScript (Vitest + RTL + MSW)

The frontend test stack:

| Tool | Purpose |
|---|---|
| `vitest` | Test runner |
| `@testing-library/react` | Component rendering and queries |
| `@testing-library/user-event` | User interaction simulation |
| `@testing-library/jest-dom` | DOM assertion helpers |
| `msw` | HTTP request interception |

Install:

```bash
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom @vitest/ui jsdom msw
```

## When to use MSW vs factories

- **Code that calls the backend API** (services, hooks, components that use them) → **integration tests with MSW**. Mock nothing at the code level — MSW intercepts the network.
- **Pure components and utilities** (presentational components, formatters) → **unit tests with factories**, no MSW.

Do not mock the typed API client with `vi.fn()`. If the code makes HTTP requests, MSW intercepts them.

## MSW — server lifecycle (once per test file or once globally)

```ts
// src/test/setup.ts
import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll } from "vitest"
import { setupServer } from "msw/node"

export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

`onUnhandledRequest: "error"` makes any request without a handler fail the test — no silent network leaks.

## Define handlers per test

```ts
import { http, HttpResponse } from "msw"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { server } from "@/test/setup"
import { ProjectList } from "./ProjectList"

it("renders projects from the API", async () => {
  server.use(
    http.get("http://localhost:8000/api/v1/projects", () =>
      HttpResponse.json({
        items: [
          { id: "p1", name: "Apollo", created_at: "2026-01-01T00:00:00Z" },
          { id: "p2", name: "Borealis", created_at: "2026-01-02T00:00:00Z" },
        ],
        next_cursor: null,
      }),
    ),
  )

  render(<ProjectList />, { wrapper: TestProviders })

  expect(await screen.findByText("Apollo")).toBeInTheDocument()
  expect(screen.getByText("Borealis")).toBeInTheDocument()
})
```

Wrap components that use TanStack Query in a `TestProviders` helper that creates a fresh `QueryClient` per test:

```tsx
// src/test/providers.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

export function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

`retry: false` is critical — without it, every error test waits for three retries before failing.

## Error and edge-case scenarios

```ts
it("shows an error when the server returns 500", async () => {
  server.use(
    http.get("http://localhost:8000/api/v1/projects", () =>
      HttpResponse.json({ error: "internal" }, { status: 500 }),
    ),
  )

  render(<ProjectList />, { wrapper: TestProviders })

  expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
})
```

## React component test rules

- Query by accessible role, label, or visible text. **Never `getByTestId`.**
- Use `userEvent` (not `fireEvent`) for interactions.
- Test the three data states for any component that fetches: **loading**, **error**, **success**.
- A component test that does not exercise the loading and error states is incomplete.

## Factories (frontend)

```ts
// src/test/factories/projectFactory.ts
import type { components } from "@/api/generated"
import { randomUUID } from "node:crypto"

type Project = components["schemas"]["Project"]

export function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: randomUUID(),
    name: "Test Project",
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
```

Types come from the generated client — never hand-write a `Project` type in a factory.

## Universal frontend test rules

- **One `setupServer()` per test session** (in `setup.ts`). Do not create per-file instances.
- **`onUnhandledRequest: "error"`** is non-negotiable.
- **Define handlers in tests, not in shared fixture files.** Exception: a shared `handlers.ts` for a happy-path baseline that every test overrides via `server.use()`.
- **Do not assert on request details** unless the test is about how the request is formed.

---

## E2e tests — default answer is no

This applies to both stacks. E2e is browser-against-real-backend, run from the frontend repo (Playwright). See the `playwright-e2e` skill for the gate.

If the project has API endpoint tests (backend) **and** RTL+MSW component tests (frontend), the existing layers already cover the seams e2e is meant to catch. Do not add e2e tests by default.

Before writing any e2e test, answer: does this scenario require a real browser against a real backend, and would it be caught by nothing lower in the stack?

**Legitimate e2e scenarios:**
- Critical user paths where failure would be a significant incident (login, checkout, the core paid flow) — one test per path, happy path only
- Browser behaviours MSW cannot intercept: OAuth redirects, cookie/session mechanics, file downloads, clipboard, drag-and-drop
- Documented regression traps: a specific bug that has burned the team and that lower-level tests demonstrably failed to catch

**Not legitimate:**
- Form validation and inline errors (use RTL + zod schema)
- Loading and error states (use RTL + MSW)
- Page or route "coverage"
- Anything fully describable with a mocked API response

---

## Coverage

Do not chase numbers. Aim for tests that would catch real regressions.

## Implementation ordering

This skill governs the red-green-refactor mechanics within a single test cycle. When a task involves multiple collaborating modules or services, also load the `outside-in-double-loop` skill — it governs the order in which you build those modules.

## Red flags — stop and reassess

- About to write an implementation file without a failing test
- Wrote both files without running the test in between
- Showing passing tests without first showing failing ones
- Created new classes/functions in a refactor but wrote zero new tests
- About to mock SQLAlchemy in a unit test instead of using testcontainers
- About to mock `httpx` in a Python test instead of using respx
- About to mock the typed API client in a frontend test instead of using MSW
- About to write an e2e test when endpoint tests + RTL/MSW component tests exist and the scenario does not require a real browser
- Wrote e2e tests but planning to skip running them ("CI only")
- All tests pass but about to report back without invoking `@reviewer`

## Rationalisations — and the responses

- **"It's too simple"** → Simple things break. Write it.
- **"I'll add tests after"** → Tests after prove what code does, not what it should do.
- **"Setting up a Postgres container is complex"** → A SQLAlchemy mock tests nothing real. testcontainers is one fixture and ~10 seconds at session start.
- **"I'll just mock httpx, it's simpler"** → A mock tests your mock, not your HTTP integration. respx intercepts real requests.
- **"E2e gives us confidence the whole thing works"** → Endpoint tests prove the API contract. RTL+MSW proves the UI against that contract. E2e proves the wiring — which is a small gap when both layers exist. Write to the gap, not for confidence.
- **"E2e tests need CI"** → Every test CI runs, you run first. Install the headless browser, start the app, run them.
