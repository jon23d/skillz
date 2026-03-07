# GitHub Setup

This document covers how to configure the GitHub integration for OpenCode.

---

## Overview

The GitHub integration uses a **Personal Access Token (PAT)** for authentication.
No OAuth2 flow is required — you create the token once, store it as an environment
variable, and it works indefinitely (until you revoke it or it expires).

GitHub Enterprise Server is supported in addition to github.com.

---

## Step 1: Create a Personal Access Token

### github.com

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
   (or Classic tokens if you prefer — both work)
2. Click **Generate new token**
3. Set an expiration (recommended: 1 year; rotate when needed)
4. Select the repository (or repositories) this token will access
5. Grant the following permissions:
   - Issues: Read and write
   - Metadata: Read (required)
6. Click **Generate token** and copy the value — you will not see it again

### GitHub Enterprise Server

Same steps, but navigate to:
`https://{your-github-enterprise-host}/settings/tokens`

---

## Step 2: Set environment variables

Add the following to your shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
# Required
export GITHUB_ACCESS_TOKEN="github_pat_..."

# Optional — overrides agent-config.json repo_url at runtime
# export GITHUB_REPO_URL="https://github.com/owner/repo"
```

`GITHUB_ACCESS_TOKEN` is the only required secret. The repo URL lives in
`agent-config.json` (non-secret, safe to commit).

---

## Step 3: Configure `agent-config.json`

Create `agent-config.json` at the root of your project:

```json
{
  "issue_tracker": {
    "provider": "github",
    "github": { "repo_url": "https://github.com/owner/repo" }
  }
}
```

Replace the `repo_url` with your repository URL.

---

## Step 4: Verify

Ask the agent to list open issues:

> "Show me the open GitHub issues"

Or read a specific issue:

> "Load issue #42"

If the token is missing or invalid, the tools return a clear error message
telling you exactly which variable to set.

---

## GitHub Enterprise Server

The tools detect GitHub Enterprise automatically based on the hostname in
`repo_url`. If the hostname is not `github.com`, the API base is constructed as:

```
{origin}/api/v3/repos/{owner}/{repo}
```

No additional configuration is needed — just use your GitHub Enterprise URL
in `repo_url`.

---

## Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `GITHUB_ACCESS_TOKEN` | Yes | Personal access token (fine-grained or classic) |
| `GITHUB_REPO_URL` | No | Overrides `agent-config.json` repo_url at runtime |

---

## Tool reference

All tools read from `issue_tracker.github.repo_url` (or `GITHUB_REPO_URL`).

| Tool | Operation |
|---|---|
| `github-issues_get` | Read issue + comments |
| `github-issues_create` | Create issue |
| `github-issues_update` | Update title, body, state, labels, assignees |
| `github-issues_list` | List issues |
| `github-issues_search` | Search by keyword |
| `github-issues_comment` | Add comment |
| `github-issues_transition` | Open or close issue |

---

## Known limitations

- **No file attachments.** GitHub's REST API does not support uploading
  attachments to issues. If screenshots are needed, commit them to the feature
  branch and reference them with relative paths, or upload to an external host.

- **No issue dependency API.** GitHub has no native dependency tracking for
  issues. Dependencies cannot be managed programmatically.

- **Issues endpoint includes pull requests.** GitHub's list endpoint returns
  both issues and PRs. The `github-issues_list` tool filters PRs client-side,
  so only true issues are shown.
