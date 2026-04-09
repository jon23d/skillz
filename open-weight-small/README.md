# open-weight-small

An OpenCode agent harness for building production-quality SaaS platforms using small open-weight models running locally.

## Objective

Replicate the quality and discipline of the `frontier/` harness — wave-based orchestration, role separation, quality gates, TDD — without relying on large frontier models (Claude, GPT-4, etc.).

The target outcome: run 5–10 concurrent feature tickets in parallel on a single machine, each handled by a small model, rather than one ticket at a time on a large model.

**Hardware:** Mac Studio, 512GB RAM, running [LM Studio](https://lmstudio.ai) as a local OpenAI-compatible inference server.

---

## Models

All models are from the Qwen3 family, served via LM Studio at `http://192.168.50.146:1234/v1`.

| Model | Active params | Role |
|-------|--------------|------|
| `qwen3.5-35b-a3b` | ~3B (MoE) | Primary workhorse — scaffolder, implementer |
| `qwen3-8b` | 8B (dense) | Reviewer, spec checker, lightweight tasks |
| `qwen3-1.7b` | 1.7B | Small model for quick utility tasks |

### Why MoE?

The Qwen3.5 MoE models (35B-A3B, 122B-A10B) have a large parameter count for quality but only activate a fraction per forward pass. The 35B-A3B uses ~3B active parameters, consuming roughly 15–20GB RAM at Q8 — meaning many instances can run concurrently on 512GB.

---

## Sampling Parameters

These are the recommended parameters from the Qwen3 documentation for **instruct (non-thinking) mode**. Applied to all models in `opencode.json`.

| Parameter | Value | Notes |
|-----------|-------|-------|
| `temperature` | `0.6` | Per-agent; set in agent frontmatter |
| `top_p` | `0.8` | |
| `top_k` | `20` | |
| `min_p` | `0.0` | |
| `presence_penalty` | `1.5` | Discourages settling at natural stopping points |

> **Note:** LM Studio may not surface `presence_penalty` in its UI, but accepts it via the OpenAI-compatible API.

### Context window

LM Studio is configured to the model's maximum supported context: **262,144 tokens** (256k). Set this in LM Studio under Model → Load → Context and Offload.

---

## Findings

### Stopping behavior

**Problem:** The scaffolder agent stopped partway through, requiring user prompts ("Are you done?") to continue. At the point of stopping, only ~42k of 128k context tokens had been used — context exhaustion was not the cause.

**Root cause:** `temperature: 0.1` was too conservative. The model completed a logical chunk (a group of files, or a shell command), generated a natural-sounding completion sentence, and treated that as the end of its turn. It was stopping at prose boundaries, not running out of capacity.

**Fix:** Raise temperature to `0.6` (Qwen3 instruct recommendation) and add `presence_penalty: 1.5` to discourage the model from settling. Also added an explicit "do not stop, do not narrate" directive to the scaffolder agent.

### Custom checklists vs native task tool

An early version of the scaffolder agent included a verbose per-file checklist the model was instructed to maintain and re-output. This was removed after discovering OpenCode provides a native task tracking tool that the model already uses. The custom checklist added prompt noise without benefit.

### Model choice for long sequential tasks

The 35B-A3B MoE model (3B active) is efficient for concurrent narrow tasks. For long-running sequential tasks requiring sustained coherence (like scaffolding), a dense model with more active parameters may perform better. The dense `qwen3-32b` (~32B active) is an option if the MoE model continues to show coherence degradation on long tasks.

---

## Architecture

### Design philosophy

Small models cannot reliably explore an unfamiliar codebase, hold multi-file context, and make good judgment calls simultaneously. The solution is to move intelligence from the model into the architecture:

- **Convention over exploration** — file locations are deterministic from a domain name. Agents don't need to "explore" the codebase; they know exactly where every file is.
- **Deterministic gates** — pipeline steps are gated by bash exit codes (tests pass or fail), not model verdicts. No model judgment needed to decide if a step succeeded.
- **Operator as architect** — the user does a 2–3 minute domain Q&A per feature to define schemas and scope. Small models then execute the implementation mechanically. The user spends more time per feature but can run many in parallel.
- **Narrow task scope** — each agent invocation touches one domain in one layer. A model implementing `packages/api/invoice/service.py` has a small, bounded context requirement.

### Target project structure

Every scaffolded project follows this layout:

```
{project}/
├── justfile                     # Command runner (see: just --list)
├── docker-compose.yml           # PostgreSQL for local dev
├── backend/                     # Python — FastAPI + async PostgreSQL
│   ├── pyproject.toml           # uv-managed dependencies
│   ├── alembic/                 # Async-aware migrations
│   └── app/
│       ├── domains/
│       │   ├── health/          # Always present — reference domain
│       │   ├── auth/            # JWT issuance, refresh, current user
│       │   ├── tenants/         # Tenant lifecycle (superadmin-managed)
│       │   ├── rbac/            # Roles, privileges, guards
│       │   └── {domain}/        # Business domains added per project
│       └── shared/              # Pagination, exceptions, test helpers
└── frontend/                    # TypeScript — pnpm monorepo
    ├── packages/
    │   └── ui/                  # Shared component library + API client
    └── apps/
        ├── admin/               # Superadmin panel (port 3001)
        ├── portal/              # Customer/tenant portal (port 3002)
        └── marketing/           # Public marketing site (port 3003)
```

### Built-in invariants

Every scaffolded project includes these from day one — they are not optional and are not left as future work:

- **Multitenancy** — `tenant_id` on all business models; services always filter by tenant; tenant comes from the JWT, never from the request body
- **JWT authentication** — access + refresh tokens; `AuthProvider` on the frontend; `get_current_user` dependency on the backend
- **Superadmin gating** — `require_superadmin()` guard; all `/superadmin/*` routes; `is_superadmin` is a DB flag set directly, not via API
- **RBAC** — `Privilege → Role → User` model; `require_privilege("codename")` guard; roles can be system-level (superadmin manages) or tenant-scoped (tenant admin manages)
- **Alembic migrations** — async-aware `env.py`; autogenerate from SQLAlchemy models; `just migrate "description"` to create, `just db-upgrade` to apply
- **OpenAPI + Swagger** — FastAPI auto-generates; `/docs` available in dev; `just codegen` regenerates the typed frontend client

### The OpenAPI bridge

```
Backend Pydantic schemas
        ↓
    openapi.json        (just openapi)
        ↓
 packages/ui/src/client  (just codegen)
        ↓
  All frontend apps import typed client via @{project}/ui
```

Frontend components never hand-write fetch calls or API types. All API access goes through the generated client.

---

## Toolchain

| Tool | Purpose | Install |
|------|---------|---------|
| [just](https://just.systems) | Command runner | `brew install just` |
| [uv](https://docs.astral.sh/uv) | Python dependency management | `brew install uv` |
| [pnpm](https://pnpm.io) | Node dependency management | `brew install pnpm` |
| [LM Studio](https://lmstudio.ai) | Local model inference server | lmstudio.ai |

---

## Installing the harness

```bash
cd open-weight-small
./install.sh
```

This installs agents, skills, `AGENTS.md`, and `opencode.json` to `~/.config/opencode/`, removing any previously installed harness files first.

---

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `scaffolder` | qwen3.5-35b-a3b | One-time project setup — creates full directory structure, config, built-in domains |

More agents (implementer, reviewer, etc.) are planned as the harness matures.

---

## Skills

| Skill | Purpose |
|-------|---------|
| `target-architecture` | Defines project conventions — file locations, naming, test commands, domain structure. Loaded by every agent. |
| `scaffold-project` | Step-by-step templates for scaffolding a new project. Used exclusively by the scaffolder agent. |
