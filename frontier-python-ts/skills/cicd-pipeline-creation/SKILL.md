---
name: cicd-pipeline-creation
description: Use when creating CI/CD pipelines for any project. Use when asked to "set up CI/CD", "create a pipeline", "automate deployments", "configure GitHub Actions", "set up Vercel/Render/AWS", or similar. The harness is a polyglot monorepo — a Python (FastAPI + uv) backend in `apps/api/` and a TypeScript (Vite + pnpm) frontend in `apps/web/`. Pipelines run the two stacks as parallel lanes that join at a final gate.
---

# CI/CD Pipeline Creation

A CI/CD pipeline must be complete, verifiable, and safe. This harness has two independent stacks, so the pipeline shape is **two parallel lanes that join at a release gate**.

## Required elements

**1. Two parallel test lanes** — backend and frontend run independently
- **api lane:** `uv sync` → `ruff check` → `mypy` → `alembic upgrade head` (against a service container) → `pytest`
- **web lane:** `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → regenerate openapi client from a freshly-exported spec → `git diff --exit-code` → `pnpm test` → `pnpm build`
- Either lane failing fails the PR

**2. Contract verification** — the OpenAPI spec must stay in sync with the generated frontend client
- The api lane produces `openapi.json` via `uv run python scripts/export_openapi.py`
- The web lane consumes it, regenerates `src/api/generated.d.ts`, and runs `git diff --exit-code` against the committed file
- A diff is a **failure** — the engineer forgot to run codegen after a backend change

**3. Deploy stage** — runs only after both lanes pass, on specific branches
- Build and push both Docker images (`apps/api` and `apps/web`) to a registry
- Apply Alembic migrations as a one-shot job (never as part of container start)
- Roll out new replicas
- "Pushing an image" is not "deploying" — actual deployment must happen

**4. Verification stage** — runs immediately after deploy
- Hit `/health/ready` on the api
- Hit `/` on the web
- Fail (and roll back) if either is not 200 within the timeout

**5. Rollback strategy** — documented or automated
- Migrations: every Alembic migration must have a working `downgrade()` for non-trivial schema changes, OR be additive-only and reversible by deploy rollback alone
- Application: roll back to the previous image tag
- Document the manual steps if not automated

**6. Secrets documentation** — list every required secret, where it lives, and how to set it

## Two-lane pipeline shape

```yaml
# .github/workflows/ci.yml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: app
          POSTGRES_DB: app
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
      redis:
        image: redis:7
        ports: ["6379:6379"]
    defaults:
      run:
        working-directory: apps/api
    env:
      DATABASE_URL: postgresql+asyncpg://app:app@localhost:5432/app
      REDIS_URL: redis://localhost:6379/0
      JWT_SECRET: ci-jwt-secret-not-used-in-prod-xxxxxxxx
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
        with:
          enable-cache: true
      - name: Install
        run: uv sync --frozen
      - name: Lint
        run: uv run ruff check .
      - name: Format check
        run: uv run ruff format --check .
      - name: Type check
        run: uv run mypy .
      - name: Migrate
        run: uv run alembic upgrade head
      - name: Test
        run: uv run pytest
      - name: Export OpenAPI spec
        run: uv run python scripts/export_openapi.py > /tmp/openapi.json
      - name: Upload spec
        uses: actions/upload-artifact@v4
        with:
          name: openapi-spec
          path: /tmp/openapi.json

  web:
    runs-on: ubuntu-latest
    needs: api  # for the spec artifact
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
          cache-dependency-path: apps/web/pnpm-lock.yaml
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Download spec
        uses: actions/download-artifact@v4
        with:
          name: openapi-spec
          path: /tmp
      - name: Regenerate client
        run: pnpm exec openapi-typescript /tmp/openapi.json -o src/api/generated.d.ts
      - name: Verify client is up to date
        run: git diff --exit-code src/api/generated.d.ts
      - name: Lint
        run: pnpm lint
      - name: Type check
        run: pnpm typecheck
      - name: Test
        run: pnpm test
      - name: Build
        run: pnpm build

  release-gate:
    runs-on: ubuntu-latest
    needs: [api, web]
    if: github.ref == 'refs/heads/main'
    steps:
      - run: echo "Both lanes passed; deploy job is allowed to run."
```

## Why the lanes are coupled at the spec

The web lane `needs: api` not because the frontend depends on the backend at runtime in CI, but because the **frontend client is generated from the backend spec**. Without that ordering, the `git diff --exit-code` step has no spec to compare against. This is the catch-net for "engineer changed the backend but did not regenerate the client".

Do not try to remove the dependency by having the frontend export its own spec — there is no source of truth for the spec other than the running FastAPI app. See the `openapi-codegen` skill.

## Deploy stage shape

```yaml
deploy:
  needs: release-gate
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Build & push api image
      run: |
        docker build -f infra/api.Dockerfile -t $REGISTRY/api:${{ github.sha }} apps/api
        docker push $REGISTRY/api:${{ github.sha }}

    - name: Build & push web image
      run: |
        docker build -f infra/web.Dockerfile \
          --build-arg VITE_API_BASE_URL=$PROD_API_URL \
          -t $REGISTRY/web:${{ github.sha }} apps/web
        docker push $REGISTRY/web:${{ github.sha }}

    - name: Run migrations (one-shot job)
      run: |
        # Whatever orchestrator-specific command runs the api image with
        # `alembic upgrade head` as its CMD. Do NOT chain it into the
        # serving container's startup.
        ./infra/run-migrations.sh ${{ github.sha }}

    - name: Roll out api
      run: ./infra/rollout.sh api ${{ github.sha }}

    - name: Roll out web
      run: ./infra/rollout.sh web ${{ github.sha }}

    - name: Verify api
      run: |
        for i in {1..30}; do
          curl -fsS https://api.example.com/health/ready && exit 0
          sleep 2
        done
        exit 1

    - name: Verify web
      run: curl -fsS https://app.example.com/ > /dev/null
