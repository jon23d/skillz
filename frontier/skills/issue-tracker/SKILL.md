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
If `tea` is not found, stop and tell the user to install it from https://gitea.com/gitea/tea. Assume it is already authenticated. Run all commands from the worktree directory.

## Commands

```bash
tea issues list [--state open|closed] [--label <label>] [--assigned]
tea issues view <number>
tea issues create --title "..." --description "$(cat /tmp/issue-body.md)"
tea issues edit <number> [--title "..."] [--description "..."] [--assignees "..."] [--labels "..."]
tea issues close <number>
tea issues reopen <number>
tea issues comment <number> --body "..."
```

Write multi-line bodies to a temp file and use `$(cat /tmp/file.md)` to avoid shell-escaping issues.

Gitea has no attachment upload via `tea` — commit files to the branch and link them inline instead.
