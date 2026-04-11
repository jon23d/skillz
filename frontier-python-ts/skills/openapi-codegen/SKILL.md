---
name: openapi-codegen
description: Use whenever a backend endpoint is created or modified, or whenever the frontend needs to call an API, or when verifying that the OpenAPI spec matches the running API. Backend services in this harness are FastAPI — the OpenAPI spec is auto-generated from Pydantic models, no codegen runs on the backend. The frontend uses openapi-typescript + openapi-fetch to generate a typed client from the running FastAPI's /openapi.json. Covers the full contract, the service/hook layer, and spec verification.
---

# OpenAPI Codegen — Type-Safe API Contracts

This skill enforces a spec-first, codegen-driven contract between the FastAPI backend and the Vite + React frontend. **The OpenAPI spec is the source of truth.** The generated client is the only way the frontend calls the backend. Hand-written types for API request/response shapes are never acceptable on the frontend.

The crucial property: there is **no codegen step on the backend**. FastAPI generates `/openapi.json` from your Pydantic models and route signatures at runtime. The frontend pulls from there.

---

## The contract, top to bottom

```
Pydantic models + FastAPI routes
        ↓ (FastAPI generates at runtime)
GET /openapi.json
        ↓ pnpm run codegen   (openapi-typescript)
src/api/generated.d.ts        ← never touch
        ↓ imported by
src/api/client.ts             ← apiClient = createClient<paths>(...)
        ↓ imported by
src/services/*.ts             ← typed functions, throw on error
        ↓ imported by
src/hooks/use*.ts             ← TanStack Query hooks (optional layer)
        ↓ imported by
React components              ← consume hooks (or inline a useQuery)
```

Any shortcut in this chain is a contract violation.

---

## Backend responsibilities (FastAPI)

You do not run a codegen tool on the backend. You make sure your routes give FastAPI enough information to produce a complete spec.

For every route:

1. **Use a Pydantic schema for the request body, query params, and path params.** No raw `dict` parameters.
2. **Set `response_model=...` on the route decorator.** This is what FastAPI uses to populate the success-response schema, and it strips fields not in the schema.
3. **Set `status_code=` on the decorator.** `200` is the default; set the right code (`201` for create, `204` for delete with no body) explicitly.
4. **Document non-success responses with `responses=`** so the frontend knows what error shapes to expect:
   ```python
   @router.get(
       "/{user_id}",
       response_model=UserRead,
       responses={
           404: {"model": ErrorResponse, "description": "User not found"},
           401: {"model": ErrorResponse, "description": "Not authenticated"},
       },
   )
   ```
5. **Set `tags=[...]`** on the router so the spec groups endpoints by resource.
6. **Set `summary=` and `description=`** on important routes — they become the docstrings in the generated client.
7. **Use a stable `operation_id`** when the auto-generated one would be ugly:
   ```python
   @router.get("/{user_id}", response_model=UserRead, operation_id="get_user_by_id")
   ```
   Without this, the frontend client method names depend on FastAPI's defaults, which include the function name and the router prefix — and changing either breaks frontend imports.

That is the entire backend contribution. There is no `npm run codegen` to run on the backend side, no hand-authored `openapi.yaml` to maintain, no TypeBox decorators.

See the `fastapi` and `pydantic` skills for the full route and schema patterns.

---

## Frontend toolchain

```bash
# Type generation (dev dependency)
pnpm add -D openapi-typescript

# Typed fetch client (runtime dependency)
pnpm add openapi-fetch
```

- **`openapi-typescript`** — generates a `paths` and `components` type tree from the spec. Zero runtime footprint.
- **`openapi-fetch`** — a tiny `fetch` wrapper that binds to those generated types. End-to-end type safety on every request and response.

---

## The generation script

```json
"scripts": {
  "codegen": "openapi-typescript http://localhost:8000/openapi.json -o ./src/api/generated.d.ts"
}
```

The codegen target is the **running FastAPI dev server**. Start the backend with `uv run uvicorn app.main:app --reload` before running `pnpm codegen`.

For CI (where running the backend just to dump the spec is awkward), add a tiny script to the backend that exports the spec to a file:

```python
# apps/api/scripts/export_openapi.py
import json
import sys

from app.main import create_app


def main() -> None:
    app = create_app()
    json.dump(app.openapi(), sys.stdout, indent=2)


if __name__ == "__main__":
    main()
```

Then in CI:

```yaml
- name: Export OpenAPI spec
  working-directory: apps/api
  run: uv run python scripts/export_openapi.py > /tmp/openapi.json

- name: Generate frontend client
  working-directory: apps/web
  run: pnpm exec openapi-typescript /tmp/openapi.json -o src/api/generated.d.ts

- name: Verify generated client is up to date
  working-directory: apps/web
  run: git diff --exit-code src/api/generated.d.ts
```

The CI step that fails on `git diff --exit-code` is what catches "engineer changed the backend but did not regenerate the client".

---

## The typed client (`src/api/client.ts`)

```ts
import createClient from "openapi-fetch"
import type { paths } from "./generated"

import { env } from "@/env"

export const apiClient = createClient<paths>({
  baseUrl: env.apiBaseUrl,
  credentials: "include",          // send auth cookies
})

export type { paths, components } from "./generated"
```

One client instance per app. Do not create new clients in services.

---

## Service layer (`src/services/`)

Services wrap the typed client and return typed domain objects. They **never expose raw response objects, `null`, or `any`**, and they **always throw on error**.

