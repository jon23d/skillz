---
name: pipeline-watch
description: Use when a PR has been opened and CI/pipeline checks must be monitored before declaring the task complete. Use when asked to "watch the pipeline", "wait for CI", "make sure checks pass", or "don't declare done until CI is green". Apply after every PR is opened.
---

# Pipeline Watch

Opening a PR is not done. Done means the PR is mergeable — CI is green.

## When to use

Apply immediately after a PR is opened. The task is not complete until all required checks pass or a failure is handled.

## What "done" means

- **Wrong:** PR exists
- **Correct:** PR exists AND all required CI checks are green

Pre-PR quality gates (local tests, linting, code review) are not the same as CI pipeline checks. CI may run matrix builds, integration tests, deployment previews, or security scans that never ran locally.

## Steps

After opening the PR:

1. **Get the PR number** — you have this from the `github-prs_create` or `gitea-prs_create` response
2. **Wait for checks to register** — delegate to an agent with bash access: `sleep 30`
3. **Poll check status** — delegate: `gh pr checks <PR-number> --watch`
4. **Handle the result:**
   - All green → proceed to completion (update log.md, notify)
   - Any failing → see Failure Handling below
   - Timeout (>20 min still pending) → report to user, do not declare done

## Commands to delegate

Delegate to `@backend-engineer` or any agent with bash access.

**GitHub** (`git_host.provider: "github"`):
```bash
# Wait for checks to register, then watch until terminal state
sleep 30 && gh pr checks <PR-number> --watch
```

**Gitea** (`git_host.provider: "gitea"`): `gh` does not work with Gitea. Use the Gitea API directly:
```bash
# Poll Gitea commit status — replace GITEA_URL, OWNER, REPO, SHA
curl -s "https://GITEA_URL/api/v1/repos/OWNER/REPO/statuses/SHA" \
  -H "Authorization: token $GITEA_ACCESS_TOKEN" \
  | jq '[.[] | {context, state}]'
# state values: pending, success, error, failure, warning
# Get the branch SHA: git rev-parse HEAD
```
Poll every 30s until all statuses are non-pending, or 20 minutes elapses.

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
- "The user can monitor the PR themselves" → Your job isn't done until the PR is mergeable.
- "CI takes too long, I'll skip it" → Waiting is required. Delegate the watch; don't skip it.
- "I don't have bash access" → Delegate to `@backend-engineer` or any agent with bash access.
- "I already notified the user about the PR" → Notifying about PR creation ≠ notifying about CI status.

## Red flags — stop and reassess

- Writing "task complete" before seeing CI results
- Treating PR notification as final completion
- Assuming local tests passing = CI passing
- Skipping delegation because "CI probably passes"
