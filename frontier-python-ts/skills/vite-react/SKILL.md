---
name: vite-react
description: Use whenever creating or modifying a Vite + React + TypeScript frontend in this harness. Covers project skeleton, env vars, react-router-v7, build/dev commands, project structure, and the data-fetching architecture (TanStack Query + openapi-fetch + service layer). Pairs with `tailwind`, `shadcn-ui`, `tanstack-query`, `openapi-codegen`, and `frontend-linting`.
---

# Vite + React + TypeScript

This is the only frontend stack in this harness. Every web app is **Vite + React 18 + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router v7**. There are no Next.js apps, no Mantine apps, no CRA apps.

## Bootstrap

```bash
pnpm create vite@latest web -- --template react-ts
cd web
pnpm install
pnpm add react-router-dom @tanstack/react-query openapi-fetch
pnpm add -D openapi-typescript @tanstack/react-query-devtools
```

Then:

1. Set up Tailwind — see the `tailwind` skill.
2. Set up shadcn/ui — see the `shadcn-ui` skill.
3. Set up linting — see the `frontend-linting` skill.
4. Wire up the typed API client — see the `openapi-codegen` skill.

## Project structure

```
web/
  index.html
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  eslint.config.ts
  .env.example
  src/
    main.tsx                 # entry: QueryClientProvider, RouterProvider
    router.tsx               # route definitions
    api/
      client.ts              # openapi-fetch client + generated types re-export
      generated.d.ts         # AUTO-GENERATED. Never edit by hand.
    services/                # one file per resource — wraps the typed client
      userService.ts
    hooks/                   # TanStack Query hooks — wrap services
      useUser.ts
    components/
      ui/                    # shadcn/ui-generated components live here
      layout/
      <feature>/
    routes/                  # one file per route component
      Home.tsx
      Dashboard.tsx
    lib/
      utils.ts               # cn() helper from shadcn
    test/
      setup.ts               # vitest setup (RTL + jest-dom)
```

Rules:

- **Routes are pages, components are reusable.** A `routes/Dashboard.tsx` composes children from `components/dashboard/`.
- **`src/api/`** is the only place that imports from `openapi-fetch` or `generated.d.ts`. Everywhere else imports from `src/services/`.
- **`src/services/`** is the only place that calls `apiClient.GET/POST/...`. Components and hooks never call it directly.
- **Tests live next to the file they test:** `Foo.tsx` + `Foo.test.tsx`. Not in a parallel `__tests__/` tree.

## `vite.config.ts`

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api to the FastAPI dev server during local development.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
})
```

`@/` is the only path alias. Update `tsconfig.app.json` to match:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

## Environment variables

Vite exposes only env vars prefixed with `VITE_`. Read them through a tiny typed module — never `import.meta.env` directly outside that module.

```ts
// src/env.ts
const requireEnv = (name: string): string => {
  const value = import.meta.env[name]
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value as string
}

export const env = {
  apiBaseUrl: requireEnv("VITE_API_BASE_URL"),
  appName: import.meta.env.VITE_APP_NAME ?? "myapp",
} as const
```

```bash
# .env.example
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=myapp
```

The dev proxy in `vite.config.ts` lets you set `VITE_API_BASE_URL=` (empty) for local dev so requests go to `/api/...` and Vite forwards them to FastAPI. In production, set it to the absolute API URL.

## React Router v7

React Router v7 is the only router in this harness. Use the data-router APIs (`createBrowserRouter`), not the old `<BrowserRouter>` wrapper.

```ts
// src/router.tsx
import { createBrowserRouter } from "react-router-dom"
import { RootLayout } from "@/components/layout/RootLayout"
import { Home } from "@/routes/Home"
import { Dashboard } from "@/routes/Dashboard"
import { ProjectDetail } from "@/routes/ProjectDetail"
import { NotFound } from "@/routes/NotFound"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "projects/:projectId", element: <ProjectDetail /> },
    ],
  },
])
```

```ts
// src/main.tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import { queryClient } from "@/lib/queryClient"
import { router } from "@/router"
import "@/index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

Rules:

- **`createBrowserRouter`, not `<BrowserRouter>`.** The data-router APIs are the future and unlock loaders, actions, and `useNavigation()`.
- **Use `useParams<{ projectId: string }>()`** with explicit type parameters — never untyped params.
- **Never use TanStack Query inside a loader.** Loaders run before render; TanStack Query lives in components. Pick one or the other for any given route — for this harness, **use TanStack Query in components**, not loaders. The router is for navigation, not data fetching.
- **Errors at every route level.** Set `errorElement` on the root and on any route that has special error UI.

## Data fetching architecture (non-negotiable)

This is the same architecture as the `openapi-codegen` skill describes:

```
openapi.json (FastAPI)  ← source of truth
        ↓ pnpm codegen
generated.d.ts          ← never touch
        ↓ imported by
src/api/client.ts       ← apiClient = createClient<paths>(...)
        ↓ imported by
src/services/*.ts       ← typed functions, throw on error
        ↓ imported by
src/hooks/use*.ts       ← TanStack Query hooks (only when complex)
        ↓ imported by
components              ← consume hooks (or inline a useQuery for simple cases)
```

Rules (enforced by the reviewer):

- **No `fetch`/`axios` calls in components.** Only `src/services/` calls the typed client.
- **No hand-written API types.** All types come from `generated.d.ts` via `components['schemas']`.
- **No `useState` + `useEffect` for server data.** Use `useQuery` / `useMutation`.
- **Inline `useQuery` is fine for simple cases.** Extract to a custom hook only when the query needs polling, optimistic updates, dependent queries, or complex cache invalidation.

## Build and dev commands

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest",
  "codegen": "openapi-typescript http://localhost:8000/openapi.json -o ./src/api/generated.d.ts"
}
```

## Testing

Vitest + React Testing Library + MSW. See the `tdd` skill for the full methodology.

```ts
// vite.config.ts (test section)
test: {
  globals: true,
  environment: "jsdom",
  setupFiles: ["./src/test/setup.ts"],
}
```

```ts
// src/test/setup.ts
import "@testing-library/jest-dom/vitest"
```

## Common mistakes

- **Importing from `@vitejs/plugin-react-swc`** — `@vitejs/plugin-react` is the standard. SWC is fine but adds variance for no benefit.
- **`process.env.X` in browser code** — Vite does not polyfill `process`. Use `import.meta.env.VITE_*` via the `env.ts` module.
- **Forgetting `tsc -b` in the build script** — Vite does not type-check. The build will succeed with type errors unless `tsc -b` runs first.
- **Using `<BrowserRouter>`** — old API. Use `createBrowserRouter`.
- **Putting query logic in router loaders** — pick one, and we picked TanStack Query in components.
- **Creating `<App>` as a router wrapper** — `RouterProvider` is the root, period.
- **Importing from `react-router`** — use `react-router-dom`.
