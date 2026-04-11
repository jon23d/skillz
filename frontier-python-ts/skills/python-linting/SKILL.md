---
name: python-linting
description: Use when setting up Ruff and mypy in a Python backend service, adding linting/formatting/type-checking to an existing Python codebase, or configuring pyproject.toml for code quality tooling. Backend services in this harness use Ruff (lint + format) and mypy (strict type-check). Frontend linting lives in the frontend-linting skill.
---

# Python Linting (Ruff + mypy)

Every Python service in this harness uses **Ruff** for linting and formatting and **mypy** for static type checking. There is no Black, no isort, no flake8, no pylint — Ruff replaces all of them. There is no pyright — mypy is the type-checker.

## Install

```bash
uv add --dev ruff mypy
```

## `pyproject.toml`

The single source of truth. No `setup.cfg`, no `.flake8`, no `pyproject-fmt` quirks.

```toml
[project]
name = "myapp-api"
version = "0.1.0"
requires-python = ">=3.12"

[tool.ruff]
target-version = "py312"
line-length = 100
src = ["app", "tests"]

[tool.ruff.lint]
# Enabled rule sets — chosen so the noise is low and the signal is high.
select = [
  "E",   # pycodestyle errors
  "W",   # pycodestyle warnings
  "F",   # pyflakes
  "I",   # isort (import sorting)
  "B",   # bugbear (likely bugs)
  "UP",  # pyupgrade (modern syntax)
  "SIM", # simplify
  "ASYNC", # async-specific lints (forgotten awaits, blocking calls)
  "S",   # bandit (security)
  "RUF", # ruff-specific
]
ignore = [
  "E501",  # line length — handled by the formatter
  "S101",  # assert in tests is fine
]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S", "ASYNC230"]   # tests can use bandit-flagged constructs

[tool.ruff.lint.isort]
known-first-party = ["app"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]
mypy_path = "app"
exclude = ["alembic/versions"]

# Strict but reasonable
warn_unused_ignores = true
warn_redundant_casts = true
warn_return_any = true
disallow_any_generics = true
disallow_untyped_defs = true
no_implicit_optional = true

[[tool.mypy.overrides]]
module = ["tests.*"]
disallow_untyped_defs = false   # tests can be looser

[[tool.mypy.overrides]]
module = ["alembic.*"]
ignore_errors = true
```

## Scripts

Add these to your README and CI:

```bash
uv run ruff check .              # lint
uv run ruff check --fix .        # lint + autofix
uv run ruff format .             # format
uv run ruff format --check .     # format check (CI)
uv run mypy app                  # type-check
```

The CI matrix runs: `ruff format --check .`, `ruff check .`, `mypy app`, `pytest`. All four must pass.

## What Ruff catches that matters

- **`F401`** — unused imports (most common cleanup hit).
- **`F841`** — unused local variables.
- **`B008`** — function call as a default argument (the classic mutable-default bug, plus FastAPI `Depends(...)` exception is built in).
- **`B904`** — `raise ... from ...` for exception chaining.
- **`ASYNC100`** — blocking call (`time.sleep`, `requests.get`) inside an async function.
- **`ASYNC110`** — async function without an `await`.
- **`S105/S106`** — possible hardcoded password.
- **`SIM102`** — collapsible nested `if`s.
- **`UP`** — `Optional[X]` → `X | None`, `Dict[k, v]` → `dict[k, v]`, etc.

## What mypy enforces

`strict = true` enables:

- `disallow_untyped_defs` — every function has annotations.
- `disallow_any_generics` — `list[int]`, never bare `list`.
- `warn_return_any` — flags accidental `Any` returns.
- `no_implicit_optional` — `def f(x: int = None)` is rejected; write `int | None`.

The `pydantic.mypy` plugin understands `BaseModel` and gives correct types for Pydantic-generated `__init__` signatures.

## Pre-commit (optional)

If the project uses pre-commit:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic, sqlalchemy]
```

Pre-commit is not mandatory — CI is the gate. But it cuts feedback loops.

## Common mistakes

- **Configuring Black or isort alongside Ruff** — Ruff replaces both. Delete the duplicate config.
- **Setting `line-length` higher than 100** — fights Ruff's formatter and PEP 8 expectations. 100 is the agreed limit.
- **Skipping `pydantic.mypy`** — without it mypy treats every Pydantic model field as `Any` and the type checker is useless.
- **`ignore_missing_imports = true` globally** — masks real missing-stub problems. Add `[[tool.mypy.overrides]]` for specific modules instead.
- **Not running `mypy` in CI** — runtime errors that mypy would have caught are the worst kind.
- **`per-file-ignores` for `app/**`** — never. App code holds the same standards as everything else; if a rule is too strict, change the rule globally.
