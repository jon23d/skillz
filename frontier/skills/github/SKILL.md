---
name: github
description: Use when agent-config.json has provider "github" for issue_tracker or git_host. Covers all GitHub operations: issues, PRs, CI checks, and run management. Always use the gh CLI — never the REST API, curl, or github-issues_* tools.
allowed-tools: Bash(gh:*)
---

# GitHub via gh CLI

## Authentication — verify before every session

The very first action before any GitHub operation:

```bash
gh auth status
```

**If this command fails for any reason — gh not installed, not authenticated, token expired, wrong account — stop immediately. Do not attempt workarounds. Tell the user:**

> "gh is not available or not authenticated. To fix this:
> - Install: `brew install gh` (macOS) or `sudo apt install gh` (Linux)
> - Authenticate: `gh auth login`
>
> Let me know when that's done and I'll continue."

Never fall back to curl, the REST API, or `github-issues_*` tools. gh is the only permitted interface. No exceptions.

## Always filter output

Raw JSON responses are large. Always use `--json field1,field2` to select only the fields needed. Use `--jq` to shape or filter further.

```bash
# Bad — dumps the entire object, wastes context
gh pr view 42

# Good — only what's needed
gh pr view 42 --json number,title,state,body,headRefName
```

If you don't know which fields exist, run the command with `--json` (no fields) to get the field list, then re-run with only what you need.

## Issues

```bash
# View an issue
gh issue view 42 --json number,title,body,state,labels,comments \
  --jq '{number,title,state,body,labels:[.labels[].name]}'

# Create an issue
gh issue create --title "Bug: login fails on Safari" --body "Steps to reproduce..."

# List open issues
gh issue list --json number,title,state,labels \
  --jq '.[] | {number,title,labels:[.labels[].name]}'

# Search issues
gh issue list --search "login Safari" --json number,title,state

# Comment on an issue
gh issue comment 42 --body "Investigated — root cause is X."

# Close / reopen
gh issue close 42
gh issue reopen 42

# Edit title, labels, assignees
gh issue edit 42 --title "New title" --add-label "bug" --remove-label "needs-triage"
gh issue edit 42 --add-assignee "@me"
```

## Pull Requests

```bash
# Create a PR
gh pr create \
  --title "Fix: Safari login regression" \
  --body "$(cat <<'EOF'
## Summary
- Fixed X

## Test plan
- [ ] Tested locally
- [ ] E2E passes
EOF
)"

# View a PR
gh pr view 42 --json number,title,state,body,headRefName,reviews \
  --jq '{number,title,state,branch:.headRefName}'

# List open PRs
gh pr list --json number,title,state,headRefName \
  --jq '.[] | {number,title,branch:.headRefName}'

# Watch CI checks after opening a PR (see pipeline-watch skill)
sleep 30 && gh pr checks 42 --watch
```

## CI Runs

```bash
# List recent runs on the current branch
gh run list --branch "$(git branch --show-current)" \
  --json databaseId,status,conclusion,name \
  --jq '.[] | {id:.databaseId,name,status,conclusion}'

# Get logs for a failed run
gh run view <run-id> --log-failed

# Rerun a failed run
gh run rerun <run-id>
```

## Complex queries — use GraphQL

When you need nested or related data in one call (e.g. a PR plus its reviews and CI status), use `gh api graphql` instead of chaining multiple CLI calls. Request only the fields you need.

```bash
gh api graphql -f query='
  query($number: Int!, $owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        title
        state
        reviews(last: 5) { nodes { state author { login } } }
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
      }
    }
  }' -F number=42 -F owner=myorg -F repo=myrepo
```

Use GraphQL when a task would otherwise require 2+ separate CLI calls to assemble the same data.

## Decision guide

| Task | Command |
|---|---|
| Check auth | `gh auth status` |
| Read/write issues | `gh issue view/create/edit/comment/close` |
| Open a PR | `gh pr create` |
| Watch CI after PR | `gh pr checks <n> --watch` |
| Debug a failed run | `gh run view <id> --log-failed` |
| Nested data in one call | `gh api graphql` |
| Everything else | `gh <resource> <action> --json field1,field2` |

## Forbidden

- `curl`/`wget` against the GitHub REST API
- `github-issues_*` tools (legacy — replaced by this skill for GitHub provider)
- Unfiltered `gh` output (always use `--json`)
- Any GitHub operation if `gh auth status` fails
