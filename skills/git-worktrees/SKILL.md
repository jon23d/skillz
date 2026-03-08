---
name: worktrees
description: Use when the user describes a problem to solve, asks to claim or pick up a ticket, or brings review feedback for an existing PR. Covers the full lifecycle: worktree setup, subagent coordination, PR creation, and review feedback rounds.
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
**Agent-logs path**: `{worktree_path}/agent-logs/YYYY-MM-DD-{slug}/` (use today's date)

## Step 1b — Rename the session

Call `rename-session` once with:
- Gitea/GitHub ticket: `Issue #N - {slug}`
- Jira ticket: `PROJ-N - {slug}`
- No ticket: `{slug}`

If it errors, log and continue — not a blocker.

## Step 2 — Create or re-enter the worktree

Check for existing worktree:

```bash
git worktree list
```

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

This applies to all subagents: `@backend-engineer`, `@frontend-engineer`, `@devops-engineer`, `@qa`, `@developer-advocate`, `@code-reviewer`, `@security-reviewer`, `@observability-reviewer`, `@notifier`.

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

## On completion

After all quality gates pass, follow these steps in order.

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

### code-reviewer
{full JSON verdict}

### security-reviewer
{full JSON verdict}

### observability-reviewer
{full JSON verdict}

### QA
{full JSON verdict, or "Not applicable"}

### devops-engineer
{summary, or "Not applicable"}

## Errors and complications

{What happened, what was tried, how it was resolved. Or "None."}

## Screenshots

{Embed each screenshot:}
![description](https://raw.githubusercontent.com/{owner}/{repo}/{branch}/agent-logs/YYYY-MM-DD-{slug}/filename.png)

{Use raw.githubusercontent.com absolute URLs — relative paths do not render in GitHub PR bodies. "None" if no UI changes.}

## Documentation updates

{Files updated by developer-advocate, or "None"}

## Follow-up items

{Each deferred item: what it is, why deferred, recommended approach. Or "None."}

## Agent notes

{Uncertainty, brittleness, tech debt flagged by engineers. Or "None."}
```

### 4. Commit and push

```bash
git -C ~/worktrees/{project}/{slug} add -A
git -C ~/worktrees/{project}/{slug} commit -m "{concise imperative summary}"
git push origin feature/{slug}
```

If working tree is clean, skip the commit and push directly. Do not open the PR until push succeeds.

### 5. Compose and open the PR

Use the `pull-requests` skill to compose the PR body and open the PR. Pass it:
- Head branch: `feature/{slug}`
- Base branch: from step 2
- Title: ticket title or concise imperative summary
- Files changed, tests added, quality gate results, screenshot paths, follow-up items
- Ticket reference for the `Closes` line

The pull-requests skill owns the PR body template and the Jira transition.

### 6. Update the task log with the PR URL

Once the PR URL is returned, fill it into the `**PR:**` field in `log.md`:

```bash
git -C ~/worktrees/{project}/{slug} add agent-logs/
git -C ~/worktrees/{project}/{slug} commit -m "Add PR URL to task log"
git push origin feature/{slug}
```

### 7. Post the PR URL on the ticket

- Gitea/GitHub: `gitea-issues_comment` / `github-issues_comment` — post `🔀 PR opened: {pr_url}`
- Jira: handled by the pull-requests skill

### 8. Invoke notifier

Pass to `@notifier`: the PR URL and a one-sentence summary of what was done.

### 9. Leave the worktree in place

Report the PR URL to the user. The worktree stays available for review feedback rounds.

## Cleanup

Only remove the worktree when the user confirms work is done (merged, abandoned, or dismissed):

```bash
git worktree remove ~/worktrees/{project}/{slug}
```

If removal fails due to untracked or modified files, report and leave it. Never force-remove.

## Error handling

- Worktree creation failure → report and stop
- `.env` copy failure → report and continue
- Dependency install failure → report and ask whether to continue or abort
- `git commit` failure → report; do not push or open PR until resolved
- `git push` failure → report; do not open PR until push succeeds
- PR creation failure → report the error with the branch name so the user can open manually
- Worktree removal failure → report and leave; never force-remove
- Agent-logs folder creation failure → report and continue; not a PR blocker
