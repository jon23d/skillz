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

The `default_branch` field is optional (defaults to `main`).

## Step 2: Install and authenticate the `tea` CLI

Install from https://gitea.com/gitea/tea, then authenticate:

```bash
tea login add --name myinstance --url https://gitea.example.com --token <your-token>
```

Agents assume `tea` is already installed and authenticated. If `tea --version` fails, they will stop and ask you to install it.

## Step 3: Set the access token environment variable

```bash
export GITEA_ACCESS_TOKEN=<your-token>
```

Add this to your shell profile or `.env` file. The token needs repo read/write and issue read/write scopes.
