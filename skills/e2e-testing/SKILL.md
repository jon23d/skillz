---
name: e2e-testing
description: Use when writing, running, or evaluating end-to-end tests for user-facing behaviour — covering test scope decisions, page objects, selectors, authentication, API contract tests, and failure reporting.
---

# End-to-End Testing

## When to write E2E tests

Write E2E tests when a task:
- Adds or modifies an API endpoint (test the HTTP contract)
- Adds or modifies a UI flow involving user interaction
- Changes authentication or authorisation behaviour
- Modifies a multi-step workflow (checkout, onboarding, form submission)

Skip E2E tests when the task:
- Is a pure refactor with no behaviour change
- Changes only internal logic with no externally observable effect
- Is a config-only change

When in doubt, write the test. A missing E2E test is caught late.

## Framework

This project uses Playwright as the E2E framework. If no Playwright configuration exists, set it up before writing tests — see `playwright.config.ts` in the project root or `e2e/` directory.

If the project uses a different E2E framework, follow its conventions rather than these Playwright-specific examples.

## Test structure

Group tests by feature area. Each test covers a complete user flow.

```typescript
import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test('logs in with valid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/dashboard/)
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Invalid email or password')).toBeVisible()
  })
})
```

## Page objects

Encapsulate page-specific selectors and actions in page objects. One page object per page or major component.

- Locators use accessible queries: `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`
- Methods represent user actions (`login(email, password)`), not DOM interactions (`fillEmailInput(email)`)
- Page objects never contain assertions — assertions live in the test

## Selectors: accessibility first

Query elements the way a user finds them:
1. `getByRole('button', { name: 'Submit' })` — role + accessible name
2. `getByLabel('Email address')` — form inputs by label
3. `getByText('Welcome back')` — visible text content
4. `getByPlaceholder('Search...')` — placeholder (less stable)

Avoid CSS class selectors and `data-testid` attributes unless there is no accessible alternative. If no accessible selector exists, it usually means the UI has an accessibility gap — fix the UI first.

## Authentication

Most tests need an authenticated user. Authenticate via API to avoid repeating the login UI flow in every test. Create a shared auth fixture that:
1. Posts credentials to the auth endpoint
2. Sets the resulting session cookie or token on the page context
3. Is imported by tests that need authentication

Use seed data credentials documented in the project README (see `testing-best-practices` skill).

## API endpoint tests

For tasks that add or modify API endpoints, test the HTTP contract using the test framework's request context (no browser needed):

```typescript
test('POST /api/users returns 201', async ({ request }) => {
  const response = await request.post('/api/users', {
    data: { email: `test-${Date.now()}@example.com`, name: 'Test User' },
  })
  expect(response.status()).toBe(201)
  const body = await response.json()
  expect(body).toHaveProperty('id')
})
```

For each endpoint, test:
- Happy path (correct status code and response shape)
- Validation error (400 with field-level errors)
- Auth boundaries (401 unauthenticated, 403 unauthorized)
- Relevant conflict cases (409 duplicate, etc.)

## Waiting and timing

Never use hard waits (`waitForTimeout`). Use the framework's built-in auto-waiting:
- `await expect(locator).toBeVisible()` — waits for element to appear
- `await page.waitForURL(/pattern/)` — waits for navigation
- `await page.waitForResponse(url)` — waits for a network request

If a test is flaky, the fix is better waiting logic, not hard waits.

## Running tests

Check `package.json` for an E2E test script (commonly `test:e2e`). If none exists, check for a Playwright config file and run `playwright test` directly via the project's package manager.

## Passing criteria

- All tests pass with exit code 0
- No tests are skipped without a documented reason
- No flaky retries masking real failures — if a test required retries to pass, note it

## Reporting failures

For each failing test, capture:
- Test name and file path
- Failure message and the assertion that failed
- Any screenshot or trace output from the framework

Do not attempt to fix failing tests — report them precisely.
