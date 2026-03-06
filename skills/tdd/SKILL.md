---
name: tdd
description: Use when implementing any feature or bugfix, before writing any production code.
---

# Test-Driven Development

Write the test first. Watch it fail. Write minimal code to pass. Repeat.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## The Iron Law

No production code without a failing test first.

Write code before the test? Delete it. Start over.

No exceptions:
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Delete means delete

## Red-Green-Refactor

**RED — write one failing test**
- Tests a single, specific behaviour
- Has a clear name describing what it tests and under what conditions
- Uses real code, not mocks (unless the boundary is truly external: network, DB, filesystem, clock)
- Follows Arrange / Act / Assert

Run it. Confirm it fails — not errors, actually fails. The failure message should make sense. If the test passes immediately, you're testing existing behaviour; fix the test.

**GREEN — write minimal code to pass**
- Write the simplest thing that makes the test pass
- Don't add features, refactor other code, or over-engineer beyond the test
- If the simplest implementation feels wrong, note it — but still write the simplest thing first

Run it. Confirm the test passes and no other tests broke.

**REFACTOR — clean up**
- Remove duplication, improve names, extract helpers
- Don't add new behaviour
- Keep tests green throughout

Repeat. Each cycle should take minutes.

## Starting a new feature

Write a test for the smallest observable behaviour first. If you can't write a test because the interface is unclear, sketch the interface first — then write the test.

Don't write a test for an entire feature at once. One specific input and its expected output.

## Triangulation

When the correct implementation isn't obvious, write multiple tests with different inputs that all point toward the same behaviour. Let the tests force the general solution to emerge rather than assuming it upfront.

## When to deviate

TDD is the default. Deviate only when ALL of these are true:
- Exploring an unfamiliar API or problem space (spike) — learn, then **delete the spike** and TDD the real solution from scratch
- Writing a true throwaway script that will never run again
- Fixing a pure environment or config issue with no logic of your own (e.g. a missing env var)

These are **not** valid reasons to skip:
- "This is simple" — simple code still has observable behaviour
- "Just scaffolding" — scaffolding ships; test it
- "The user didn't ask for tests" — tests are part of every task
- "Tests would be excessive" — if the code has observable behaviour, it has a test

## Example: bug fix

**Bug:** empty email is accepted

RED:
```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

Run test, confirm it fails with `expected 'Email required', got undefined`.

GREEN:
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) return { error: 'Email required' };
  // ...
}
```

Run test, confirm it passes.

REFACTOR: extract validation if other fields need the same treatment.

## Common rationalizations

- "Too simple to test" — simple things break; the test takes 30 seconds
- "I'll test after" — tests that pass immediately prove nothing
- "Tests after achieve the same goals" — tests-after answer "what does this do?"; tests-first answer "what should this do?"
- "I already manually tested it" — manual testing is ad-hoc; you can't re-run it when code changes
- "Deleting X hours of work is wasteful" — sunk cost fallacy; keeping unverified code is the real waste
- "Keep as reference while writing tests" — you'll adapt it; that's testing after; delete means delete
- "Need to explore first" — fine; throw away the exploration and start TDD fresh
- "TDD will slow me down" — finding bugs before commit is faster than debugging after

## Red flags — stop and start over

- Code written before the test
- Test passes immediately without any implementation
- Can't explain why the test failed
- Thinking "just this once"
- Thinking "I already manually tested it"
- Thinking "tests after achieve the same purpose"
- Thinking "this is different because..."

All of these mean: delete the code, start over with TDD.

## Verification checklist

Before marking work complete:
- [ ] Every new function/method has a test written before the implementation
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the expected reason (feature missing, not a typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass with clean output (no errors or warnings)
- [ ] Edge cases and error paths covered

Can't check every box? You skipped TDD. Start over.
