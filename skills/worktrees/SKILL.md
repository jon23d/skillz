---
name: worktrees
description: Use when the user describes a problem to solve, asks to claim a ticket, or brings review feedback for an existing PR — before any implementation work begins.
---

# Worktrees

## When to use

Load this skill whenever:
- The user describes a problem or feature to implement
- The user asks to pick up or claim a ticket
- The user brings review feedback for an existing PR

Do not use this skill if the user explicitly asks to work in the current directory.

## Step 0 — Ensure a git repository exists

```bash
git -C . rev-parse --is-inside-work-tree
```

If this fails, initialise one with `git init`. All subsequent steps depend on git being present.

## Step 1 — Derive the worktree path

- **Project name**: last path component of the current working directory
- **Slug**: `{ticket-number}-{slugified-title}` with a ticket, or a short kebab-case phrase without one (e.g. `fix-login-redirect`); lowercase, hyphens for separators, max ~40 characters
- **Worktree path**: `~/worktrees/{project}/{slug}`
- **Branch name**: `feature/{slug}`

## Step 1b — Rename the session

Once the slug is known, call `rename-session`:
- With a Gitea or GitHub ticket: `Issue #N - {slug}`
- With a Jira ticket: `PROJ-N - {slug}`
- Without a ticket: `{slug}`

Call once and do not repeat. If it returns an error, log it and continue.

## Step 1c — Derive the agent-logs path

```
agent-logs/YYYY-MM-DD-{slug}/
```

Use today's date. This path is relative to the worktree root. Hold it to pass to subagents and to use when writing the task log.

## Step 2 — Create or re-enter the worktree

Check whether a worktree for this branch already exists:

```bash
git worktree list
```

- **Already exists** — skip to passing the path to subagents; do not re-copy `.env` or reinstall unless time has passed
- **Branch exists but worktree was removed** — `git worktree add ~/worktrees/{project}/{slug} feature/{slug}`
- **Neither exists** — `git worktree add ~/worktrees/{project}/{slug} -b feature/{slug}`

If `git worktree add` fails, report to the user and stop.

## Step 3 — Copy environment files

```bash
cp .env ~/worktrees/{project}/{slug}/.env
```

Skip silently if `.env` does not exist. Copy `.env.local` and `.env.test` if present. `agent-config.json` is a tracked file — it is already in the worktree.

## Step 4 — Install dependencies

Delegate to the backend engineer before any implementation begins, asking them to run the project's dependency install command (`npm install`, `pnpm install`, `bun install`, etc.) from the worktree path.

## Passing the path to subagents

Every subagent invocation must include the worktree path:

> "Your working directory is `{worktree_path}`. All file reads, writes, edits, and commands must operate relative to this path."

When invoking a frontend engineer, also include the agent-logs path so screenshots are saved there.

## Handling review feedback

1. Re-enter the existing worktree (Step 2 — "already exists" path)
2. Pass the worktree path and review comments to the relevant engineer(s)
3. After changes and quality gates pass, push again — this updates the existing PR automatically
4. Post a comment on the issue noting the update
5. Leave the worktree for further feedback rounds

## On completion: log, push, open PR

After all quality gates pass:

**1. Collect context** — what was done, files changed, tests added, reviewer verdicts, screenshots, follow-up items.

**2. Determine base branch:**
```bash
git symbolic-ref refs/remotes/origin/HEAD
```
Default to `main` if this fails.

**3. Write the task log** at `{agent_logs_path}/log.md` — include implementation summary, tradeoffs, file change table, reviewer verdicts (full JSON), screenshots embedded with relative paths, follow-up items, and agent notes.

**4. Commit and push:**
```bash
git -C ~/worktrees/{project}/{slug} add -A
git -C ~/worktrees/{project}/{slug} commit -m "{imperative summary}"
git push origin feature/{slug}
```

Do not open the PR until push succeeds.

**5. Open the PR** using the appropriate tool (`gitea-create-pr` or `github-create-pr`) with `head: feature/{slug}`, the correct base branch, and a clean human-readable body summarising the changes, quality gate results, and screenshots.

**6. Fill in the PR URL** in `log.md`, commit, and push again.

**7. Post the PR URL** on the issue tracker ticket.

**8. Leave the worktree in place** for review feedback rounds. Report the PR URL to the user.

## Cleanup

Only remove the worktree when the user confirms the work is done:

```bash
git worktree remove ~/worktrees/{project}/{slug}
```

If removal fails due to untracked or modified files, report this rather than force-removing.

## Error handling

- Worktree creation failure → report and stop; do not proceed without an isolated workspace
- `.env` copy failure → report and continue; not a blocker
- Dependency install failure → report and ask whether to continue or abort
- `git commit` failure → report; do not push or open PR until resolved
- `git push` failure → report; do not open PR until push succeeds
- PR creation failure → report the error with the branch name so the user can open it manually
- `agent-logs` folder creation failure → report and continue; not a blocker on the PR
