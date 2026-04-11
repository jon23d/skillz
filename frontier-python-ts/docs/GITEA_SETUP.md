# Gitea Setup

## Step 1: Install and authenticate the `tea` CLI

Install from https://gitea.com/gitea/tea, then authenticate:

```bash
tea login add --name myinstance --url https://gitea.example.com --token <your-token>
```

Verify:
```bash
tea login ls
tea repos info
```

Agents assume `tea` is already installed and authenticated. If `tea --version` fails, they will stop and ask you to install it.

## Step 2: Set the access token environment variable

```bash
export GITEA_ACCESS_TOKEN=<your-token>
```

Add this to your shell profile or `.env` file. The token needs repo read/write and issue read/write scopes.

## That's it

No config files required. Agents derive the repo URL and default branch directly from git:

```bash
git remote get-url origin
git symbolic-ref refs/remotes/origin/HEAD
```
