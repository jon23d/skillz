---
name: tdd
description: Use when writing any code — functions, modules, APIs, UI components, scripts, or any other implementation. Use when asked to "implement", "build", "write", "add", "create", or "refactor" anything that involves code. Apply regardless of language, framework, or perceived complexity. Especially critical during refactors — new classes and functions require new tests even when existing tests pass.
---

# tdd

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

Writing tests and implementation in the same step is not tdd. Showing tests passing without first showing them failing is not tdd.

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

## Refactoring — new structure means new tests

Refactoring is the most common way untested code enters a codebase. The reasoning feels sound: "I'm just restructuring, existing tests cover the behavior, so if they pass I'm done." This is wrong.

**The rule: if you create it, you test it.** A new class extracted from an existing function is new code. A new public method is a new contract. It doesn't matter that the logic existed before — the unit is new and needs its own tests.

### What counts as "new" during a refactor

- A new class or module, even if extracted from existing code
- A new public function or method, even if its body was copied verbatim
- A new interface or contract between components
- New parameters, configuration, or options that didn't exist before
- Error handling paths introduced by the new structure

### The refactoring sequence

**Step 1 — Run existing tests. They must pass.** This is your safety net. If they don't pass before you start, you can't trust them to catch regressions.

**Step 2 — Perform the structural refactor.** Extract classes, move functions, reorganize modules.

**Step 3 — Run existing tests again. They must still pass.** This confirms you haven't changed external behavior. But you are not done.

**Step 4 — Identify every new public interface you created.** List each new class, each new public method, each new module export. These are your new units.

**Step 5 — For each new unit, apply the standard tdd sequence.** Write a failing test that describes the unit's contract. Run it, confirm failure. Then confirm the implementation satisfies it. This is not optional — it's the same rule as writing any other new code.

**Step 6 — Run all tests. Existing and new must pass.**

"Existing tests pass" is Step 3. It is not Step 6. You are not done at Step 3.

### Rationalizations specific to refactoring

**"It's just moving code, the behavior hasn't changed."**
The behavior may be the same but the contracts are new. A new class has its own construction, its own edge cases, its own failure modes. The old tests don't exercise these — they go through the old call path.

**"Existing tests already cover this logic."**
Existing tests cover the logic *through the old structure*. If someone later modifies the extracted class in isolation, those tests may not catch the regression. The new unit needs tests that exercise it directly.

**"All existing tests pass, so the refactor is correct."**
Passing existing tests is necessary but not sufficient. It proves you didn't break old behavior. It proves nothing about whether the new abstractions handle edge cases, validate inputs correctly, or will survive future changes.

**"Adding tests for extracted code is just testing implementation details."**
No. A new public class with its own constructor and methods is not an implementation detail — it's a new unit with a public contract. If it's important enough to extract, it's important enough to test.

### Refactoring red flags

- You created new classes or functions but wrote zero new test files or test cases
- Your PR/changeset has more new production code than new test code
- The test plan is "existing tests should pass" with no mention of new tests
- You're about to mark a refactor complete and haven't written a single new test

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
That's not tdd. Writing both in one pass means the tests were written knowing the implementation. Run the failing test first — that's the whole point.

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

**For refactoring:**
- [ ] Existing tests pass before any changes (safety net confirmed)
- [ ] Structural refactor performed
- [ ] Existing tests still pass (behavior preserved)
- [ ] Every new public class, method, and module export identified
- [ ] New tests written for each new unit — failing test shown first
- [ ] New tests pass
- [ ] All tests run — existing and new all pass
