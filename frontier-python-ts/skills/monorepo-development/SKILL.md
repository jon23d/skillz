---
name: monorepo-development
description: Use when laying out a new repo, adding services, wiring up cross-app scripts, or troubleshooting "how do I run X from the root" questions. The harness is a polyglot monorepo with a Python (FastAPI + uv) backend in `apps/api/` and a TypeScript (Vite + React + pnpm) frontend in `apps/web/`. Each side keeps its own toolchain; the root only coordinates.
---

# Monorepo Development (uv + pnpm, polyglot)

The harness is a **polyglot monorepo**. Python lives under `apps/api/` and is managed by **uv**. TypeScript lives under `apps/web/` and is managed by **pnpm**. There is no single package manager that owns the whole tree, and no attempt to unify them through a meta-tool.

The root coordinates: shared environment variables, top-level scripts, CI configuration. Each app owns its own dependencies, lockfile, lint config, test runner, and build output.

## Canonical layout

```
.
├── apps/
│   ├── api/                          # FastAPI service — managed by uv
│   │   ├── app/
│   │   │   ├── api/                  # routers
│   │   │   ├── core/                 # config, db, security, observability
│   │   │   ├── models/               # SQLAlchemy models
│   │   │   ├── schemas/              # Pydantic schemas
│   │   │   ├── services/             # business logic
│   │   │   └── main.py
│   │   ├── alembic/
│   │   │   ├── env.py
│   │   │   └── versions/
│   │   ├── tests/
│   │   ├── scripts/
│   │   │   └── export_openapi.py
│   │   ├── alembic.ini
│   │   ├── pyproject.toml            # uv-managed
│   │   └── uv.lock
│   │
│   └── web/                          # Vite + React frontend — managed by pnpm
│       ├── src/
│       │   ├── api/                  # generated client + apiClient instance
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── pages/
│       │   ├── routes/
│       │   ├── services/
│       │   └── main.tsx
│       ├── public/
│       ├── tests/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── package.json              # pnpm-managed
│       └── pnpm-lock.yaml
│
├── infra/                            # Dockerfiles, k8s manifests, terraform
│   ├── api.Dockerfile
│   └── web.Dockerfile
│
├── scripts/                          # cross-app shell scripts
│   ├── dev.sh                        # starts api + web together
│   └── codegen.sh                    # exports openapi.json + regenerates client
│
├── .env                              # NOT committed — local secrets
├── .env.example                      # committed — documents every variable
├── .gitignore
├── docker-compose.yml                # local Postgres + Redis
├── Makefile                          # the canonical entry point for everything
└── README.md
```

There is **no `pnpm-workspace.yaml`**, no `turbo.json`, no Nx. The monorepo is a directory layout convention plus a `Makefile`. Both apps are independent units that happen to live in the same repository for atomic commits and shared CI.

## The non-negotiables

**Run app commands from inside the app directory, run cross-app commands from the root.**
- `apps/api`: every `uv` command (`uv sync`, `uv run pytest`, `uv run alembic upgrade head`) runs from `apps/api/`. uv resolves `pyproject.toml` from the current directory.
- `apps/web`: every `pnpm` command (`pnpm install`, `pnpm test`, `pnpm build`) runs from `apps/web/`. pnpm resolves `package.json` from the current directory.
- Cross-app commands (start everything, run codegen end-to-end, run all tests in CI) live in the root `Makefile` or `scripts/`.

**Each app declares its own dependencies in its own manifest.** `apps/api/pyproject.toml` is the only place Python dependencies are declared. `apps/web/package.json` is the only place Node dependencies are declared. There is no root `package.json` that hoists frontend deps, and no root `pyproject.toml` that aggregates backend deps.

**Each app has its own lockfile, committed.** `apps/api/uv.lock` and `apps/web/pnpm-lock.yaml`. Never delete one to "fix" a build — diagnose the actual conflict.

**Never mix the two stacks.** Do not import a Node tool to format Python. Do not invoke a Python script as part of `pnpm build`. The `Makefile` is the only place where the two worlds meet.

## The root `Makefile`

The Makefile is the canonical entry point. New contributors should be able to read it and understand how to do anything in the repo.

