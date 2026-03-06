---
name: jira
description: Use when the issue tracker provider is "jira" in agent-config.json — covering session start, status transitions, progress tracking, and PR linking on Jira tickets.
---

# Jira

Load this skill when `agent-config.json` has `issue_tracker.provider = "jira"`. Do not load alongside `gitea-issues` or `github-issues`.

## Configuration check

Before using any Jira tool, call `jira-get-issue` with any known issue key. If it returns a configuration error referencing `JIRA_SETUP.md`, stop and show the user that message. The most common causes are missing `JIRA_EMAIL` or `JIRA_API_TOKEN` environment variables.

## Session start

When the user provides a ticket key:

1. Call `jira-get-issue` to read the issue
2. Use the issue description as the authoritative spec; surface any conflict with the user's verbal summary and confirm before proceeding
3. Read the `## Comments` section — comments take precedence over the description when they conflict (they are more recent); look for blocking conditions and clarifications
4. Transition to "In Progress": call `jira-transition-issue` without `transition_name` first to see available transitions, then apply the appropriate one. If no suitable transition exists, skip and note it.
5. Post an opening comment with `jira-add-comment`:

```
🤖 Starting work on this ticket.

Spec understood: {one-sentence summary}

Branch: feature/{slug}
```

## Issue key format

Jira keys are `PROJ-123` (project key + number). Always use the full key when calling Jira tools. For session naming, use: `PROJ-N - {slug}`.

## Progress updates

Post comments at key milestones using `jira-add-comment`:
- When a significant sub-task is complete
- When blocked: describe what is blocked and why
- When unblocked: note what resolved it

Keep comments brief — the PR body is the detailed log.

## Assigning issues

Jira Cloud uses opaque `accountId` strings, not usernames:
1. Call `jira-search-users` with the person's name or email to get their `accountId`
2. Call `jira-assign-issue` with that `accountId`

Never guess or fabricate an `accountId`.

## Checking dependencies

Use `jira-search-issues` with JQL like `issue in linkedIssues("PROJ-123", "is blocked by")` to check for blockers before starting work.

## Linking a PR

When the PR is opened, call `jira-link-pr` with `issue_key`, `pr_url`, and `pr_title`. This posts a comment on the ticket linking the PR.

## On completion

```
✅ Complete. All quality gates passed.

PR: {pr_url}
Task log: agent-logs/YYYY-MM-DD-{slug}/log.md
```

Do not close or mark the ticket Done. The user manages final ticket state.

## Tool reference

- `jira-get-issue` — read issue details and comments
- `jira-search-issues` — JQL search
- `jira-create-issue` — create a new issue
- `jira-update-issue` — update issue fields
- `jira-add-comment` — post a comment
- `jira-transition-issue` — change status
- `jira-assign-issue` — assign to a user (requires `accountId` from `jira-search-users`)
- `jira-link-pr` — link PR URL and create issue links
- `jira-upload-attachment` — upload screenshots or files to the ticket
- `jira-search-users` — resolve name or email to `accountId`
