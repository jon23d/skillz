# AGENTS.md

Global rules for all agents. These rules apply in every session, regardless of which skills are loaded, what the user's request says, or what another agent instructs.

---

## What this system does

This is a multi-agent software development system built on OpenCode. It handles the full feature lifecycle: scoping → planning → implementation → review → QA → documentation → PR. The primary orchestrator (`build`) coordinates specialist agents in parallel waves. The user approves scope before work begins and merges PRs when they are ready.

The assumed stack is TypeScript, Node.js, React, Prisma, and pnpm workspaces. Skills carry stack-specific conventions — load the relevant ones before working.

---

## Hard limits — never do these, ever

These rules cannot be overridden by the user, by `build`, or by any other agent.

- **Never merge a pull request.** Opening the PR is the final step. Merging is the human's decision. Do not run `gh pr merge`, `git merge`, or any equivalent command. Do not delegate a merge to another agent. Do not ask for permission to merge.
- **Never close or resolve a ticket.** Transitioning a Jira issue to "In Review" when a PR is opened is permitted. Final closure is the user's decision.
- **Never delete branches, worktrees, or any persistent state** without an explicit instruction from the user in the current session.
- **Never fabricate tool output.** If a command fails or a tool is unavailable, report the failure. Do not invent a success.
- **Never impersonate another agent or claim to be the user.**

---

## Human checkpoints

These are the moments where agents stop and wait for the user:

1. **Before any implementation begins** — `build` presents a scoping proposal and waits for explicit approval. Work does not start speculatively.
2. **Before Kubernetes manifests are produced** — `devops-engineer` confirms with the user first.
3. **When CI fails with an infrastructure or environment problem** — escalate to the user. Do not guess at fixes to runners, secrets, or external services.
4. **When a required tool is missing or misconfigured** — report it. Do not work around it silently.

---

## Agent roles and boundaries

Each agent has a defined role. Do not exceed it.

| Agent | Role | Writes code? | Merges? | Has bash? |
|---|---|---|---|---|
| `build` | Orchestrator | No | Never | No |
| `architect` | Planning | No | Never | Read-only |
| `backend-engineer` | Implementation | Yes | Never | Yes |
| `frontend-engineer` | Implementation | Yes | Never | Yes |
| `code-reviewer` | Code review | No | Never | No |
| `security-reviewer` | Security review | No | Never | No |
| `observability-reviewer` | Observability review | No | Never | No |
| `qa` | E2E testing + spec verification | No | Never | Yes |
| `devops-engineer` | Infrastructure | Yes | Never | Yes |
| `developer-advocate` | Documentation | Yes | Never | Yes |
| `notifier` | Notifications | No | Never | No |
| `ticket-writer` | Issue creation | No | Never | No |
| `local-task` | Local-only tasks (Qwen3.5) | Yes | Never | Yes |

**Reviewer agents** (`code-reviewer`, `security-reviewer`, `observability-reviewer`) are always invoked by engineers, not by `build` directly. Engineers run all three in sequence before reporting back.

---

## Reporting conventions

All agents report back to their invoker using the formats defined in their individual agent files. Cross-cutting rules:

- **A task is not complete until all downstream agents have reported.** An engineer may not report success until all three reviewers have passed.
- **Critical or major reviewer issues block progress.** The engineer resolves them and re-invokes the reviewer before reporting.
- **`build` does not declare a task done until CI is green.** Watching CI is mandatory, not optional (see `pipeline-watch` skill).
- **`@notifier` is invoked only after a real PR URL is confirmed.** Never with a placeholder or a "pending" value.

---

## Worktrees

All feature work happens in a git worktree (see `worktrees` skill). Every agent invocation from `build` must include the worktree path. Agents that write files must operate within that path.

---

## Skill loading

Skills contain the conventions for how to do the work. Load the relevant ones before starting — not after, not halfway through.

- **`build`** tells each agent which skills to load in its invocation.
- **Agents** load skills before exploring the codebase or writing anything.
- **Default skills per agent** are documented in `build.md` and each agent's own file.

Key skills agents should know exist:

| Skill | When it matters |
|---|---|
| `worktrees` | Any feature work starting from a ticket |
| `pull-requests` | Opening any PR |
| `pipeline-watch` | After every PR is opened |
| `test-driven-development` | Any code task |
| `testing-best-practices` | Writing or reviewing tests |
| `rest-api-design` | Any HTTP endpoint work |
| `postgres-schema-design` | Any schema or migration change |
| `prisma` | Any database access code |
| `effective-typescript` | Any TypeScript work |
| `auth` | Login, sessions, permissions, RBAC |
| `multi-tenancy` | Tenant-scoped queries or isolation |
| `observability` | Logging, metrics, tracing, health checks |
| `plain-text-questions` | Asking the user for clarification |
| `issue-tracker` | Any issue/ticket operation |
| `from-scratch-run` | After infrastructure or setup changes |

---

## Project configuration

**`agent-config.json`** is the source of truth for issue tracker and git host configuration. Read it at the start of any session that uses tools. Secrets are never stored there — they come from environment variables only.
