---
name: pipeline-watch
description: Use when a PR has been opened and CI/pipeline checks must be monitored before declaring the task complete. Use when asked to "watch the pipeline", "wait for CI", "make sure checks pass", or "don't declare done until CI is green". Apply after every PR is opened.
---

# Pipeline Watch

Opening a PR is not done. Done means CI is green — all required checks pass and the PR is ready for the human to review and merge.

**NEVER merge a PR.** Merging is always the human's decision. Your job ends when you report CI status to the user.

## When to use

Apply immediately after a PR is opened. The task is not complete until all required checks pass or a failure is handled.

## What "done" means

- **Wrong:** PR exists
- **Wrong:** PR is merged
- **Correct:** PR exists AND all required CI checks are green AND CI status has been reported to the user

Pre-PR quality gates (local tests, linting, code review) are not the same as CI pipeline checks. CI may run matrix builds, integration tests, deployment previews, or security scans that never ran locally.

## Steps

After opening the PR:

1. **Get the PR number** — you have this from the `gh pr create` output (GitHub) or `gitea-prs_create` response (Gitea)
2. **Wait for checks to register** — delegate to an agent with bash access: `sleep 30`
3. **Poll check status** — delegate: `gh pr checks <PR-number> --watch`
4. **Handle the result:**
   - All green → proceed to completion (update log.md, notify)
   - Any failing → see Failure Handling below
   - Timeout (>20 min still pending) → report to user, do not declare done

## Commands to delegate

Delegate to `@backend-engineer` or any agent with bash access.

Check `tea` is available first:
```bash
tea --version
```
If not found, stop and tell the user to install it from https://gitea.com/gitea/tea.

```bash
# Poll run status — run from the repo root
sleep 30 && tea runs list
```
Poll every 30s until all runs reach a terminal state (`success`, `failure`, `cancelled`), or 20 minutes elapses.

## Failure Handling

When a check fails:

1. Get failure details:
   - GitHub: `gh run view <run-id> --log-failed`
   - Gitea: check the Gitea Actions UI or fetch logs via the Gitea API
2. Classify the failure:
   - **Formatting/lint** (e.g., prettier, eslint) → delegate fix to the responsible engineer, push, re-watch
   - **Flaky test** (intermittent, unrelated to this change) → re-run: `gh run rerun <run-id>`; if it passes on retry, proceed
   - **Real test failure** → delegate fix to the responsible engineer (Wave 2 again), re-run quality gates, push, re-watch
   - **Infrastructure/env failure** (e.g., missing secret, misconfigured runner) → escalate to user with details; do not block on it
3. After a fix is pushed, re-watch from step 2

## Completion message

Only after checks are green, include in your final user message:

```
PR #<N>: <title>
URL: <url>
CI: ✓ all checks passed
```

If checks are still pending at timeout:

```
PR #<N> is open but CI is still running after 20 minutes.
Pipeline URL: <url>
You may want to monitor it directly.
```

## Rationalizations to reject

- "All quality gates passed before the PR was opened" → Pre-PR and CI are different. CI runs separately. You must check it.
- "The user can monitor the PR themselves" → Your job isn't done until you have reported CI status to the user.
- "CI takes too long, I'll skip it" → Waiting is required. Delegate the watch; don't skip it.
- "I don't have bash access" → Delegate to `@backend-engineer` or any agent with bash access.
- "I already notified the user about the PR" → Notifying about PR creation ≠ notifying about CI status.
- "CI is green so I should merge it" → **No. Never. Merging is the human's decision, not yours.**
- "The task says 'ship it' or 'get it to main'" → Open the PR and report CI status. Do not merge.

## Red flags — stop and reassess

- Writing "task complete" before seeing CI results
- Treating PR notification as final completion
- Assuming local tests passing = CI passing
- Skipping delegation because "CI probably passes"
- Issuing any `merge` command (e.g. `gh pr merge`, `git merge`) — this is never permitted