```make
.PHONY: install dev api web test lint format codegen migrate clean

install:
	cd apps/api && uv sync
	cd apps/web && pnpm install

dev:
	# Starts Postgres + Redis, then api + web in parallel.
	# Use `scripts/dev.sh` for the actual orchestration.
	./scripts/dev.sh

api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && pnpm dev

test:
	cd apps/api && uv run pytest
	cd apps/web && pnpm test

lint:
	cd apps/api && uv run ruff check . && uv run mypy .
	cd apps/web && pnpm lint && pnpm typecheck

format:
	cd apps/api && uv run ruff format .
	cd apps/web && pnpm format

codegen:
	./scripts/codegen.sh

migrate:
	cd apps/api && uv run alembic upgrade head

migration:
	# Usage: make migration MSG="add foo to bar"
	cd apps/api && uv run alembic revision --autogenerate -m "$(MSG)"

clean:
	cd apps/api && rm -rf .venv .pytest_cache .ruff_cache .mypy_cache
	cd apps/web && rm -rf node_modules dist .turbo
```

Every contributor should know `make install`, `make dev`, `make test`, `make lint`, `make codegen`, `make migrate`. That is the public API of the repo.

## Cross-app scripts

`scripts/codegen.sh` is the canonical example of cross-app coordination. It starts the FastAPI dev server, waits for it to be ready, runs the frontend codegen, then shuts the server down.

```bash
#!/usr/bin/env bash
# scripts/codegen.sh — regenerate the frontend OpenAPI client
set -euo pipefail

cd "$(dirname "$0")/.."

# Use the offline export script — no need to start a real server.
cd apps/api
uv run python scripts/export_openapi.py > /tmp/openapi.json
cd ../..

cd apps/web
pnpm exec openapi-typescript /tmp/openapi.json -o src/api/generated.d.ts
```

`scripts/dev.sh` starts everything for local development. Use whatever process supervisor you already have (`overmind`, `concurrently`, `tmux`, `foreman`); the choice is not load-bearing as long as it propagates Ctrl-C correctly to children.

```bash
#!/usr/bin/env bash
# scripts/dev.sh — bring up the full stack for local dev
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d postgres redis

# Run api and web in parallel; propagate Ctrl-C to both.
trap 'kill 0' SIGINT SIGTERM EXIT
( cd apps/api && uv run uvicorn app.main:app --reload --port 8000 ) &
( cd apps/web && pnpm dev ) &
wait
```

## Environment variables — one root `.env`, no per-app `.env` files

All environment variables for both apps live in a single root `.env`. Do not create `.env` files inside `apps/api/` or `apps/web/`.

```bash
# .env — single source of truth for the entire repo
DATABASE_URL=postgresql+asyncpg://app:app@localhost:5432/app
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=change-me-min-32-chars-xxxxxxxxxxx
LOG_LEVEL=info

# Frontend (must be VITE_-prefixed to be exposed to the client bundle)
VITE_API_BASE_URL=http://localhost:8000
```

**Why one file:** per-app `.env` files cause drift (the same variable defined differently in two places), make onboarding harder (developers must populate N files instead of one), and create "works in isolation but not together" failures when variables are missing in one app.

**Each app still validates only its own variables.** The backend uses `pydantic-settings` to declare the subset it needs (see the `pydantic-settings` skill); the frontend uses a `src/env.ts` module that reads `import.meta.env.VITE_*` and validates with zod. The root file is just where the values live.

**Path resolution:**
- **Backend (uv + pydantic-settings):** uv runs from `apps/api/`, but `BaseSettings` reads `.env` relative to the current working directory by default. Configure `model_config = SettingsConfigDict(env_file="../../.env")` so the backend reads the root `.env`.
- **Frontend (Vite):** Vite searches `.env` files relative to the project root (`apps/web/`). Add an `envDir: "../.."` entry to `vite.config.ts` so Vite loads the repo-root `.env`.

```ts
// apps/web/vite.config.ts
export default defineConfig({
  envDir: "../..",
  // ...
})
```

**Always commit `.env.example` at the root. Never commit `.env`.** When adding a variable to either app, add the example entry to the root `.env.example` in the same commit.

