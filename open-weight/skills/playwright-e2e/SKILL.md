---
name: playwright-e2e
description: Use when writing Playwright e2e tests for scenarios that genuinely require a real browser against a real backend — OAuth flows, cookie/session mechanics, file downloads, drag-and-drop, or a documented critical path where lower-level tests have failed to catch a regression. Do NOT use for form validation, error states, loading states, or any scenario fully coverable with RTL+MSW.
---

# Playwright E2E Testing

## Before writing anything — check the gate

If the project has API endpoint tests **and** RTL+MSW component tests, the default answer to "should I write an e2e test?" is **no**. Those two layers already cover the seams e2e is meant to catch.

Only proceed if the scenario is one of these:
- A critical path where failure would be a significant incident (one happy-path test per flow — no mocked API responses)
- Browser behavior MSW cannot intercept: OAuth redirects, cookie/session mechanics, file downloads, clipboard, drag-and-drop, file picker
- A documented regression that demonstrably slipped through RTL and endpoint tests

If none of these apply, write or improve the RTL+MSW test instead. Come back here only when you have a clear answer for which legitimate scenario this is.

## Overview

Playwright has built-in auto-waiting — every `locator` action and `expect` assertion retries until it passes or times out. Use this instead of manual waits. Tests should locate elements the way users do: by role, label, or visible text. If you can't locate an element without adding a `data-testid`, the app likely has an accessibility gap — fix the markup instead.

## Running E2E tests

**If you write e2e tests, you run e2e tests.** Do not defer to CI. Do not claim the environment is insufficient. The Playwright config includes a `webServer` block that starts the application automatically.

Run from the repo root:
```bash
npx playwright install --with-deps chromium   # first time only — installs headless browser
npx playwright test                            # runs all e2e tests
```

**If Playwright is not installed or browsers are missing, stop immediately and tell the user what needs to be installed.** Do not skip tests, do not push, do not report success. The correct response is to surface the exact install commands needed and wait for confirmation that the environment is ready. Never silently skip tests because the tooling isn't set up.

All tests MUST pass locally before any code is pushed. This is non-negotiable — CI is not a substitute for local verification.

If the database is required, start it first (e.g. `docker compose up -d db`). If other services are needed, start those too. The test environment is your responsibility — "CI only" is not an acceptable answer.

Do not report back or invoke reviewers until e2e tests pass alongside unit/integration tests.

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

If you feel the urge to mock an API response in an e2e test, stop and ask: can this be covered by an RTL+MSW test instead? Error states, validation responses, and loading states almost always can — and should be.

The legitimate uses of `page.route` in e2e are for **external** services that can't be intercepted at the MSW level: OAuth providers, payment iframes, third-party redirects, or cases where the real browser navigation is the thing being tested.

```ts
// Legitimate — intercepting an external OAuth redirect
test('completes login via SSO', async ({ page }) => {
  await page.route('**/oauth/token', route =>
    route.fulfill({ status: 200, json: { access_token: 'fake-token' } })
  );

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await page.waitForURL('/dashboard');
});
```

Always set up routes **before** navigating. Use `**/api/path` (with `**/` prefix) rather than `/api/path` — the glob matches regardless of host or port so tests work across environments. `route.fulfill({ json: ... })` automatically sets `Content-Type: application/json`.

## Test isolation

- Each test must call `page.goto()` — never rely on state left by a previous test.
- Never share mutable variables between tests. Use `test.beforeEach` for setup.
- If a test creates server-side data, clean it up in `test.afterEach`.

## Complete example

This example tests the critical login path against a real backend — no mocked responses. The error-state test (`shows error banner on invalid credentials`) belongs in RTL+MSW, not here.

```ts
import { test, expect } from '@playwright/test';

test.describe('Login — critical path', () => {
  test('redirects to dashboard after successful login', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('correct-password');
    await page.getByRole('button', { name: 'Log In' }).click();

    await page.waitForURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Hello, ada' })).toBeVisible();
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

## Recording flows with playwright-cli

Before writing a test from scratch, consider using the **playwright-cli** skill to interactively record a browser session. Every action you take generates the corresponding Playwright TypeScript code, which you can paste directly into a test file and add assertions to.

See [playwright-cli skill](../playwright-cli/SKILL.md) — specifically its [test generation reference](../playwright-cli/references/test-generation.md).

## Rationalizations — and the responses

- **"We need e2e coverage of this flow"** → Coverage is not a reason. If endpoint tests + RTL+MSW tests exist, the flow is already covered at the seams. E2e is for the gaps, not for redundancy.
- **"RTL/unit tests only verify logic, not the real user experience"** → RTL with `userEvent` tests real user interactions. MSW intercepts real network calls. The gap between that and a full browser is smaller than it looks — and it's covered by the specific legitimate scenarios above.
- **"It's faster to just write a Playwright test"** → Faster to write, slower to run, more prone to flakiness, harder to debug. Write the RTL test.
- **"E2E tests require CI / a special environment"** → Every test CI runs, you run first. Install a headless browser, start the DB, run them.
- **"The environment is too complex to set up locally"** → Docker exists. `docker compose up -d` and `npx playwright install chromium` is two commands.
- **"I'll let CI catch it"** → CI catches it after you've reported success. That's not testing — that's hoping.
- **"Playwright isn't installed / the browser is missing / the command failed"** → Stop. Tell the user exactly what is missing and what command will fix it. Do not push. Do not report success. Broken tooling is a blocker to surface, not a reason to skip.
