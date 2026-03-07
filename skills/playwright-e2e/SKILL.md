---
name: playwright-e2e
description: Use when writing end-to-end tests with Playwright, adding a new test file, setting up Playwright in a project, or testing user flows in a web app.
---

# Playwright E2E Testing

## Overview

Playwright has built-in auto-waiting — every `locator` action and `expect` assertion retries until it passes or times out. Use this instead of manual waits. Tests should locate elements the way users do: by role, label, or visible text. If you can't locate an element without adding a `data-testid`, the app likely has an accessibility gap — fix the markup instead.

## Project setup

Two files are required at the project root.

**`playwright.config.ts`:**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

**`package.json`** (relevant parts):

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "@types/node": "^20.0.0"
  }
}
```

Key points:
- Always set `baseURL`. Tests use relative paths (`/login`, not `http://localhost:3000/login`).
- Always include a `webServer` block so `npx playwright test` starts the app automatically.
- `reuseExistingServer: !process.env.CI` allows local reuse but forces a fresh server in CI.
- Default browser is **Chromium**. Add `firefox` or `webkit` to `projects` only when cross-browser coverage is explicitly required.
- Test files live in `tests/` and are named `*.spec.ts`.

## Locator priority — always use in this order

1. `getByRole('button', { name: 'Submit' })` — ARIA role + accessible name
2. `getByLabel('Email')` — form inputs associated with a label
3. `getByPlaceholder('Search...')` — inputs that have no label
4. `getByText('Welcome back')` — visible text content
5. `getByTestId('x')` — **last resort only.** Needing a `data-testid` is a signal the element has no accessible name or role. Fix the markup first: add a `<label>`, an `aria-label`, or the correct ARIA role. Only fall back to `data-testid` when the element is genuinely non-interactive and has no visible text.

Never use:
- `locator('.email')` or `locator('p.email')` — CSS class selectors break on style refactors
- `locator('h2')` — bare tag selectors are ambiguous; use `getByRole('heading', { name: '...' })`
- `locator('#someId')` — ID selectors couple tests to implementation details

## Waiting — never use `waitForTimeout`

```ts
// WRONG — arbitrary sleep, causes flakiness
await page.waitForTimeout(500);

// RIGHT — Playwright retries until the element appears
await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

// RIGHT — wait for a button to become interactive before clicking
await expect(page.getByRole('button', { name: 'Proceed' })).toBeEnabled();

// RIGHT — wait for navigation to complete
await page.waitForURL('/dashboard');
```

If you feel like adding a sleep, that is a signal to find the right condition to wait on instead.

## API mocking with `page.route`

Use `page.route` to intercept network requests. Always set up routes **before** navigating.

```ts
test('shows error on failed login', async ({ page }) => {
  await page.route('**/api/login', route =>
    route.fulfill({ status: 401, json: { error: 'Invalid credentials' } })
  );

  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Log In' }).click();

  await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
});
```

- Always use `**/api/login` (with `**/` prefix), not `/api/login`. The bare path only matches when origin and path are identical; the glob matches regardless of host or port, so tests work in CI, staging, and local dev without changes.
- `route.fulfill({ json: ... })` automatically sets `Content-Type: application/json`.

## Test isolation

- Each test must call `page.goto()` — never rely on state left by a previous test.
- Never share mutable variables between tests. Use `test.beforeEach` for setup.
- If a test creates server-side data, clean it up in `test.afterEach`.

## Complete example

```ts
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('redirects to dashboard on valid credentials', async ({ page }) => {
    await page.route('**/api/login', route =>
      route.fulfill({ status: 200, json: { username: 'ada' } })
    );

    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('correct');
    await page.getByRole('button', { name: 'Log In' }).click();

    await page.waitForURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Hello, ada' })).toBeVisible();
  });

  test('shows error banner on invalid credentials', async ({ page }) => {
    await page.route('**/api/login', route =>
      route.fulfill({ status: 401, json: { error: 'Invalid credentials' } })
    );

    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
    await expect(page).toHaveURL('/login');
  });
});
```

## Common mistakes

- **Hardcoded full URLs** — Use relative paths (`/login`) and set `baseURL` in config. Every hardcoded `localhost:3000` is a portability bug.
- **CSS class locators** — `locator('.btn-primary')` breaks when styles change. Use `getByRole`.
- **Bare tag locators** — `locator('h2')` matches any h2 on the page. Use `getByRole('heading', { name: '...' })`.
- **Sleeping** — `waitForTimeout` makes tests slow and still flaky. Find the right condition.
- **Routes after navigation** — `page.route` must be called before `page.goto`.
- **Reaching for `data-testid` too soon** — if you need a testid to locate an element, the app is probably missing a label or ARIA role. Fix the app.
- **No `webServer` in config** — tests fail with "connection refused" unless the dev server is already running manually.
- **Bare path in `page.route`** — `route('/api/login', ...)` only matches that exact origin. Use `route('**/api/login', ...)` so tests work across environments.
