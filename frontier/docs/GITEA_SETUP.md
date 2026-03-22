# Gitea Setup

This document covers how to configure the Gitea integration for OpenCode.
Configuration is split between `agent-config.json` (non-secret, safe to commit)
and environment variables (secrets).

---

## Step 1: Add `agent-config.json` to your project

Create `agent-config.json` at the root of your project:

```json
{
  "issue_tracker": {
    "provider": "gitea",
    "gitea": {
      "repo_url": "https://gitea.example.com/your-org/your-repo"
    }
  }
}
```

Replace the `repo_url` with your Gitea repository URL.

---

## Step 2: Create a Gitea access token

1. Log in to your Gitea instance
2. Go to **Settings → Applications → Access Tokens**
3. Create a token with **Issue** and **Repository** read/write scopes
4. Copy the token — Gitea only shows it once

---

## Step 3: Set the access token as an environment variable

```bash
export GITEA_ACCESS_TOKEN=your_token_here
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.) so it's set
automatically on every session.

---

## Step 4: Verify

Ask the agent to list open issues:

> "Show me the open Gitea issues"

If the token is missing or the config is wrong, the tools return a clear error
message telling you exactly what to set.

---

## How it works

All issue tools read from `agent-config.json → issue_tracker.gitea.repo_url`.
The `GITEA_REPO_URL` env var overrides this for a single session:

```bash
GITEA_REPO_URL=https://gitea.example.com/other-org/other-repo opencode
```

The access token is read from `GITEA_ACCESS_TOKEN` only — never stored in files.

---

## Using Jira for issues and Gitea for code hosting

If Jira handles tickets but your code lives on Gitea, set `issue_tracker.provider`
to `jira`:

```json
{
  "issue_tracker": {
    "provider": "jira",
    "jira": {
      "base_url": "https://mycompany.atlassian.net",
      "project_key": "PROJ"
    }
  }
}
```

See `JIRA_SETUP.md` for Jira credentials.

---

## Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `GITEA_ACCESS_TOKEN` | Yes | Gitea personal access token |
| `GITEA_REPO_URL` | No | Overrides `agent-config.json` repo_url at runtime |

---

## Tool reference

All tools read from `issue_tracker.gitea.repo_url` (or `GITEA_REPO_URL`).

| Tool | Operation |
|---|---|
| `gitea-issues_get` | Read issue + comments + attachments |
| `gitea-issues_create` | Create issue |
| `gitea-issues_update` | Update title, body, state, assignees |
| `gitea-issues_list` | List issues |
| `gitea-issues_search` | Search by keyword |
| `gitea-issues_comment` | Add comment |
| `gitea-issues_transition` | Open or close issue |
| `gitea-issues_upload_attachment` | Upload file to issue |
