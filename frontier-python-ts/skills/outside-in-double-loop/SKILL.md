---
name: outside-in-double-loop
description: Use when implementing any feature that requires multiple collaborating modules, services, or classes. Use when a task involves dependencies that do not yet exist. Use alongside the tdd skill.
---

# Outside-In Double Loop

Start from the user-facing surface. Stub everything behind it. Get the test green. Then build the stubs for real — one at a time, each with its own test-first cycle.

This skill governs **implementation ordering**. The `tdd` skill governs the red-green-refactor mechanics within each cycle. Both apply simultaneously.

## The two loops

**Outer loop** — the user-facing contract (endpoint, CLI command, UI interaction). Write a test for what the user sees. Every dependency behind it is a stub. Get this test green. The codebase is now in a passing state and the contract is locked.

**Inner loop** — one deferred dependency at a time. Pick the next item from the task queue. Write a test for it. Stub *its* dependencies. Get the test green. Repeat until the queue is empty.

## The sequence

**Step 1 — Write the outer test.**
The test describes user-facing behavior: given this request, expect this response. Every collaborator is a mock — `MagicMock`/`AsyncMock` on the Python side, `vi.fn()` on the TypeScript side. Do not create interface files, protocol files, or "vocabulary" files yet. Let the test drive what types you need. Define stub shapes inline in the test file.

**Step 2 — Run the test. Watch it fail.**
The failure is typically "module not found" or "function not found." This is correct.

**Step 3 — Write the minimum to make the outer test pass.**
Create the implementation file (e.g., the route handler). Create interfaces or types *only as the implementation file demands them to compile*. Do not pre-define interfaces for dependencies you haven't reached yet.

**Step 4 — Run the test. Watch it pass.**
The outer loop is now green. Every dependency is a stub. The codebase is in a passing state.

**Step 5 — Record deferred tasks.**
For every dependency you stubbed, add an entry to the task queue. Write the queue as a comment block at the top of the file you are currently working in, or in your task tracking tool:

```
// Task queue:
// - [ ] TenantService (stubbed in acceptance test)
// - [ ] CustomerService (stubbed in acceptance test)
// - [ ] TaxService (stubbed in acceptance test)
// - [ ] InvoiceRepository (stubbed in acceptance test)
// - [ ] AuditService (stubbed in acceptance test)
```

**Step 6 — Pop the queue. Start an inner loop.**
Pick the next dependency. Write a test for it. If *it* has dependencies that don't exist, stub them and add new entries to the queue. Get the test green. Mark the item done. Repeat.

**Step 7 — Stop when the queue is empty.**
Do not add work that was not driven by a stub. If no test stubs a dependency, that dependency does not need to exist.

## Rules

**Do not pre-define interfaces for dependencies you have not yet reached.**
Interfaces emerge from the test that needs them. When the outer test needs a `UserService` stub, define the stub shape inline. When you write the implementation file and need a typed parameter, *then* extract the interface — not before.

- "I'll define all the interfaces first — it's just design" → It's speculation. You are guessing at contracts before any test has forced them. Let the tests drive the shapes.

**Do not build a dependency before its consumer's test is green.**
When writing `TaxService` and you realize it needs a `TaxRateProvider`, do not go build `TaxRateProvider`. Stub it. Get `TaxService` green. Add `TaxRateProvider` to the queue. Build it later.

- "I'll build the leaf first since the parent depends on it" → The parent's *test* does not depend on the real leaf. It depends on a stub. Build outside-in, not inside-out.

**Maintain an explicit task queue.**
Do not rely on memory. Write it down. Cross items off as you complete them.

- "I'll just remember what to build next" → You won't, especially not at depth 3 with 10+ dependencies. Write the queue.

**Do not expand scope beyond what stubs require.**
If the outer test passes with stubs and no inner implementation is needed for the task to be complete, stop. Do not write integration tests, real implementations, or "nice-to-haves" unless the task explicitly requires them.

- "I'll add an integration test to prove it all works together" → Only if the acceptance criteria say so. Unrequested work is scope creep.

