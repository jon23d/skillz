---
name: github-quality-control
description: Use when writing a GitHub Actions workflow that runs tests and linting on push to enforce code quality gates without blocking merges
---

# GitHub Quality Control Workflow

## Overview

A minimal GitHub Actions workflow that enforces code quality on every push by running tests and linting. Results are reported to the PR. Failed runs upload logs for debugging. This does NOT block merges.

## When to use

When you need a CI workflow that:
- Runs automatically when code is pushed
- Validates tests pass and linting is clean
- Reports status to GitHub
- Saves logs when checks fail
- Does NOT prevent merging

## Core pattern

Copy and adapt this template:

```yaml
name: Code Quality

on:
  push:
    branches: [main, develop]
    paths:
      - '**.py'                       # or '**.js', '**.ts', etc.
      - 'requirements.txt'            # adjust for your project
      - '.github/workflows/quality.yml'

permissions:
  contents: read
  checks: write
  pull-requests: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python             # or setup-node, setup-go, etc.
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run tests
        run: pytest --junitxml=results/test-results.xml

      - name: Run linting
        run: ruff check .

      - name: Upload failed logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: quality-failure-logs
          path: results/
```

## Required elements (must include - NO EXCEPTIONS)

1. **`branches: [main, develop]`** — not `'**'`, not `branches-ignore`
2. **`paths:` filter** — only code files (e.g., `['**.py', 'requirements.txt']`)
3. **`permissions:` block with ALL of these:**
   ```yaml
   permissions:
     contents: read
     checks: write
     pull-requests: write
   ```
4. **`concurrency:` block with `cancel-in-progress: true`** — prevents duplicate runs
5. **Single job named `quality`** — NOT multiple jobs (test/lint should run sequentially in one job)
6. **Explicit runtime version** — `python-version: '3.11'` with NO conditionals
7. **Explicit `pytest` command** — NO `|| true`, NO shell conditionals
8. **Explicit `ruff check .` command** — NO `|| true`, NO shell conditionals
9. **Artifact upload on failure** — `if: failure()` with `upload-artifact`
10. **`path: '.github/workflows/quality.yml'`** — triggers when workflow itself changes

## Forbidden patterns (NEVER do these - NO EXCEPTIONS)

- **`branches-ignore`** — use `branches` + `paths-ignore` instead
- **`branches: '**'`** or `branches: "*"` — too broad, runs on every branch
- **`|| true` after commands** — this silences failures; remove it and let pytest/ruff fail naturally
- **Multiple jobs** (e.g., separate `test:` and `lint:` jobs) — use one `quality:` job with sequential steps
- **Missing `checks: write` or `pull-requests: write`** in permissions — PR checks won't report
- **Missing `cancel-in-progress: true`** — wastes CI minutes on duplicate runs
- **Missing `.github/workflows/quality.yml` in `paths:`** — workflow changes won't retrigger
- **Shell conditionals for test/lint** — don't detect runtime; specify one: `pytest` or `ruff check .`

## What each element does

| Element | Purpose |
|---------|---------|
| `paths:` | Runs CI only when code changes, not when docs/markdown change |
| `permissions:` | Allows workflow to write check status and PR comments |
| `concurrency + cancel-in-progress` | Stops duplicate runs when you push 3x rapidly |
| `if: failure()` | Only uploads artifacts when something actually broke |
| `name:` in upload-artifact | Makes logs easy to find in the workflow UI |

## Common mistakes

| Wrong | Right |
|-------|-------|
| `branches: '**'` | `branches: [main, develop]` |
| `branches-ignore: [main]` | `branches: [main]` with `paths-ignore` for docs |
| No permissions block | `permissions: {contents: read, checks: write}` |
| `setup-python` without version | `with: {python-version: '3.11'}` |
| No artifact on failure | `if: failure()` + `upload-artifact` |
| `npm test || true` | Just `npm test` (let pytest fail naturally) |

## Red flags — stop and reassess

- Workflow has conditional steps (`if:`) for runtime detection → specify one runtime
- More than one job defined → quality gate should be one job
- Workflow exceeds 75 lines → too complex for simple quality check; trim steps or consolidate
- Using `branches-ignore` anywhere → use `branches` + `paths-ignore` instead
- No concurrency block → duplicate runs waste CI quota