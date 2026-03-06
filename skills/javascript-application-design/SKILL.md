---
name: javascript-application-design
description: Use when starting a new JavaScript or TypeScript project, adding dependencies, configuring tooling, or making architectural decisions in a JS/TS codebase.
---

# JavaScript Application Design

## Non-negotiable defaults

- **Module system: ESM only.** `"type": "module"` in `package.json`. Never `require()`, `module.exports`, or `.cjs` files.
- **Language: TypeScript with strict mode.** Every project has `tsconfig.json` with `"strict": true`. No `any`. No `@ts-ignore` without a comment and a ticket to fix it.
- **Package manager:** Use whatever the project already uses (`npm`, `pnpm`, `yarn`, `bun`). For new projects, choose based on team preference — there is no universal mandate. Never switch a project's package manager mid-stream.
- **Runtime: Node.js** unless the project explicitly targets another runtime.

## Project initialisation

For a new project:
1. Create `package.json` with `"type": "module"` and `"engines": { "node": ">=20" }`
2. Install TypeScript; configure `tsconfig.json` with strict mode
3. Install and configure ESLint and Prettier
4. Create `.nvmrc` or `.node-version` with the target Node.js version
5. Create `.gitignore` excluding `node_modules`, `dist`, `.env`, and build artefacts
6. Commit the lockfile — never `.gitignore` it

## TypeScript configuration

Base `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

For bundled projects (Vite, tsup), set `"noEmit": true` — the bundler handles output. For Next.js, extend the generated tsconfig rather than replacing it.

## ESLint and Prettier

Use the flat config format (`eslint.config.js`), not the legacy `.eslintrc` format. Prefer `typescript-eslint` with strict type-checked rules and `eslint-config-prettier` to avoid conflicts.

Prettier config (`.prettierrc.json`):
```json
{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

Standard scripts in `package.json`:
```json
"lint": "eslint .",
"format": "prettier --write .",
"typecheck": "tsc --noEmit"
```

## Dependency management

- Type definitions, test frameworks, linters, bundlers: always `devDependencies`
- Evaluate before adding: is this already in the stdlib or an existing dependency? Is it maintained? What is its size impact?
- Do not add a dependency for a problem solvable in 5–10 lines of code

## Scripts convention

Every project:
```json
{
  "build": "...",
  "dev": "...",
  "test": "...",         
  "lint": "eslint .",
  "format": "prettier --write .",
  "typecheck": "tsc --noEmit"
}
```

## Testing

Use **Vitest** for unit and integration tests — faster than Jest, native ESM support, compatible API.

## Per application type

**React SPA** — Vite as bundler; `"type": "module"`; environment variables prefixed `VITE_` are client-exposed (never put secrets there); generate API types from the OpenAPI spec using `openapi-typescript` — never hand-write types for API shapes.

**Next.js / SSR** — App Router for new projects; Server Components by default; only add `'use client'` when interactivity or browser APIs are needed; `NEXT_PUBLIC_` prefix exposes variables to the client.

**REST API** — no bundler; compile with `tsc`; keep `app.ts` (configured app, no listen call) separate from `server.ts` (entry point) so the app is importable in tests without binding a port; use `zod` for request validation at every route boundary.

**CLI tools** — `tsup` as bundler; shebang in the entry file; `"bin"` field in `package.json`; use `commander` or `citty` for argument parsing; keep the CLI entry thin and delegate to injectable service functions.

## Environment variables

Validate all environment variables at startup with a schema library (zod, joi, etc.). Export a validated config object and import from it everywhere. If a required variable is missing, the app fails at startup with a clear error — not silently at runtime.

```typescript
// src/lib/env.ts
import { z } from 'zod'
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
})
export const env = EnvSchema.parse(process.env)
```

Commit `.env.example` (no real values) as documentation. Never commit `.env`.
