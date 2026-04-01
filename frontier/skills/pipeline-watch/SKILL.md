---
name: pipeline-watch
description: Use when a PR has been opened and CI/pipeline checks must be monitored before declaring the task complete. Use when asked to "watch the pipeline", "wait for CI", "make sure checks pass", or "don't declare done until CI is green". Apply after every PR is opened.
---

# Pipeline Watch

> **Disabled** — do not load or follow this skill. The `tea` CLI has a known bug affecting pipeline status polling. CI monitoring is the user's responsibility for now. The task is complete once the PR is open and `@notifier` has been invoked.

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

1. **Get the branch name** — `git branch --show-current`
2. **Wait for the run to register** — `sleep 30`
3. **Poll until terminal** — see Commands below
4. **Handle the result:**
   - All green → proceed to completion (notify)
   - Any failing → see Failure Handling below
   - Timeout (>20 min still pending) → report to user, do not declare done

## Commands

Run from the repo root. `REMOTE_URL=$(git remote get-url origin)` gives you the base for API calls (e.g. `http://gitea.example.com`). Parse owner and repo from it.

**Poll run status for the current branch:**
```bash
BRANCH=$(git branch --show-current)

# Wait for any run to appear for this branch, then poll until terminal
while true; do
  RESULT=$(tea runs list --output json \
    | jq -r --arg b "$BRANCH" \
        '[.[] | select(.head_branch == $b)] | first | .status // "pending"')
  echo "CI status: $RESULT"
  case "$RESULT" in
    success)   echo "CI passed"; break ;;
    failure|cancelled) echo "CI failed"; break ;;
  esac
  sleep 30
done
```

**Get the run ID** (needed for failure details):
```bash
RUN_ID=$(tea runs list --output json \
  | jq -r --arg b "$BRANCH" \
      '[.[] | select(.head_branch == $b)] | first | .id')
```

**Fetch failure details via Gitea API:**
```bash
# List jobs for the run and find failed ones
curl -s -H "Authorization: token ${GITEA_ACCESS_TOKEN}" \
  "${GITEA_URL}/api/v1/repos/{owner}/{repo}/actions/runs/${RUN_ID}/jobs" \
  | jq '.workflow_runs[] | select(.conclusion == "failure") | {name, conclusion}'

# Fetch logs for a specific job
curl -s -H "Authorization: token ${GITEA_ACCESS_TOKEN}" \
  "${GITEA_URL}/api/v1/repos/{owner}/{repo}/actions/jobs/{job_id}/logs"
```

**Re-run a failed workflow:**
```bash
curl -s -X POST \
  -H "Authorization: token ${GITEA_ACCESS_TOKEN}" \
  "${GITEA_URL}/api/v1/repos/{owner}/{repo}/actions/runs/${RUN_ID}/rerun"
```

## Failure Handling

When a check fails:

1. Get the run ID and fetch job logs using the API commands above
2. Classify the failure from the log output:
   - **Formatting/lint** (e.g., prettier, eslint) → delegate fix to the responsible engineer, push, re-watch
   - **Flaky test** (intermittent, unrelated to this change) → re-run via the rerun API; if it passes on retry, proceed
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
