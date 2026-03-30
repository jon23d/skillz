---
name: issue-tracker
description: Use when creating, reading, updating, listing, searching, transitioning, or commenting on issues or tickets. Use when the user references a ticket ID, issue number, or asks to "open an issue", "close a ticket", "add a comment", "list issues", "search for tickets", "transition to in progress", "upload attachment", or similar. Apply regardless of provider (GitHub, Gitea, Jira).
---

# Issue Tracker

All issue and ticket operations must go through the issue tracker tools. Do not use `bash`, `webfetch`, or curl to interact with issue trackers directly.

## Setup — read agent-config.json first

Before using any tool, read `agent-config.json` in the project root to identify the provider:

```json
{
  "issue_tracker": {
    "provider": "jira",
    "jira": { "base_url": "https://example.atlassian.net", "project_key": "PROJ" }
  }
}
```

Supported providers: `github`, `gitea`, `jira`. If `agent-config.json` is missing or `issue_tracker` is not configured, tell the user and stop. For credential setup, refer to `JIRA_SETUP.md`, `GITHUB_SETUP.md`, or `GITEA_SETUP.md`.

## GitHub provider — use gh CLI

Use the `gh` CLI as documented in `skills/github/SKILL.md`. Check `gh auth status` first — if unavailable or unauthenticated, stop and tell the user.

## Gitea provider — use tea CLI

Check availability first:
```bash
tea --version
```
If `tea` is not found, stop immediately and tell the user to install it from https://gitea.com/gitea/tea. Do not proceed. Assume it is already authenticated.

Run all `tea` commands from the worktree directory so it picks up the repo context.

```bash
tea issues list [--state open|closed] [--label <label>] [--assigned]
tea issues view <number>
tea issues create --title "..." --description "..."
tea issues edit <number> [--title "..."] [--description "..."] [--assignees "..."] [--labels "..."]
tea issues close <number>
tea issues reopen <number>
tea issues comment <number> --body "..."
```

Gitea has no attachment upload via `tea` — commit files to the branch and link them inline instead.

## Jira provider — use jira-issues_* tools

- `jira-issues_get` — read issue + comments + attachments
- `jira-issues_create` — create issue
- `jira-issues_update` — update summary, description, labels
- `jira-issues_list` — list issues (uses JQL internally)
- `jira-issues_search` — search by keyword or JQL
- `jira-issues_comment` — add comment
- `jira-issues_transition` — change status; omit status to list available transitions
- `jira-issues_upload_attachment` — upload file to issue

Jira transitions are workflow-specific — call `jira-issues_transition` without a `status` to list available transitions first. Search accepts plain text or JQL. Transitions to "In Progress" auto-assign to the `JIRA_EMAIL` env var user.
