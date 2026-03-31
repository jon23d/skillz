---
name: git-worktrees
description: For the `build` agent only. Use when the user describes a problem to solve, asks to claim or pick up a ticket, or brings review feedback for an existing PR. Covers the full lifecycle: worktree setup, subagent coordination, PR creation, and review feedback rounds. Engineer agents must NOT load this skill — the completion workflow (commit, push, PR, notify) belongs exclusively to `build`.
---

# Worktrees

Manages isolated per-ticket workstreams using git worktrees. Every ticket gets its own worktree and branch. All subagent work happens inside that worktree — never in the main repo directory.

## Step 0 — Confirm git repo

```bash
git -C . rev-parse --is-inside-work-tree
```

If this fails, run `git init` before proceeding.

## Step 1 — Derive paths

**Project name**: last component of cwd. `/home/user/dev/myapp` → `myapp`

**Slug**:
- With ticket number: `{number}-{slugified-title}` → `42-add-user-auth`
- Without ticket: slugify the description → `fix-login-redirect`
- Slugification: lowercase, spaces/special chars → hyphens, max ~40 chars, trim trailing hyphens

**Worktree path**: `~/worktrees/{project}/{slug}`
**Branch name**: `feature/{slug}`
**Agent-logs path**: `{worktree_path}/.agent-logs/YYYY-MM-DD-{slug}/` (use today's date)

## Step 1b — Rename the session (mandatory)

Call `rename-session` immediately after deriving paths. Do not defer this or skip it.

Format — use the ticket number and a plain-English description (≤10 words) of what the ticket is about:
- GitHub/Gitea ticket: `#N - brief description` → `#42 - Add user authentication`
- Jira ticket: `PROJ-N - brief description` → `PROJ-42 - Add user authentication`
- No ticket: `brief description` → `Add user authentication`

The description is **not** the slug. It is a short human-readable summary of the ticket title, not the hyphenated path-safe version.

If `rename-session` errors, log the error and continue — not a blocker.

## Step 2 — Create or re-enter the worktree

Check for existing worktree:

```bash
git worktree list
```

If creating a new worktree, pull main first:

```bash
git pull origin main
```

(Replace `main` with the default branch if different — use the value from `git_host.default_branch` in `agent-config.json` if present.) This ensures the new branch forks from current, not stale, code.

- **Worktree exists** → skip to [Passing paths to subagents](#passing-paths-to-subagents). Do not re-copy `.env` or reinstall unless the user says they may be stale.
- **Branch exists, worktree missing**:
  ```bash
  mkdir -p ~/worktrees/{project}
  git worktree add ~/worktrees/{project}/{slug} feature/{slug}
  ```
  Then steps 3–4.
- **Neither exists** (fresh start):
  ```bash
  mkdir -p ~/worktrees/{project}
  git worktree add ~/worktrees/{project}/{slug} -b feature/{slug}
  ```
  Then steps 3–4.

If `git worktree add` fails for any reason, report and stop.

## Step 3 — Copy environment files

```bash
cp .env ~/worktrees/{project}/{slug}/.env
```

Skip silently if absent. Also copy `.env.local`, `.env.test` if present. `agent-config.json` is tracked — no copy needed.

## Step 4 — Install dependencies

Instruct `@backend-engineer`:

> "Before starting work, run the project's dependency install command (`pnpm install`, `npm install`, or `bun install`) from `{worktree_path}`. Confirm once done."

## Passing paths to subagents

Every subagent invocation must include:

> "Your working directory is `{worktree_path}`. All file reads, writes, edits, and bash commands must operate relative to this path. Do not operate on files outside this directory."

This applies to all subagents: `@backend-engineer`, `@frontend-engineer`, `@devops-engineer`, `@qa`, `@developer-advocate`, `@reviewer`, `@notifier`.

When invoking `@frontend-engineer`, also pass the agent-logs path:

> "Save all screenshots to `{agent_logs_path}`. Create the folder if it does not exist. Report back the filenames of any screenshots you save."

## Handling review feedback

When the user brings review feedback:

1. Re-enter the existing worktree (Step 2 — "worktree exists" path)
2. Pass worktree path and review comments to the relevant engineer(s)
3. After quality gates pass, push:
   ```bash
   git push origin feature/{slug}
   ```
   This updates the existing PR — no new PR needed.
4. Post a comment on the issue noting the updated push
5. Leave the worktree in place for further feedback rounds

## On completion — `build` agent ONLY

**STOP. These steps are exclusively for the `build` agent.** If you are `@backend-engineer`, `@frontend-engineer`, `@devops-engineer`, `@qa`, `@developer-advocate`, or any other subagent: do NOT execute any of the steps below. Report your results back to your invoker and stop. The task log, commit, push, PR, and notification are `build`'s responsibility — never yours.

After all quality gates pass, `build` follows these steps in order.

### 1. Collect context from all agent reports

Gather: task name and ticket, what was done (2–4 sentence summary), architect recommendation if applicable, files changed, tests added, reviewer verdicts (code, security, observability), QA verdict, devops report, developer-advocate updates, screenshot filenames from `@frontend-engineer`, follow-up items, tradeoffs, errors and how they were resolved, engineer uncertainty notes.

### 2. Determine base branch

```bash
git symbolic-ref refs/remotes/origin/HEAD
```

Strip `refs/remotes/origin/` to get branch name. Default to `main` if this fails.

### 3. Write the task log

Create `{agent_logs_path}/log.md`. Full detail lives here — the PR body is the human-readable summary, the log is the complete record.

```markdown
# Task log: {task title}

**Date:** YYYY-MM-DD
**Ticket:** {ticket reference, or "None"}
**Branch:** feature/{slug}
**PR:** {fill in after PR is opened}

## Implementation plan

{Architect recommendation if invoked: what was accepted, modified, rejected, and why.
If no architect: note implementation was direct.}

## Tradeoffs and decisions

{Each significant choice: what was chosen, alternatives considered, why.
If none: "No significant tradeoffs — implementation followed the plan directly."}

## Changes

{Bulleted list: `path/to/file.ts` — what changed}

## Tests added

{Bulleted list: `path/to/test.ts` — what it covers}

## Quality gate verdicts

### reviewer
{full JSON verdict}

### QA
{full JSON verdict, or "Not applicable"}

### devops-engineer
{summary, or "Not applicable"}

## Errors and complications

{What happened, what was tried, how it was resolved. Or "None."}

## Screenshots

{Embed each screenshot using the URL format for the provider (see `pull-requests` skill Screenshots section):}

GitHub:
![description](../blob/{branch}/.agent-logs/YYYY-MM-DD-{slug}/filename.png?raw=true)

Gitea — absolute raw URL, images must be committed and pushed first:
![description]({repo_url}/raw/branch/{branch}/.agent-logs/YYYY-MM-DD-{slug}/filename.png)

{"None" if no UI changes.}

## Documentation updates

{Files updated by developer-advocate, or "None"}

## Follow-up items

{Each deferred item: what it is, why deferred, recommended approach. Or "None."}

## Agent notes

{Uncertainty, brittleness, tech debt flagged by engineers. Or "None."}
```

### 4. Verify screenshots are on disk (hard gate — UI changes only)

Before touching git: confirm every screenshot file reported by `@frontend-engineer` exists locally.

```bash
ls {agent_logs_path}/*.png   # or the exact filenames from the engineer's report
```

If any file is missing, **stop here**. Send `@frontend-engineer` back to retake screenshots and commit them. Do not continue to step 5 until every file is present on disk.

### 5. Commit and push

Stage everything with `git add -A` — this must include `.agent-logs/` (screenshots and log.md). Do not use selective `git add <file>` which would leave `.agent-logs/` unstaged.

```bash
git -C ~/worktrees/{project}/{slug} add -A
git -C ~/worktrees/{project}/{slug} status  # confirm .agent-logs/ appears under "Changes to be committed"
git -C ~/worktrees/{project}/{slug} commit -m "{concise imperative summary}"
git push origin feature/{slug}
```

If `git status` shows `.agent-logs/` is not staged, stage it explicitly and commit before pushing.

Do not open the PR until push succeeds.

### 5b. Verify screenshots are on the remote branch (hard gate — UI changes only)

After push, before opening the PR, confirm each screenshot file is reachable on `HEAD`:

```bash
git -C ~/worktrees/{project}/{slug} show HEAD:.agent-logs/YYYY-MM-DD-{slug}/filename.png > /dev/null
```

Run this for every screenshot path from the engineer's report. If any command fails (file not found on `HEAD`), stage it explicitly, commit, and push again. **Do not open the PR until every screenshot resolves on the pushed branch.**

### 6. Compose and open the PR (`build` only — never an engineer)

Use the `pull-requests` skill to compose the PR body and open the PR. Pass it:
- Head branch: `feature/{slug}`
- Base branch: from step 2
- Title: ticket title or concise imperative summary
- Files changed, tests added, quality gate results, screenshot paths, follow-up items
- Ticket reference for the `Closes` line

The pull-requests skill owns the PR body template and the Jira transition.

### 7. Update the task log with the PR URL

Once the PR URL is returned, fill it into the `**PR:**` field in `log.md`:

```bash
git -C ~/worktrees/{project}/{slug} add .agent-logs/
git -C ~/worktrees/{project}/{slug} commit -m "Add PR URL to task log"
git push origin feature/{slug}
```

### 8. Post the PR URL on the ticket

- Gitea: `tea issues comment <number> --body "🔀 PR opened: {pr_url}"` (run from worktree)
- GitHub: `gh issue comment <number> --body "🔀 PR opened: {pr_url}"`
- Jira: handled by the pull-requests skill

### 9. Invoke notifier

Pass to `@notifier`: the PR URL and a one-sentence summary of what was done.

### 10. Leave the worktree in place

Report the PR URL to the user. The worktree stays available for review feedback rounds.

## Cleanup

Only remove the worktree when the user confirms work is done (merged, abandoned, or dismissed):

```bash
git worktree remove ~/worktrees/{project}/{slug}
```

If removal fails due to untracked or modified files, report and leave it. Never force-remove.

After successful removal, pull the root repo to sync it with main:

```bash
git pull
```

Run this from the root repo directory (not the worktree). This keeps the root repo up-to-date for future worktrees branched from it.

## Error handling

- Worktree creation failure → report and stop
- `.env` copy failure → report and continue
- Dependency install failure → report and ask whether to continue or abort
- `git commit` failure → report; do not push or open PR until resolved
- `git push` failure → report; do not open PR until push succeeds
- PR creation failure → report the error with the branch name so the user can open manually
- Worktree removal failure → report and leave; never force-remove
- Agent-logs folder creation failure → report and continue; not a PR blocker
