# Gitea Setup

## Step 1: Add `agent-config.json` to your project

```json
{
  "issue_tracker": {
    "provider": "gitea",
    "gitea": {
      "repo_url": "https://gitea.example.com/your-org/your-repo"
    }
  },
  "git_host": {
    "provider": "gitea",
    "gitea": {
      "repo_url": "https://gitea.example.com/your-org/your-repo",
      "default_branch": "main"
    }
  }
}
```

## Step 2: Install and authenticate the `tea` CLI

Install from https://gitea.com/gitea/tea, then authenticate:

```bash
tea login add --name myinstance --url https://gitea.example.com --token <your-token>
```

Agents assume `tea` is already installed and authenticated. If `tea --version` fails, they will stop and ask you to install it.

## Using Jira for issues and Gitea for code hosting

Set `issue_tracker.provider` to `jira` and keep `git_host.provider` as `gitea`:

```json
{
  "issue_tracker": {
    "provider": "jira",
    "jira": { "base_url": "https://mycompany.atlassian.net", "project_key": "PROJ" }
  },
  "git_host": {
    "provider": "gitea",
    "gitea": { "repo_url": "https://gitea.example.com/your-org/your-repo" }
  }
}
```

See `JIRA_SETUP.md` for Jira credentials.
