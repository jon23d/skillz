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

## Tools

Each provider has a single tool file with named exports. The tool name format is `<file>_<export>`.

**GitHub** (`provider: "github"`) — tools prefixed `github-issues_`:
- `github-issues_get` — read issue + comments
- `github-issues_create` — create issue
- `github-issues_update` — update title, body, state, labels, assignees
- `github-issues_list` — list issues
- `github-issues_search` — search by keyword
- `github-issues_comment` — add comment
- `github-issues_transition` — open or close (`"open"` / `"closed"`)

**Gitea** (`provider: "gitea"`) — tools prefixed `gitea-issues_`:
- `gitea-issues_get` — read issue + comments + attachments
- `gitea-issues_create` — create issue
- `gitea-issues_update` — update title, body, state, assignees
- `gitea-issues_list` — list issues
- `gitea-issues_search` — search by keyword
- `gitea-issues_comment` — add comment
- `gitea-issues_transition` — open or close
- `gitea-issues_upload_attachment` — upload file to issue

**Jira** (`provider: "jira"`) — tools prefixed `jira-issues_`:
- `jira-issues_get` — read issue + comments + attachments
- `jira-issues_create` — create issue
- `jira-issues_update` — update summary, description, labels
- `jira-issues_list` — list issues (uses JQL internally)
- `jira-issues_search` — search by keyword or JQL
- `jira-issues_comment` — add comment
- `jira-issues_transition` — change status; omit status to list available transitions
- `jira-issues_upload_attachment` — upload file to issue

## Provider differences

- **GitHub has no attachment API.** The REST API does not support uploading or reading attachments on issues. Do not attempt it — the tool will return an error. Use inline image links or commit screenshots to the branch instead.
- **Jira transitions are workflow-specific.** Call `jira-issues_transition` without a `status` to list what's available for that issue before transitioning.
- **Jira search accepts plain text or JQL.** Plain text is automatically scoped to the configured project. JQL gives full control: `status = "In Progress" AND assignee = currentUser()`.
- **Jira transitions to "In Progress" auto-assign** to the `JIRA_EMAIL` env var user.
