---
name: testing-best-practices
description: Use when writing or reviewing tests. Covers universal test structure, factories, mocking boundaries, and seed data. For language-specific conventions, see javascript-testing or python-testing.
---

# Testing Best Practices

## Universal rules

These apply regardless of language or framework.

- **Test behaviour, not implementation.** A test should survive a refactor of internals as long as external behaviour is unchanged.
- **One concept per test.** Multiple assertions are fine if they all verify the same logical outcome. Testing independent behaviours in one test makes failures ambiguous.
- **Tests must be hermetic.** No dependency on run order, shared mutable state, or side effects from other tests.
- **Use factories for all test data.** Never construct domain objects or database records inline in test bodies. Factories centralise knowledge of how to build valid objects and make tests resilient to schema changes.
- **Avoid logic in tests.** No conditionals, loops, or try/catch. Logic in a test is a sign it's too complex.
- **Name tests as specifications.** Include the thing under test, the scenario, and the expected outcome: `calculateDiscount_whenUserIsVIP_returns20Percent`.

## Running tests

Always run the full test suite from the project root using whatever command the project defines (check the README or package manifest). Never scope or filter the run unless explicitly told to. The full suite — including linting and type checking where applicable — must exit clean. A failure anywhere is a blocking failure.

## Seed data and test credentials

Projects with authenticated endpoints must include seed data covering every auth role the API defines. Each seeded user needs a known plaintext password so tokens can be obtained programmatically without mocking.

Document credentials in the README under a "Local development" or "Test credentials" section as a simple, readable list:

```
member:  member@example.com / password123
admin:   admin@example.com  / password123
```

These are for local development only — never staging or production. The seed script must be idempotent. If the project doesn't have one yet, create it as part of any task that introduces authentication.

## Factories

Factories are the only place in the test suite that knows how to construct a valid instance of a domain object. Key rules:

- Default values must produce a valid, fully-configured object with no required fields missing
- Use random/unique values for IDs and unique fields (e.g. email) so two calls produce independent objects
- Use fixed constants for values that are expensive to compute or must be consistent (e.g. a hashed password)
- Overrides use spread-last: define all defaults first, then spread overrides at the end
- No logic or conditionals inside the core build method — use named helper variants instead (e.g. `admin()`, `withCompany()`)

## Mocking

Mock at true external boundaries only: network calls, databases, filesystems, clocks. Do not mock functions within the same module you are testing. Prefer dependency injection over module-level mocking where possible.

## Language-specific conventions

- TypeScript / JavaScript: see javascript-testing
- Python: see python-testing