```ts
// src/services/userService.ts
import { apiClient } from "@/api/client"
import type { components } from "@/api/client"

export type User = components["schemas"]["User"]
export type UserCreate = components["schemas"]["UserCreate"]

export async function fetchUser(id: string): Promise<User> {
  const { data, error } = await apiClient.GET("/api/v1/users/{user_id}", {
    params: { path: { user_id: id } },
  })
  if (error) throw new Error(error.detail ?? "Failed to fetch user")
  return data
}

export async function createUser(payload: UserCreate): Promise<User> {
  const { data, error } = await apiClient.POST("/api/v1/users", { body: payload })
  if (error) throw new Error(error.detail ?? "Failed to create user")
  return data
}
```

Rules:

- **Always destructure `{ data, error }`.** `openapi-fetch` returns both — never assume success.
- **Throw on error.** TanStack Query handles thrown promises correctly.
- **Derive types from `components["schemas"]`.** Never write `interface User { ... }` by hand.
- **Path params go through the typed `params.path` object.** Never template-string the URL: `` `/users/${id}` `` defeats the type checker.
- **No service file imports another service.** If two services share logic, the shared logic lives in `src/lib/`.

---

## Hook layer (`src/hooks/`)

Custom hooks wrap services with TanStack Query. **Extract a hook only when it earns its existence** — see the rule in the `vite-react` skill.

```ts
// src/hooks/useUser.ts
import { useQuery } from "@tanstack/react-query"

import { fetchUser } from "@/services/userService"

export const userKeys = {
  all: ["users"] as const,
  detail: (id: string) => ["users", "detail", id] as const,
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => fetchUser(id),
    enabled: !!id,
  })
}
```

For a one-shot inline call, skip the hook:

```tsx
function ProjectName({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => fetchProject(id),
  })
  if (isLoading) return <Skeleton />
  return <>{data?.name}</>
}
```

A pass-through `useProject` wrapper around a single inline `useQuery` is indirection without value. Extract when the query has polling, optimistic updates, dependent queries, or non-trivial cache invalidation.

---

## Backend Engineer responsibilities (recap)

1. Design Pydantic schemas before writing handlers.
2. Set `response_model`, `status_code`, `tags`, `responses`, and `operation_id` on every route.
3. After any route or schema change, restart the dev server so `/openapi.json` reflects the change. **You do not run `npm run codegen` from the backend repo.**
4. Treat schema changes as breaking changes. Flag them explicitly when reporting back.

## Frontend Engineer responsibilities

1. Run `pnpm codegen` before writing any code that touches a new or modified endpoint. The backend dev server must be running for the codegen target to be reachable.
2. Regenerate the client whenever you pull changes that include backend route or schema updates.
3. TypeScript errors from the generated types are intentional signals — resolve them, never `as any` them away.

---

## Spec verification (QA)

When verifying that the spec matches the running API:

### Locating the spec

The spec is always at `/openapi.json` on the running FastAPI app. There is no file to find on disk. Start the backend, then `curl http://localhost:8000/openapi.json | jq`.

### Starting the dev server

`cd apps/api && uv run uvicorn app.main:app --port 8000` in the background. Poll the base URL every 2 seconds for up to 30 seconds. Always stop the server when finished.

### Authentication token

Attempt in order: `TEST_AUTH_TOKEN` / `API_TOKEN` / `AUTH_TOKEN` env vars → `.env.test` / `.env.local` / `.env.example` credentials → README test credentials → graceful degradation (verify protected endpoints return 401/403 without a token).

### Verification steps per changed endpoint

1. **Endpoint exists in spec** — path and method documented under `paths.<path>.<method>`. Missing = `major`.
2. **Request shape matches** — `requestBody.content.application/json.schema` matches the Pydantic model. Path/query parameters listed under `parameters[]`.
3. **Response shape matches** — `responses.<status>.content.application/json.schema` matches what the running app actually returns. Mismatch = `major`.
4. **Status codes match** — success, 4xx, and 5xx codes documented. Undocumented status code = `major`.
5. **Auth requirements match** — spec marks the endpoint as secured, and the running app actually returns 401/403 without credentials. Mismatch = `major`.

**Ignore:** minor formatting differences, optional fields present in the response, endpoints not changed in this task.

### Documentation UI verification

FastAPI ships two documentation UIs by default: **Swagger UI** at `/docs` and **ReDoc** at `/redoc`. Verify at least one returns HTML and references the same operations as `/openapi.json`. If both have been disabled in the FastAPI factory (`docs_url=None, redoc_url=None`), confirm that disabling was intentional in the codebase rather than missing.

**Ignore:** visual styling, auth on the docs endpoints themselves.

---

## Common mistakes

- **Hand-writing types in the frontend** — `interface User { ... }`. Always `components["schemas"]["User"]`.
- **`fetch("/api/v1/users")`** in a component — bypasses the typed client. Reviewer should reject.
- **Forgetting `response_model` on a FastAPI route** — the generated frontend client gets `unknown` for the response, which propagates everywhere.
- **Forgetting `operation_id`** — a refactor that renames the handler function silently changes the generated client method names.
- **Running `pnpm codegen` against a stale dev server** — restart `uvicorn` after backend changes.
- **Casting away type errors with `as any`** — every cast is a future bug. Fix the underlying mismatch.
- **Adding a new endpoint without rerunning codegen** — the `git diff --exit-code` step in CI is the catch-net. Run codegen before pushing.
