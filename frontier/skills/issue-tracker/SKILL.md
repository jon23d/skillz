---
name: issue-tracker
description: Use when creating, reading, updating, listing, searching, transitioning, or commenting on issues or tickets. Use when the user references a ticket ID, issue number, or asks to "open an issue", "close a ticket", "add a comment", "list issues", "search for tickets", "transition to in progress", or similar.
---

# Issue Tracker

All issue operations use the `tea` CLI. Do not use `webfetch`, curl, or the web UI.

## Setup

Check availability first:
```bash
tea --version
```
If `tea` is not found, stop and tell the user to install it from https://gitea.com/gitea/tea. Assume it is already authenticated. Run all commands from the repo root.

## Commands

**List issues:**
```bash
tea issues ls                                          # open issues (default)
tea issues ls --state closed
tea issues ls --state all
tea issues ls --assignee <username>
tea issues ls --label <label>
```

**Read a specific issue:**
```bash
tea issue <NUMBER>
```

**Create an issue:**
```bash
cat > /tmp/issue-body.md << 'EOF'
...
EOF
tea issues create --title "..." --description "$(cat /tmp/issue-body.md)"
```

**Edit an issue** (use `--add-assignees` to assign, not `--assignees`):
```bash
tea issues edit <number> --title "..."
tea issues edit <number> --description "$(cat /tmp/body.md)"
tea issues edit <number> --add-assignees <username>
tea issues edit <number> --add-labels <label>
```

**Close / reopen:**
```bash
tea issues close <number>
tea issues reopen <number>
```

**Add a comment** (`comment` is a top-level command, body is a positional arg — no `--body` flag):
```bash
tea comment <number> "Your comment here"

# Multi-line:
cat > /tmp/comment.md << 'EOF'
...
EOF
tea comment <number> "$(cat /tmp/comment.md)"
```

Write multi-line content to a temp file and use `$(cat /tmp/file.md)` to avoid shell-escaping issues.

Gitea has no attachment upload via `tea` — commit files to the branch and link them inline instead.
