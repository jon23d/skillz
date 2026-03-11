---
name: openapi-codegen
description: Use whenever a backend endpoint is created or modified, or whenever a frontend needs to call an API. Covers spec-first contract design, running openapi-typescript codegen, monorepo package structure, and the service/hook layer that wraps the generated client. The generated client is the only permitted way to call backend endpoints.
---

# OpenAPI Codegen — Type-Safe API Contracts

This skill enforces a spec-first, codegen-driven contract between backend and frontend packages in a monorepo. The OpenAPI spec is the source of truth. The generated client is the only way the frontend calls the backend. Hand-written types for API shapes are never acceptable.

---

## Toolchain

```bash
# Type generation (dev dependency, monorepo root or api-client package)
npm install -D openapi-typescript

# Typed fetch client (runtime dependency in frontend packages)
npm install openapi-fetch
```

- **`openapi-typescript`** — generates a `paths` and `components` type tree from your spec. Zero runtime footprint.
- **`openapi-fetch`** — a tiny fetch wrapper that binds to those generated types, giving you end-to-end type safety on every request and response.

---

## Monorepo Structure

```
packages/
  api-client/               # Shared package — generated types + typed client factory
    src/
      generated.d.ts        # AUTO-GENERATED. Never edit by hand.
      index.ts              # Exports the configured client instance
    package.json
apps/
  api/                      # Backend
    openapi.yaml            # Source of truth for the entire API contract
  web/                      # Frontend (or mobile/, admin/, etc.)
    src/
      services/             # Service layer — wraps api-client, returns domain types
      hooks/                # Custom hooks — wrap services via TanStack Query
```

`packages/api-client/src/generated.d.ts` is always auto-generated. It must be gitignored or committed as a build artifact depending on your CI strategy — but it is **never hand-edited**.

---

## The OpenAPI Spec (Auto-Generated)

The spec is auto-generated from the backend's route definitions and validation schemas — it is never hand-authored. The backend framework (e.g. Fastify with `@fastify/swagger`, Hono with `zod-openapi`, Elysia with its OpenAPI plugin) derives the spec directly from the same TypeBox/Zod schemas used for runtime validation, and exposes it at a well-known endpoint (typically `/docs/json`).

This means **the validation schema is the source of truth**, not a YAML file. The spec is a derived artifact of the schema. There is no way for the spec to drift from the implementation — if the schema changes, the spec changes automatically.

**What this requires of backend engineers:**

- Every route must be decorated with enough schema information for the framework to generate a complete spec entry: request params/body shape, all response shapes (including errors), and auth requirements.
- Every route must have an `operationId`. Codegen uses it as the basis for generated type names — without it, types get ugly auto-generated names.
- Error response schemas must be registered as named components (not inlined) so they appear consistently across the generated spec and can be referenced in the frontend's error handling.

Example (Fastify + TypeBox):

```typescript
fastify.get('/users/:id', {
  schema: {
    operationId: 'getUserById',
    params: Type.Object({ id: Type.String() }),
    response: {
      200: UserSchema,
      404: ErrorResponseSchema,
      401: ErrorResponseSchema,
    },
    security: [{ bearerAuth: [] }],
  },
}, handler);
```

The spec is then available at runtime (`GET /docs/json`) and can also be exported as a static file during the build step for use in CI and codegen.

---

## Generation Script

The spec is served by the running backend at `/docs/json` (or equivalent). Codegen fetches it directly from that URL, or from a static snapshot exported during the build step.

**Option A — from the running dev server (local development):**

```json
{
  "scripts": {
    "codegen": "openapi-typescript http://localhost:3000/docs/json -o ./packages/api-client/src/generated.d.ts"
  }
}
```

**Option B — from a static export (CI / no running server required):**

```json
{
  "scripts": {
    "export-spec": "node ./apps/api/scripts/export-spec.ts",
    "codegen": "npm run export-spec && openapi-typescript ./apps/api/openapi.json -o ./packages/api-client/src/generated.d.ts"
  }
}
```

The export script boots the app just enough to call `fastify.inject('/docs/json')` (or equivalent) and write the response to a file. This avoids needing a running server in CI.

**Run codegen:**

```bash
npm run codegen
```

Codegen must be run after any backend schema or route change, and the generated file committed alongside the backend change. The two must always move together.

---

