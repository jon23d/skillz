---
name: github-issues
description: Use when the issue tracker provider is "github" in agent-config.json — covering session start, progress tracking, PR linking, and completion comments on GitHub issues.
---

# GitHub Issues

Load this skill when `agent-config.json` has `issue_tracker.provider = "github"`. Do not load alongside `gitea-issues` or `jira`.

## Configuration check

Before using any GitHub tool, call `github-get-issue` with any known issue number. If it returns a configuration error, stop and show the user that message. Do not proceed until GitHub is configured.

## Session start

When the user provides an issue number:

1. Call `github-get-issue` to read the issue
2. Use the issue body as the authoritative spec; surface any conflict with the user's verbal summary and confirm before proceeding
3. Read the `## Comments` section returned by `github-get-issue` — comments take precedence over the body when they conflict (they are more recent); look for blocking conditions and clarifications
4. Post an opening comment with `github-add-comment`:

```
🤖 Starting work on this issue.

Spec understood: {one-sentence summary}

Branch: feature/{slug}
```

GitHub has no native "In Progress" status — use labels (e.g. "in progress") if the repository uses label-based workflows. Do not change issue state until the user asks.

## Issue number format

GitHub issues use plain numbers (`#42`). For session naming, use: `Issue #N - {slug}`.

## Progress updates

Post comments at key milestones using `github-add-comment`:
- When a significant sub-task is complete
- When blocked: describe what is blocked and why
- When unblocked: note what resolved it

Keep comments brief — the PR body is the detailed log.

## Linking a PR

When the PR is opened:

```
🔀 PR opened: {pr_url}
```

Including `Closes #N` or `Refs #N` in the PR body automatically cross-references the issue on GitHub (the `worktrees` skill PR template handles this).

## On completion

```
✅ Complete. All quality gates passed.

PR: {pr_url}
Task log: agent-logs/YYYY-MM-DD-{slug}/log.md
```

Do not close the issue. The user or team manages issue state.

## Screenshots

Screenshots are committed to `agent-logs/YYYY-MM-DD-{slug}/` in the feature branch and embedded in the PR body using relative paths — no external upload needed.

## Tool reference

- `github-get-issue` — read issue details and comments
- `github-list-issues` — list issues by state
- `github-create-issue` — create a new issue
- `github-update-issue` — update title, body, state, labels, assignees
- `github-add-comment` — post a comment
- `github-create-pr` — open a pull request
