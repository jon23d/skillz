# skillz — frontier-python-ts

OpenCode configuration for a **Python backend + TypeScript frontend** stack. Contains skills, tools, and agents for use with [OpenCode](https://opencode.ai).

This repo is designed to be cloned into `.opencode/` inside a project, or used as a global config at `~/.config/opencode/`. See [OpenCode config docs](https://opencode.ai/docs/config) for how config directories are resolved.

## Stack

The skills and agents in this repo target one specific stack. If your project does not match, adapt the skills before using them.

| Layer | Choice |
|---|---|
| Backend language | Python 3.12+ |
| Backend framework | FastAPI |
| Backend ORM | SQLAlchemy 2.0 (async) |
| Backend migrations | Alembic |
| Backend validation / settings | Pydantic v2, `pydantic-settings` |
| Backend package manager | `uv` |
| Backend jobs | arq (Redis-backed) |
| Backend lint / types | Ruff, ruff-format, mypy |
| Database | PostgreSQL |
| Frontend language | TypeScript |
| Frontend framework | React 18 + Vite |
| Frontend styling | Tailwind CSS + shadcn/ui |
| Frontend router | React Router v7 |
| Frontend data | TanStack Query |
| Frontend API client | `openapi-typescript` + `openapi-fetch`, generated from `/openapi.json` |
| Frontend package manager | `pnpm` |
| Frontend forms | `react-hook-form` + `zod` |
| Frontend toasts / icons | `sonner`, `lucide-react` |
| E2E | Playwright |
| Containers | Docker (Python multi-stage + Vite/nginx multi-stage) |

**Not used in this harness:** Prisma, Mantine, TypeORM, BullMQ, Fastify, Express, TypeBox, Zod on the backend, any TypeScript-authored backend, any JavaScript-authored database layer.

---

## Repository structure

```
skillz/
├── AGENTS.md                        # Global agent rules (read by all agents at startup)
├── README.md                        # This file
│
├── agents/
│   ├── build.md                     # Primary orchestrator agent
│   ├── solo.md                      # Lightweight solo agent (no delegation)
│   ├── architect.md                 # Planning-only agent
│   ├── backend-engineer.md          # FastAPI + SQLAlchemy implementation
│   ├── frontend-engineer.md         # Vite + shadcn implementation
│   ├── reviewer.md                  # Code review (quality / security / observability)
│   ├── qa.md                        # Playwright + OpenAPI spec verification
│   ├── devops-engineer.md           # Docker + CI/CD
│   ├── developer-advocate.md        # README, docker-compose, docs
│   └── notifier.md                  # Telegram notification
│
├── docs/
│   └── GITEA_SETUP.md               # tea CLI install and auth setup
│
├── skills/                            # See "Skills" section below for full list
│
└── tools/
    ├── package.json                  # Bun dependencies — installed automatically by OpenCode
    └── send-telegram.ts              # Telegram notification tool
```

---

## Prerequisites

Agents assume the `tea` CLI is installed and authenticated against your Gitea instance. That's all the setup required — no config files needed. The repo URL and default branch are read directly from git:

```bash
git remote get-url origin
git symbolic-ref refs/remotes/origin/HEAD
```

See `docs/GITEA_SETUP.md` for `tea` installation and authentication.

**Required environment variable:**

| Service | Env var |
|---|---|
| Gitea | `GITEA_ACCESS_TOKEN` |

---

## Tools

Tools are TypeScript files in `tools/` and run on Bun. OpenCode discovers them automatically and installs dependencies from `tools/package.json` at startup.

Issue and PR operations use the `tea` CLI directly — agents call `tea` via bash. See `skills/issue-tracker/SKILL.md` and `skills/pull-requests/SKILL.md`.

---

## Skills

Skills are `SKILL.md` files that agents load on demand using the built-in `skill` tool. Each skill contains step-by-step instructions for a specific type of task.

### Backend (Python — `apps/api/`)

| Skill | When to use |
|---|---|
| `fastapi` | Designing FastAPI routes, dependencies, lifespan, error handlers |
| `pydantic` | Designing Pydantic v2 request/response models and validators |
| `sqlalchemy` | Async SQLAlchemy 2.0 models, sessions, queries |
| `postgres-schema-design` | Schema design, Alembic migrations, indexing, constraints |
| `pydantic-settings` | Env var loading and validation via `pydantic-settings` |
| `rest-api-design` | REST conventions — naming, status codes, pagination, error formats |
| `multi-tenancy` | Tenant-scoped queries, dependency injection, RBAC |
| `arq` | Background jobs on arq (Redis-backed) |
| `stripe` | Stripe Python SDK, webhook signature verification, subscription sync |
| `observability` | structlog, OpenTelemetry, Prometheus metrics, health endpoints |
| `python-linting` | Ruff, ruff-format, mypy configuration and enforcement |

### Frontend (TypeScript — `apps/web/`)

| Skill | When to use |
|---|---|
| `vite-react` | Vite project structure, env vars, aliases, build config |
| `effective-typescript` | TypeScript discipline — no `any`, no unchecked casts, strict tsconfig |
| `ui-design` | Tailwind + shadcn/ui conventions, spacing, tokens, layout |
| `tailwind` | Tailwind setup, token classes, base-4 spacing |
| `shadcn-ui` | Adding and customising shadcn components |
| `tanstack-query` | Server state with TanStack Query — hooks, mutations, cache keys |
| `openapi-codegen` | Generating the TypeScript client from FastAPI's `/openapi.json` |
| `frontend-design` | Page / route / component structure conventions |
| `frontend-linting` | ESLint, Prettier, typecheck config |
| `playwright-e2e` | Playwright E2E tests for real-browser scenarios only |

### Cross-cutting

| Skill | When to use |
|---|---|
| `tdd` | Any coding task — write failing test first, then implement |
| `outside-in-double-loop` | Any multi-module feature — stub behind the user-facing surface first |
| `monorepo-development` | Polyglot `apps/api/` + `apps/web/` layout, root Makefile, shared `.env` |
| `dockerfile` | Writing production Dockerfiles (see `python.md` and `node.md`) |
| `cicd-pipeline-creation` | Two-lane CI pipeline with OpenAPI spec handoff |
| `kubernetes-manifests` | Kubernetes manifests (only after DevOps confirmation) |
| `from-scratch-run` | Verifying a clean checkout can be installed and run |
| `issue-tracker` | Reading, creating, updating, searching, or commenting on issues |
| `pull-requests` | Opening PRs, writing PR bodies, embedding screenshots |
| `pipeline-watch` | Monitoring CI checks after a PR is opened |
| `writing-tickets` | Writing well-scoped issue/ticket descriptions |
| `writing-skills` | Creating or improving skill files (meta-skill) |
| `human-readable-docs` | Writing docs a new engineer can actually follow |
| `system-knowledge` | Capturing hard-won operational knowledge |
| `telegram-notification` | Sending notifications via Telegram |

---

## Agents

### `build` (primary orchestrator)

The default agent. Handles the full feature development lifecycle:

1. **Understand** — reads the ticket, confirms git remote
2. **Scoping checkpoint** — presents a proposed agent plan to the user as plain text and waits for approval before starting any work
3. **Setup** — creates the feature branch from the repo root, renames the session
4. **Execute** — delegates to specialist agents in sequential waves:
   - Wave 1: `@architect` (optional, for complex tasks)
   - Wave 2: `@backend-engineer` (then `@frontend-engineer` once backend passes review)
   - Wave 3: `@reviewer` (invoked by engineers — covers code quality, security, and observability)
   - Wave 4: `@qa` + `@devops-engineer` in parallel
   - Wave 5: `@developer-advocate`
   - Wave 6: PR, `@notifier`

The build agent has no bash access and does not write code. It scopes, delegates, enforces quality gates, and reports.

---

## AGENTS.md

`AGENTS.md` at the repo root sets global rules for all agents. Key rules:

- Never read, glob, search, or write to `~/.opencode/skills` or any opencode system path
- All skill files live in the current project directory only
- Test code for skill testing goes in `test/<skill-name>/` and is cleaned up after
- Skills are output documents, not instructions to follow in the current session

---

## Adding a new skill

1. Create `skills/<skill-name>/SKILL.md`
2. Add a YAML frontmatter block with `name` and `description` fields
3. Write the skill body following the conventions in `skills/writing-skills/SKILL.md`
4. Test it in an opencode session: load the skill manually and run through test prompts

---

## Adding a new tool

1. Create `tools/<tool-name>.ts`
2. Use the `tool()` helper from `@opencode-ai/plugin`
3. Export as default (single tool) or named exports (multiple tools, named `<file>_<export>`)
4. If the tool needs a new npm dependency, add it to `tools/package.json`
5. Secrets are read from environment variables only

See `tools/send-telegram.ts` for a working example.
