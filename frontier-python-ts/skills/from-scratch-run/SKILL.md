---
name: from-scratch-run
description: Use when the developer advocate needs to verify the application can be cloned and run by a new engineer. Triggers include: adding a new application or service, changing docker-compose or Dockerfiles, changing environment variable handling, changing networking between services, adding or modifying Makefile targets / uv / pnpm scripts, changing the Python or Node toolchain pin, changing database schemas or Alembic migrations, or changing README/setup documentation.
---

# From-Scratch Run

A from-scratch run verifies the documented setup actually works. It simulates a new engineer cloning the repo and following the README — nothing more.

The harness has two stacks: a FastAPI backend in `apps/api/` (managed by `uv`) and a Vite frontend in `apps/web/` (managed by `pnpm`). The from-scratch run must exercise both, plus the `make` targets that wire them together.

## When to trigger

Run from scratch when the PR includes **any** of:
- New application or service added to the monorepo
- `docker-compose.yml` or any `Dockerfile` changed
- `.env.example` or environment variable handling changed
- Networking between services changed (ports, hostnames, service names)
- Root `Makefile` targets added or modified
- `apps/api/pyproject.toml`, `apps/api/uv.lock`, or Python version pin changed
- `apps/web/package.json`, `apps/web/pnpm-lock.yaml`, or Node version pin changed
- Alembic migration files added or modified
- `README.md` or setup documentation changed

Skip if none of the above apply.

## What you do (and don't do)

You **instruct a subagent** to perform the run. You do not run it yourself.

You never make code changes. You never modify application source, compose files, Dockerfiles, or scripts — even if you believe you know the fix. The purpose of this run is to surface problems, not solve them.

## How to instruct the subagent

Dispatch a subagent (use the `local-task` agent type) with the following instructions, substituting the actual values:

---

**Subagent prompt template:**

```
You are running a from-scratch verification of the <REPO_NAME> monorepo.
Your job is to follow the README exactly and report what happens.
You may NOT make any code changes under any circumstances.

## Setup

1. Clone the repo into a temporary directory:
   git clone <REPO_URL> /tmp/scratch-run-<BRANCH>
   cd /tmp/scratch-run-<BRANCH>

2. Check out the target branch:
   git checkout <BRANCH>

3. Copy .env.example to .env:
   cp .env.example .env

4. If any ports in the .env or docker-compose.yml conflict with services
   already running on this machine, update the port values in .env only
   (not in docker-compose.yml or source files) using a +1000 offset.
   Document every port change you make.

## Toolchain prerequisites

Before following the README, confirm the host has the tools the project pins:

- `uv --version` (Python package manager — install via `curl -LsSf https://astral.sh/uv/install.sh | sh` if missing)
- `pnpm --version` (Node package manager — install via `corepack enable && corepack prepare pnpm@latest --activate` if missing)
- `docker --version` and `docker compose version`
- `python --version` matches the `requires-python` in `apps/api/pyproject.toml`
- `node --version` matches `apps/web/package.json` `engines.node` if present

If any are missing, that is itself a documentation gap — note it in the report.

## Run

Follow the README quickstart exactly, step by step. Run each command and
capture its full output. The expected canonical sequence is:

1. `make install` — runs `uv sync` in `apps/api/` and `pnpm install` in `apps/web/`
2. `docker compose up -d postgres redis` — start dependencies
3. `cd apps/api && uv run alembic upgrade head` — apply migrations
4. `make dev` — start `uvicorn` and `pnpm dev` together
5. Smoke checks:
   - `curl -fsS http://localhost:8000/health/live` returns `{"status":"ok"}`
   - `curl -fsS http://localhost:8000/health/ready` returns `{"status":"ready"}`
   - `curl -fsS http://localhost:8000/openapi.json | head` returns valid JSON
   - `curl -fsS http://localhost:5173/` returns the Vite index HTML

If the README diverges from this sequence, follow the README — it is the
source of truth being verified. Note any divergence in the report.

If the README instructs you to run docker compose, add --build to ensure
images are rebuilt from the checked-out source.

If the README instructs you to create Docker services or Alembic migrations
that don't exist yet (e.g., for a new feature introduced in this branch),
that is expected and allowed — create them.

## Report back

Return a structured report:

### Environment
- Repo: <REPO_URL>
- Branch: <BRANCH>
- Clone path: /tmp/scratch-run-<BRANCH>
- Port offsets applied (if any): list each

### Step-by-step results
For each README step: the command run, pass/fail, and full output on failure.

### Final status
PASS — all services started and the application is reachable, or
FAIL — one or more steps failed

### Failures (if any)
For each failure:
- Step: exact step from the README
- Command: the exact command run
- Error output: full verbatim output
- Diagnosis: what this error means in plain English
- Likely cause: documentation gap, missing env var, broken compose config, etc.
- NOT your job to fix: state this explicitly and stop

## Cleanup
When done:
  docker compose down -v
  pkill -f "uvicorn app.main:app" || true
  pkill -f "vite" || true
  rm -rf /tmp/scratch-run-<BRANCH>
```

---

## What you do with the report

**On PASS:** Note it in your output to `build`. No further action needed.

**On FAIL:** Do not fix the problem yourself. Do not edit any file to work around the failure. Report it directly to `build` with:
- Each failed step
- The full verbatim error output from the subagent
- The subagent's plain-English diagnosis
- A statement that this is a blocker requiring author attention before merge

The build agent is responsible for routing failures to the correct engineer.

## Common mistakes

- **Running inside the feature branch checkout** — always clone to a fresh `/tmp` path for from-scratch runs. The current checkout is not a clean environment.
- **Editing files to make the run pass** — forbidden. Even obvious fixes. Report the failure.
- **Reusing the host's existing `.venv` or `node_modules`** — both must be reinstalled inside the fresh clone. A from-scratch run that uses cached dependencies isn't from scratch.
- **Skipping `alembic upgrade head`** — the readiness probe will fail and the failure will look like a code bug. Run migrations before starting `uvicorn`.
- **Skipping the run because "it's just a doc change"** — README changes are a trigger. A doc change can break the flow.
- **Ignoring port conflicts silently** — document every port offset applied. The subagent must list them in its report.