## The Typed Client (`packages/api-client/src/index.ts`)

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './generated';

// Export the typed client — one instance, configured once.
export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  credentials: 'include',
});

// Re-export generated types for use in service files
export type { paths, components } from './generated';
```

The client instance is exported from `@myapp/api-client`. Services import it. Nothing else does.

---

## Service Layer (`apps/web/src/services/`)

Services wrap the typed client and return domain-typed objects. They never expose raw `response` objects or `any`.

```typescript
// apps/web/src/services/userService.ts
import { apiClient } from '@myapp/api-client';
import type { components } from '@myapp/api-client';

export type User = components['schemas']['User'];

export async function fetchUser(id: string): Promise<User> {
  const { data, error } = await apiClient.GET('/users/{id}', {
    params: { path: { id } },
  });

  if (error) throw new Error(error.message ?? 'Failed to fetch user');
  return data;
}

export async function updateUser(
  id: string,
  body: components['schemas']['UpdateUserInput'],
): Promise<User> {
  const { data, error } = await apiClient.PATCH('/users/{id}', {
    params: { path: { id } },
    body,
  });

  if (error) throw new Error(error.message ?? 'Failed to update user');
  return data;
}
```

**Rules:**
- Import `apiClient` from `@myapp/api-client` — never from a relative path outside the package.
- Always destructure `{ data, error }` — never access `response` directly.
- Throw a typed error if `error` is present; never silently return `undefined`.
- Return types must be derived from `components['schemas']` — never hand-written.

---

## Hook Layer (`apps/web/src/hooks/`)

Custom hooks wrap services using TanStack Query. Components import only hooks.

```typescript
// apps/web/src/hooks/useUser.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUser, updateUser } from '@/services/userService';
import type { User } from '@/services/userService';

export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
};

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => fetchUser(id),
    enabled: !!id,
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Parameters<typeof updateUser>[1]) =>
      updateUser(id, body),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(userKeys.detail(id), updatedUser);
    },
  });
}
```

---

## The Full Contract (Summary)

```
openapi.yaml          ← backend writes this first (spec-first)
     ↓  npm run codegen
generated.d.ts        ← never touch
     ↓  imported by
apiClient             ← one instance in @myapp/api-client
     ↓  imported by
services/             ← transform API calls into typed domain functions
     ↓  imported by
hooks/                ← wrap services in TanStack Query
     ↓  imported by
components            ← consume only hooks, never anything below
```

Any shortcut in this chain — a component calling `fetch` directly, a service hand-writing a type, a hook bypassing the generated client — is a contract violation and must be caught in code review.

---

## Backend Engineer Responsibilities

1. **Design schemas before writing handlers.** The TypeBox/Zod schema is the design artifact. Handler logic follows from it.
2. **Fully decorate every route** — `operationId`, all request shapes, all response shapes (including errors), auth. An incomplete route decoration is an incomplete contract.
3. **Run codegen after any route or schema change** and commit the updated `generated.d.ts` in the same commit as the backend change.
4. **Never change a response schema without treating it as a breaking change** — even additive changes (new optional fields) should be flagged to frontend consumers explicitly.

---

## Frontend Engineer Responsibilities

1. **Run codegen before writing any code** that touches a new or modified endpoint. If the spec hasn't been updated yet, block — don't hand-write types and patch later.
2. **Regenerate the client** whenever you pull changes that include spec updates.
3. **TypeScript errors from the generated types are intentional signals.** If `apiClient.GET(...)` fails to compile, the spec and implementation disagree — resolve it, don't cast your way out.
4. **Never add the generated file to your editor's ignore list.** You need to see when codegen produces unexpected output.

---

## CI Integration

Add two checks to your pipeline:

```yaml
# .github/workflows/ci.yml (or equivalent)

- name: Export OpenAPI spec from backend
  run: npm run export-spec

- name: Verify generated client is up to date
  run: |
    npm run codegen
    git diff --exit-code packages/api-client/src/generated.d.ts
```

The first step exports the live spec from the backend (without needing a running server). The second regenerates the client from that spec and fails if the committed generated file differs from what codegen produces now. This catches backend changes that didn't update the client, and client updates that weren't regenerated from the current spec.

Both the exported spec snapshot and the generated `generated.d.ts` should be committed to the repo so this diff check is meaningful.
