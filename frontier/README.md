# skillz

OpenCode configuration repository. Contains skills, tools, and agents for use with [OpenCode](https://opencode.ai).

This repo is designed to be cloned into `.opencode/` inside a project, or used as a global config at `~/.config/opencode/`. See [OpenCode config docs](https://opencode.ai/docs/config) for how config directories are resolved.

---

## Repository structure

```
skillz/
├── AGENTS.md                        # Global agent rules (read by all agents at startup)
├── README.md                        # This file
│
├── agents/
│   └── build.md                     # Primary orchestrator agent
│
├── docs/
│   └── GITEA_SETUP.md               # tea CLI install and auth setup
│
├── skills/
│   ├── cicd-pipeline-creation/
│   ├── git-worktrees/
│   ├── issue-tracker/
│   ├── pipeline-watch/
│   ├── playwright-e2e/
│   ├── postgres-schema-design/
│   ├── pull-requests/
│   ├── rest-api-design/
│   ├── tdd/
│   ├── writing-dockerfiles/
│   ├── writing-skills/
│   ├── writing-tickets/
│   └── ...
│
└── tools/
    ├── package.json                  # Bun dependencies — installed automatically by OpenCode
    ├── send-telegram.ts              # Telegram notification tool
    └── lib/
        └── agent-config.ts          # Shared config loader (reads agent-config.json)
```

---

## Project configuration

Each project that uses these tools needs an `agent-config.json` in its root:

```json
{
  "issue_tracker": {
    "provider": "gitea",
    "gitea": {
      "repo_url": "https://gitea.example.com/org/repo"
    }
  },
  "git_host": {
    "provider": "gitea",
    "gitea": {
      "repo_url": "https://gitea.example.com/org/repo",
      "default_branch": "main"
    }
  }
}
```

The `default_branch` field is optional (defaults to `main`).

`repo_url` may also be supplied via the `GITEA_REPO_URL` environment variable instead of `agent-config.json`.

Secrets are **never** stored in `agent-config.json`. Set this environment variable:

| Service | Required env var |
|---|---|
| Gitea | `GITEA_ACCESS_TOKEN` |

See `docs/GITEA_SETUP.md` for `tea` CLI install and authentication setup.

---

## Tools

Tools are TypeScript files in `tools/` and run on Bun. OpenCode discovers them automatically and installs dependencies from `tools/package.json` at startup.

Issue and PR operations use the `tea` CLI directly — no wrapper tools. Agents call `tea` via bash. See `skills/issue-tracker/SKILL.md` and `skills/pull-requests/SKILL.md`.

---

## Skills

Skills are `SKILL.md` files that agents load on demand using the built-in `skill` tool. Each skill contains step-by-step instructions for a specific type of task.

| Skill | When to use |
|---|---|
| `git-worktrees` | Worktree setup, subagent coordination, PR lifecycle (build agent only) |
| `issue-tracker` | Reading, creating, updating, searching, or commenting on issues |
| `pull-requests` | Opening PRs, writing PR bodies, embedding screenshots |
| `pipeline-watch` | Monitoring CI checks after a PR is opened |
| `tdd` | Any coding task — write failing test first, then implement |
| `playwright-e2e` | Writing Playwright e2e tests for real browser/OAuth scenarios only |
| `rest-api-design` | Designing REST APIs — naming, status codes, pagination, error formats |
| `postgres-schema-design` | Schema design, migrations, indexing, Prisma workflows |
| `cicd-pipeline-creation` | Writing CI/CD pipeline configuration |
| `writing-tickets` | Writing well-scoped issue/ticket descriptions |
| `writing-skills` | Creating or improving skill files (meta-skill) |

---

## Agents

### `build` (primary orchestrator)

The default agent. Handles the full feature development lifecycle:

1. **Understand** — reads the ticket, loads config
2. **Scoping checkpoint** — presents a proposed agent plan to the user as plain text and waits for approval before starting any work
3. **Setup** — creates a git worktree (via the `git-worktrees` skill), renames the session
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
5. Config should be read from `agent-config.json` via helpers in `tools/lib/agent-config.ts`; secrets from env vars only

See `tools/send-telegram.ts` for a working example.
