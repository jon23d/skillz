---
name: javascript-testing
description: Use when writing or reviewing tests in a TypeScript or JavaScript project. Covers framework selection, factories, async patterns, React component testing, and mocking conventions.
---

# JavaScript / TypeScript Testing

**Frameworks:** Vitest or Jest for unit and integration tests; Playwright for end-to-end.

See testing-best-practices for universal rules on test structure, hermeticity, and mocking boundaries.

## Factories

Define a base factory once and extend it per domain type. Factories live in `tests/factories/` and are the only place that knows how to construct a valid domain object.

```ts
// tests/factories/base.ts
export abstract class BaseFactory<T> {
  abstract build(overrides?: Partial<T>): T

  buildList(count: number, overrides?: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.build(overrides))
  }
}
```

```ts
// tests/factories/user.ts
import { randomUUID } from 'crypto'
import { BaseFactory } from './base'
import type { User } from '../../src/types'

const TEST_PASSWORD_HASH = '$2b$10$test-hash-for-testing-only'

class UserFactory extends BaseFactory<User> {
  build(overrides: Partial<User> = {}): User {
    return {
      id: randomUUID(),
      name: 'Test User',
      email: `test-${randomUUID()}@example.com`,
      passwordHash: TEST_PASSWORD_HASH,
      isAdmin: false,
      createdAt: new Date(),
      ...overrides,
    }
  }

  admin(overrides: Partial<User> = {}): User {
    return this.build({ isAdmin: true, ...overrides })
  }
}

export const userFactory = new UserFactory()
```

Usage:
```ts
const user = userFactory.build()
const admin = userFactory.admin()
const users = userFactory.buildList(3)
const custom = userFactory.build({ email: 'specific@example.com' })
```

## Mocking

Use `vi.mock` (Vitest) or `jest.mock` at module boundaries only — external services, database clients, filesystem, clock. Do not mock functions within the same module under test. Prefer dependency injection over module-level mocking where possible.

## Async

Always `await` async calls in tests. Never use `done` callbacks. Prefer `async/await` over `.resolves`/`.rejects` matchers for readability, except when the assertion is the only line in the test.

## React component tests

Use React Testing Library. Query by accessible role, label, or visible text. Do not use `getByTestId` or query internal state or component methods — test what a user would see and interact with.

```ts
// Good
expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()

// Bad
expect(wrapper.instance().state.isLoading).toBe(true)
```

## Coverage

Don't chase coverage numbers. 100% coverage with behaviour-free tests is worthless. Aim for tests that would catch real regressions.