```

## Migrations are a separate step

`alembic upgrade head` runs as a **one-shot job before rollout**, not as part of the api container's `CMD`. Two reasons:

1. **Race condition.** If migrations run on container start, every replica races to acquire the Alembic advisory lock. The losers wait, then start late. Zero-downtime rollouts break.
2. **Rollback safety.** A failed migration must not leave a half-rolled-out fleet of new pods that the migration was supposed to support. Run migrations first; if they fail, abort the rollout entirely.

The migration job uses the same image as the serving container — only the command changes. See the `dockerfile/python.md` reference.

## Backwards-compatible migrations

For zero-downtime deploys, migrations must be backwards-compatible with the previous version of the application code, because for a brief window the old code is still running against the new schema. Concretely:

- **Adding columns:** always nullable (or with a server default), never `NOT NULL` without a default in the same migration.
- **Removing columns:** stop using them in code first, ship that, then drop in a follow-up.
- **Renaming columns:** add the new column → backfill → switch reads → switch writes → drop the old column (5 deploys).
- **Adding non-null constraints:** add nullable → backfill → enforce `NOT NULL` (3 migrations, ideally across 2 deploys).

If a migration cannot be made backwards-compatible (rare, usually only large data migrations), the rollout requires a maintenance window — flag this loudly in the PR.

## Common mistakes — and the responses

**"I'll merge the api and web jobs into one big job."**
Then a frontend lint failure blocks the backend signal and vice versa. Keep them parallel; let CI surface both failures at once.

**"I'll run codegen from the live dev server in CI."**
The export script (`apps/api/scripts/export_openapi.py`) does not need a running server. Use it. Spinning up uvicorn just to dump JSON is slower and flakier.

**"I'll just push to the registry and that's the deploy."**
Pushing an image is not deploying. Deploy means the service is running and accessible. Verification must hit `/health/ready` and `/`.

**"I'll run migrations from inside the api container on startup."**
Race conditions, broken zero-downtime, and you cannot abort a rollout when migrations fail. Run them as a one-shot job.

**"I'll add health checks later."**
Without verification, you don't know if the deploy succeeded. A health check is required immediately after deploy.

**"Rollback is complex, I'll skip it."**
Rollback is required. Either document the manual steps or implement auto-rollback. Production failures happen.

**"I'll assume people know what secrets to set."**
List every secret explicitly. Say where to configure them (GitHub repo secrets, environment variables, vault entries).

**"Staging is optional."**
For production safety, staging is required. Test on staging first, then promote to production.

## Red flags — stop and reassess

- You created a pipeline that builds/pushes but never deploys
- You have no health check or verification after deploy
- You have no rollback strategy (documented or automated)
- You didn't list the required secrets
- You're deploying straight to production with no staging
- The api and web lanes are merged into one job
- The web lane doesn't run `git diff --exit-code` on `src/api/generated.d.ts`
- Migrations are chained into the api container's `CMD`

## Checklist per pipeline

- [ ] Two parallel lanes: api (uv + ruff + mypy + alembic + pytest) and web (pnpm install + lint + typecheck + codegen + diff + test + build)
- [ ] Web lane `needs: api` for the openapi spec artifact
- [ ] `git diff --exit-code src/api/generated.d.ts` is part of the web lane
- [ ] Postgres + Redis service containers in the api lane
- [ ] Deploy stage builds and pushes both images
- [ ] Migrations run as a one-shot job, never as part of container start
- [ ] Verification stage hits `/health/ready` and `/`
- [ ] Rollback strategy documented or automated
- [ ] Secrets documented: list every secret, say where to configure
- [ ] Staging environment: test on staging before production (for production pipelines)
- [ ] Backwards-compatible migrations for zero-downtime deploys

## Secrets documentation format

At the end of your pipeline file or in a README, list:

```
Required secrets:
- REGISTRY_URL: container registry hostname
- REGISTRY_USERNAME / REGISTRY_PASSWORD: registry credentials
- DATABASE_URL: production Postgres connection string (asyncpg DSN)
- JWT_SECRET: JWT signing secret (32+ chars)
- OTEL_EXPORTER_OTLP_ENDPOINT: OpenTelemetry collector endpoint
- VITE_API_BASE_URL: build-time API URL injected into the web bundle

Setup:
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add each secret with the production value
3. Add staging equivalents under a `staging` environment
4. Verify with a test deploy to staging first
```
