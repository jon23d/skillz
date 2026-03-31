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
├── skills/
│   ├── cicd-pipeline-creation/
│   ├── github-quality-control/
│   ├── issue-tracker/
│   ├── playwright-e2e/
│   ├── postgres-schema-design/
│   ├── pull-requests/
│   ├── rest-api-design/
│   ├── tdd/
│   ├── writing-dockerfiles/
│   ├── writing-skills/
│   └── writing-tickets/
│
└── tools/
    ├── package.json                  # Bun dependencies — installed automatically by OpenCode
    ├── lib/
    │   ├── agent-config.ts           # Shared config loader (reads agent-config.json)
    │   ├── issue-tracker.ts          # Abstract IssueTracker class + shared types
    │   └── pull-request-tracker.ts   # Abstract PullRequestTracker class + shared types
    ├── github-issues.ts              # GitHub issue tools
    ├── jira-issues.ts                # Jira issue tools
    └── github-prs.ts                 # GitHub PR tools
    # Gitea — no wrapper tools; agents use the tea CLI directly
```

---

## Project configuration

Each project that uses these tools needs an `agent-config.json` in its root:

```json
{
  "issue_tracker": {
    "provider": "jira",
    "jira": {
      "base_url": "https://yourorg.atlassian.net",
      "project_key": "PROJ"
    }
  },
  "git_host": {
    "provider": "github",
    "github": {
      "repo_url": "https://github.com/org/repo"
    }
  }
}
```

Supported `issue_tracker.provider` values: `github`, `gitea`, `jira`
Supported `git_host.provider` values: `github`, `gitea`

Secrets are **never** stored in `agent-config.json`. They are read from environment variables:

| Service | Required env vars |
|---|---|
| GitHub | `GITHUB_ACCESS_TOKEN` |
| Gitea | `GITEA_ACCESS_TOKEN` |
| Jira | `JIRA_EMAIL`, `JIRA_API_TOKEN` |

The `repo_url` / `base_url` fields in `agent-config.json` are optional if the corresponding `*_REPO_URL` / `*_BASE_URL` env vars are set instead.

---

## Tools

Tools are TypeScript files in `tools/` and run on Bun. OpenCode discovers them automatically and installs dependencies from `tools/package.json` at startup.

Tool names follow the pattern `<filename>_<export>` for named exports, or just `<filename>` for default exports.

### Issue tools

| Tool | Description |
|---|---|
| `github-issues_get` | Read a GitHub issue by number |
| `github-issues_create` | Create a GitHub issue |
| `github-issues_update` | Update a GitHub issue |
| `github-issues_list` | List GitHub issues |
| `github-issues_comment` | Add a comment to a GitHub issue |
| `github-issues_search` | Search GitHub issues |
| `github-issues_close` | Close a GitHub issue |
| `jira-issues_get` | Read a Jira issue by key |
| `jira-issues_create` | Create a Jira issue |
| `jira-issues_update` | Update a Jira issue |
| `jira-issues_comment` | Add a comment to a Jira issue |
| `jira-issues_search` | Search issues using JQL |
| `jira-issues_transition` | Transition a Jira issue (auto-assigns on "In Progress") |
| `jira-issues_assign` | Assign a Jira issue |
| `jira-issues_link_pr` | Link a PR URL to a Jira issue |

**Gitea** — all Gitea issue and PR operations use the `tea` CLI directly (no wrapper tools). See `docs/GITEA_SETUP.md`.

### PR tools

| Tool | Description |
|---|---|
| `github-prs_create` | Open a GitHub pull request |
| `github-prs_get` | Read a GitHub PR |
| `github-prs_list` | List GitHub PRs |
| `github-prs_update` | Update a GitHub PR (title, body, state) |

**Gitea PRs** — use `tea pulls create/view/list/edit`. See `skills/pull-requests/SKILL.md`.

### Setup guides

For detailed credential setup, see:
- `GITHUB_SETUP.md` — GitHub token scopes and config
- `GITEA_SETUP.md` — `tea` CLI install and auth setup
- `JIRA_SETUP.md` — Jira API token setup and ADF notes

---

## Skills

Skills are `SKILL.md` files that agents load on demand using the built-in `skill` tool. Each skill contains step-by-step instructions for a specific type of task.

| Skill | When to use |
|---|---|
| `issue-tracker` | Reading, creating, updating, searching, or transitioning issues/tickets |
| `pull-requests` | Opening PRs, writing PR bodies, linking to tickets, handling review feedback |
| `tdd` | Any coding task — write failing test first, then implement |
| `writing-dockerfiles` | Writing or editing Dockerfiles; see `node.md` and `python.md` adjuncts |
| `playwright-e2e` | Writing or running Playwright end-to-end tests |
| `rest-api-design` | Designing REST APIs — naming, status codes, pagination, error formats |
| `postgres-schema-design` | Schema design, migrations, indexing, Prisma workflows |
| `cicd-pipeline-creation` | Writing CI/CD pipeline configuration |
| `github-quality-control` | Code review, PR quality gates, GitHub Actions |
| `writing-tickets` | Writing well-scoped issue/ticket descriptions |
| `writing-skills` | Creating or improving skill files (meta-skill) |

---

## Agents

### `build` (primary orchestrator)

The default agent. Handles the full feature development lifecycle:

1. **Understand** — reads the ticket, loads config
2. **Scoping checkpoint** — presents a proposed agent plan to the user as plain text and waits for approval before starting any work
3. **Setup** — creates a git worktree (via the `worktrees` skill), renames the session
4. **Execute** — delegates to specialist agents in parallel waves:
   - Wave 1: `@architect` (optional, for complex tasks)
   - Wave 2: `@backend-engineer` + `@frontend-engineer` in parallel
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

See any existing tool file for a working example.
