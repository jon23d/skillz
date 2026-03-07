---
name: tdd
description: Use when writing any code — functions, modules, APIs, UI components, scripts, or any other implementation. Use when asked to "implement", "build", "write", "add", or "create" anything that involves code. Apply regardless of language, framework, or perceived complexity.
---

# Test-Driven Development

Write the test first. Run it. Watch it fail. Then write the code.

## The sequence — no skipping, no combining steps

**Step 1 — Write the test file only.**
The implementation file must not exist. Write tests that describe the required behavior from the outside: given this input, expect this output.

**Step 2 — Run the tests and show the failure output.**
Do not proceed until you have run the test command and shown the failure. A test you haven't run failing is not a confirmed failure — it's an assumption.

The format varies by language and framework, but the requirement doesn't: run the test command and show the output. For example:

```
FAIL: test_converts_to_lowercase
  Error: module 'slugify' not found
```

**Step 3 — Write the minimum implementation to make the tests pass.**

**Step 4 — Run the tests again and show them passing.**

```
PASS: test_converts_to_lowercase
```

**Step 5 — Refactor if needed, keeping tests green.**

Writing tests and implementation in the same step is not TDD. Showing tests passing without first showing them failing is not TDD.

## Bug fixes — same principle, different starting point

When fixing a bug in existing code, the workflow is the same but the first step looks different:

**Step 1 — Write a regression test that exposes the bug.**
The implementation exists but is buggy. Write a test that asserts the correct behavior. This test will fail because the bug exists.

**Step 2 — Run the tests and show the failure output.**
The failure proves the bug exists. For example:

```
FAIL: test_division_by_zero
  Expected: null
  Received: Infinity
```

**Step 3 — Fix the code.**

**Step 4 — Run the tests and show them passing.**

The key difference: in bug fixes, the test fails with an assertion error (wrong output), not a "module not found" error. Either way, you must see the failure before fixing.

## Adding features to existing files — same principle, different scope

When adding a new feature to a file that already exists (e.g., adding an endpoint to an existing API, adding a method to an existing class):

**Step 1 — Write tests for the new feature only.**
The existing implementation stays untouched. Add tests that describe the new behavior. These tests will fail because the feature doesn't exist yet.

**Step 2 — Run the tests and show the failure output.**
Existing tests should still pass. New tests should fail. For example:

```
PASS: 8 existing tests
FAIL: test_update_todo
  Expected: 200 OK
  Received: 404 Not Found
```

**Step 3 — Add the minimum implementation for the new feature.**
Do not modify existing code unless absolutely necessary.

**Step 4 — Run all tests and show them passing.**
Existing tests must still pass. New tests must now pass.

The key difference: you're extending existing code, not replacing it. Run all tests to ensure you didn't break anything.

## What a good test looks like

Write from the outside in — describe what the code *should do*, not what it *does do*:

- State the input and expected output before any implementation exists
- Test behavior, not implementation details
- If you already know how you'll implement it, your test is probably too detailed

Bad (mirrors a known implementation — written after the fact):
```js
// Every assertion maps to a line I already wrote
expect(slugify('Hello, World!')).toBe('hello-world') // matches my .replace() chain
```

Good (describes a requirement — written before any code exists):
```js
// Given a string with punctuation
// When slugified
// Then punctuation is removed and words are hyphen-separated
expect(slugify('Hello, World!')).toBe('hello-world')
```

The difference is intent: good tests are written not knowing the implementation.

## Rationalizations — and the responses

**"It's too simple to need a test."**
Simple things break. The test takes 30 seconds. Write it.

**"I'll add tests after."**
Tests written after prove what the code does. Tests written before prove what it should do. They are not the same.

**"We're in a hurry."**
Code without tests creates more delays, not fewer. Write one focused test, then the implementation.

**"I'll just write both efficiently and run tests at the end."**
That's not TDD. Writing both in one pass means the tests were written knowing the implementation. Run the failing test first — that's the whole point.

**"This is a frontend component, testing is awkward."**
Test the behavior before building the component. The component doesn't exist yet — that's the point. Write tests that assert what should render and what should happen on interaction, then build to make them pass:

```
# Before writing the component:
render(<Counter />)
assert displayed value is 0

click increment button
assert displayed value is 1

click reset button
assert displayed value is 0
```

These tests fail (component doesn't exist). Now build to make them pass.

**"The requirements aren't fully clear yet."**
Writing a test forces you to clarify them. Start with the clearest case.

## Red flags — stop and reassess

- You are about to write an implementation file and have not yet run a failing test
- You wrote both files without running the test in between
- You are showing passing tests without having first shown failing ones
- You are writing a test that you already know will pass
- You are thinking "this situation is different because..."

## Checklist per task

**For new code:**
- [ ] Test file written; implementation file does not exist yet
- [ ] Test run — failure output shown (module not found)
- [ ] Implementation written
- [ ] Test run — passing output shown
- [ ] Edge cases covered with their own tests

**For bug fixes:**
- [ ] Regression test written that exposes the bug
- [ ] Test run — failure output shown (assertion fails)
- [ ] Bug fixed
- [ ] Test run — passing output shown

**For adding features to existing files:**
- [ ] Tests for new feature written; existing code unchanged
- [ ] All tests run — existing pass, new tests fail
- [ ] New feature implemented
- [ ] All tests run — all pass