## Tooling boundaries — what lives where

| Concern | Backend (`apps/api`) | Frontend (`apps/web`) |
|---|---|---|
| Package manager | uv | pnpm |
| Manifest | `pyproject.toml` | `package.json` |
| Lockfile | `uv.lock` | `pnpm-lock.yaml` |
| Lint | `ruff check` | `eslint` |
| Format | `ruff format` | `prettier` |
| Type-check | `mypy` | `tsc --noEmit` |
| Test | `pytest` | `vitest` |
| Build | none (Python is interpreted) | `vite build` → `dist/` |
| Runtime | `uvicorn app.main:app` | `node` (dev) / static files (prod) |

Neither side reaches across the boundary. The frontend never imports a Python file. The backend never imports a `.ts` file. The only thing that crosses the line is **the OpenAPI spec** — the frontend generates types from it (see the `openapi-codegen` skill), and that is the entire contract.

## Committing cross-app changes

When a change spans causally coupled apps — for example, a new field on a Pydantic model and the frontend component that displays it — commit them together. Splitting creates a non-buildable history state and breaks `git bisect`.

```
feat(users): add stripe_customer_id, surface in billing view
```

**Separate unrelated changes.** If you happen to be refactoring an internal helper in `apps/api` and adding an unrelated feature to `apps/web` in the same session, these should be two commits. The rule is about causal coupling, not physical proximity.

## CI coordination

CI runs the two stacks as **parallel jobs**, not as one giant pipeline. See the `cicd-pipeline-creation` skill for the canonical two-lane setup. The high-level shape:

- **api lane:** `uv sync` → `ruff check` → `mypy` → `alembic upgrade head` (against a service container) → `pytest`.
- **web lane:** `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → regenerate openapi client from a freshly-exported spec → `git diff --exit-code` → `pnpm test` → `pnpm build`.
- A final job that depends on both passing.

The api lane must complete the spec export before the web lane can verify codegen — that is the only synchronisation point between them.

## Troubleshooting

**Backend can't find the root `.env`**
- `BaseSettings` is reading from the wrong directory. Add `model_config = SettingsConfigDict(env_file="../../.env")` to the `Settings` class, or set the `ENV_FILE` env var explicitly when launching uvicorn.

**Frontend env vars are `undefined`**
- Either the variable isn't prefixed with `VITE_` (Vite refuses to expose anything else to the client), or `envDir: "../.."` is missing from `vite.config.ts`.

**`uv sync` / `pnpm install` clobbering each other**
- They cannot — they touch different directories and lockfiles. If you see a conflict, you ran one of them from the wrong directory. `uv` only looks at `pyproject.toml`; `pnpm` only looks at `package.json`.

**`make codegen` fails with "connection refused"**
- The dev FastAPI server isn't running, or `scripts/codegen.sh` is using the offline export and the script path is wrong. Prefer the offline export (`apps/api/scripts/export_openapi.py`) — it doesn't need a running server.

**Test isolation: `pytest` is hitting my dev database**
- The backend test config is reading the root `.env` instead of a test-only override. See the `tdd` skill — tests should spin up a `testcontainers-python` Postgres and override `DATABASE_URL` for the duration of the suite.

## Checklist

- [ ] `apps/api/` and `apps/web/` are the only two app directories
- [ ] `apps/api/pyproject.toml` + `apps/api/uv.lock` committed
- [ ] `apps/web/package.json` + `apps/web/pnpm-lock.yaml` committed
- [ ] No `pnpm-workspace.yaml`, no `turbo.json`, no root `package.json`
- [ ] Root `Makefile` exposes `install`, `dev`, `test`, `lint`, `format`, `codegen`, `migrate`
- [ ] All env vars in root `.env`; no per-app `.env` files
- [ ] Root `.env.example` updated whenever either app adds a variable
- [ ] Backend `Settings` configured with `env_file="../../.env"`
- [ ] Frontend `vite.config.ts` configured with `envDir: "../.."`
- [ ] CI runs api and web as parallel lanes (see `cicd-pipeline-creation`)
- [ ] Cross-app changes committed atomically when causally coupled