**One file at a time. Finish before switching.**
Do not open a new file until the current file's test is green. If you discover a new dependency while implementing, stub it, add it to the queue, and keep working on the current file.

## Example — outer loop (FastAPI route)

You are adding `POST /api/v1/invoices` to the backend. The outer test hits the real FastAPI app via `httpx.AsyncClient + ASGITransport`, but every service the route depends on is stubbed:

```python
# apps/api/tests/api/test_invoices.py
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.services import invoice_service  # does not exist yet — the test forces us to create it


@pytest.mark.asyncio
async def test_create_invoice_returns_201_with_invoice_number(monkeypatch, auth_headers):
    # Stub the service the route will call; shape is defined by the test.
    fake_create = AsyncMock(return_value={"id": "inv_1", "number": "INV-00001", "total_cents": 9900})
    monkeypatch.setattr(invoice_service, "create_invoice", fake_create)

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/invoices",
            json={"customer_id": "cus_1", "line_items": [{"sku": "A", "quantity": 1, "price_cents": 9900}]},
            headers=auth_headers,
        )

    assert response.status_code == 201
    assert response.json()["number"] == "INV-00001"
    fake_create.assert_awaited_once()
```

Run the test. It fails with `ImportError: cannot import name 'invoice_service'`. Good. Create `app/services/invoice_service.py` with a minimal `create_invoice` stub, create `app/api/v1/invoices.py` with the route that calls it, wire the router in `app/main.py`. Run the test again. Green. The outer loop is done.

Update the queue:

```
# Task queue:
# - [x] POST /api/v1/invoices route
# - [ ] invoice_service.create_invoice (stubbed in acceptance test)
# - [ ] InvoiceRepository (will be stubbed by invoice_service test)
# - [ ] TaxService (will be stubbed by invoice_service test)
```

## Example — inner loop with nested dependencies

You pop `invoice_service.create_invoice`. Its test stubs the repository and the tax service:

```python
# apps/api/tests/services/test_invoice_service.py
from unittest.mock import AsyncMock

import pytest

from app.services.invoice_service import create_invoice


@pytest.mark.asyncio
async def test_create_invoice_uses_tax_rate_and_persists():
    repo = AsyncMock()
    repo.next_number = AsyncMock(return_value="INV-00001")
    repo.save = AsyncMock()
    tax = AsyncMock()
    tax.rate_for = AsyncMock(return_value=0.20)

    result = await create_invoice(
        repo=repo,
        tax=tax,
        customer_id="cus_1",
        line_items=[{"sku": "A", "quantity": 1, "price_cents": 10000}],
    )

    assert result["number"] == "INV-00001"
    assert result["total_cents"] == 12000  # 10000 + 20% tax
    repo.save.assert_awaited_once()
```

`invoice_service.create_invoice` test goes green. Update the queue:

```
# Task queue:
# - [x] POST /api/v1/invoices route
# - [x] invoice_service.create_invoice
# - [ ] InvoiceRepository.next_number / save  <-- newly added
# - [ ] TaxService.rate_for                   <-- newly added
```

Pop `InvoiceRepository`. Write its test against a real `testcontainers` Postgres (see the `tdd` skill — this is the boundary where real dependencies appear). No further stubs — it's at the leaf. Green. Mark done. Continue.

## Red flags — stop and reassess

- You are about to create a file for a dependency before the consumer's test is green
- You are defining interfaces for modules you have not started testing yet
- You have no written task queue and are relying on memory
- You are writing code that no stub or test demanded
- You are switching files before the current test is green
- You are thinking "I'll just quickly build this dependency first"

## Checklist per task

- [ ] Outer test written with all dependencies stubbed (inline, not pre-defined interfaces)
- [ ] Outer test ran and failed
- [ ] Implementation written; interfaces extracted only as needed to compile
- [ ] Outer test ran and passed
- [ ] Task queue written with all stubbed dependencies
- [ ] Each inner loop: test written, stubs for its dependencies, test green, queue updated
- [ ] Queue empty — done
