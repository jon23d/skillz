# Jira Setup

Two environment variables and an `agent-config.json` entry. No OAuth apps, no browser flows, no tokens that expire.

---

## Step 1: Create an API token

1. Go to [id.atlassian.com/manage-api-tokens](https://id.atlassian.com/manage-api-tokens)
2. Click **Create API token**
3. Give it a label (e.g. "OpenCode")
4. Copy the token — you will not see it again

API tokens do not expire. You can revoke them at any time from the same page.

---

## Step 2: Set environment variables

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export JIRA_EMAIL=you@yourcompany.com
export JIRA_API_TOKEN=your-token-here
```

Reload your shell or run `source ~/.zshrc` (or equivalent).

Optionally, if you want to override the site URL or project key at runtime:

```bash
export JIRA_BASE_URL=https://mycompany.atlassian.net
export JIRA_PROJECT_KEY=PROJ
```

---

## Step 3: Add `agent-config.json` to your project

Create `agent-config.json` at the root of the project you are working on (not this config repo). This file contains no secrets and can be committed:

```json
{
  "issue_tracker": {
    "provider": "jira",
    "jira": {
      "base_url": "https://mycompany.atlassian.net",
      "project_key": "PROJ"
    }
  },
  "git_host": {
    "provider": "gitea",
    "gitea": {
      "repo_url": "https://git.example.com/owner/repo"
    }
  }
}
```

Replace `base_url` with your Atlassian site URL and `project_key` with your default project key.

---

## Step 4: Verify

Ask the build agent to list open issues:

> "Show me the open Jira tickets"

If credentials are missing or wrong, the tools return a clear error message telling you exactly which variable to set.

---

## How it works

Authentication uses **HTTP Basic Auth**: your email as the username and the API token as the password, encoded as `Base64(email:token)` in the `Authorization` header. This is Atlassian's standard method for personal API access.

The API base is constructed directly from `base_url`:

```
https://mycompany.atlassian.net/rest/api/3
```

No cloud ID resolution, no OAuth token exchange, no session state.

---

## Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `JIRA_EMAIL` | Yes | Your Atlassian account email. Also used as your identity — issues are auto-assigned to this account when transitioning to In Progress, and `jira-assign-issue` accepts `"me"` to assign to this address. |
| `JIRA_API_TOKEN` | Yes | API token from id.atlassian.com/manage-api-tokens |
| `JIRA_BASE_URL` | No | Overrides `agent-config.json` base_url at runtime |
| `JIRA_PROJECT_KEY` | No | Overrides `agent-config.json` project_key at runtime |

---

## Troubleshooting

**"Jira credentials missing"** — `JIRA_EMAIL` or `JIRA_API_TOKEN` is not set. Check your shell profile and reload it.

**401 Unauthorized** — The email/token combination is wrong. Verify you are using the correct Atlassian account email and that the token was copied correctly (no extra whitespace).

**404 on issue keys** — The `base_url` or `project_key` in `agent-config.json` does not match your Jira site. Verify the URL is exactly `https://yourcompany.atlassian.net` with no trailing slash.

**Field validation errors on create/update** — Your Jira project may have required custom fields. Check the error details returned by the tool and add the missing fields to your request.

