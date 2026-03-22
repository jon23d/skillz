---
name: git-host-pr
description: Push a branch and open a pull request on the configured git host. Use when orchestrator is ready to open a PR after integration and documentation are complete.
---

# Git Host: Pull Request

Pushes the feature branch and opens a pull request. Only orchestrator should invoke this skill.

## Setup

Read `agent-config.json` from the repository root:

```bash
cat agent-config.json
```

Use `git_host.provider` to select the correct commands. Use `git_host.<provider>.default_branch` as the PR base branch.

---

## Pre-flight

Before opening the PR, confirm from the worktree:

```bash
# Confirm you are on the feature branch
git -C <worktree_path> branch --show-current

# Confirm there are no uncommitted changes
git -C <worktree_path> status --porcelain
```

If there are uncommitted changes, commit them first:

```bash
git -C <worktree_path> add -A
git -C <worktree_path> commit -m "<commit message>"
```

Commit message format: `feat(<scope>): <ticket-id> <short description>`

---

## GitHub

### Required
- `gh` CLI installed and authenticated

### Push and open PR

```bash
# Push the branch
git -C <worktree_path> push origin <branch-name>

# Open the PR
gh pr create \
  --title "<ticket-id>: <ticket-title>" \
  --body "<pr-body>" \
  --base <git_host.github.default_branch> \
  --label "<label>" \
  --repo <git_host.github.repo_url>
```

### PR body format

```markdown
## Summary
<one paragraph description of what this PR does>

## Ticket
Closes #<ticket-id>

## Changes
<bullet list of significant changes by file or area>

## Testing
- All existing tests pass
- New tests added for: <list of new test coverage>
```

### Labels

Apply labels based on the task scopes from the planner output:
- `backend` — if any tasks had `scope: "backend"`
- `frontend` — if any tasks had `scope: "frontend"`
- `full-stack` — if both backend and frontend tasks were present

Create labels if they don't exist:

```bash
gh label create "backend" --color "0075ca" --repo <repo_url>
gh label create "frontend" --color "d93f0b" --repo <repo_url>
gh label create "full-stack" --color "0e8a16" --repo <repo_url>
```

### Capture PR URL

```bash
gh pr view --json url --repo <repo_url> | grep url
```

Hold this URL — report it to the user at the end of the pipeline.

---

## Gitea

### Required
- `GITEA_TOKEN` environment variable set
- `GITEA_URL` environment variable set

### Push the branch

```bash
git -C <worktree_path> push origin <branch-name>
```

### Open the PR

```bash
curl -s -X POST \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<ticket-id>: <ticket-title>",
    "body": "<pr-body>",
    "head": "<branch-name>",
    "base": "<git_host.gitea.default_branch>",
    "labels": [<label-ids>]
  }' \
  "$GITEA_URL/api/v1/repos/<owner>/<repo>/pulls"
```

The response contains `html_url` — hold this as the PR URL.

---

## Error handling

If the push fails, report the error and halt — do not attempt to open a PR against an unpushed branch.

If the PR creation fails after a successful push, report the error with the branch name so the user can open the PR manually. Do not retry more than once.
