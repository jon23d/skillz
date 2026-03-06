---
name: gitea-issues
description: Use when a Gitea issue number is provided at the start of a session, or when posting progress updates, managing dependencies, or creating follow-up tickets on a Gitea instance.
---

# Gitea Issues

## Prerequisites

- `agent-config.json` at the project root containing `{ "issue_tracker": { "provider": "gitea", "gitea": { "repo_url": "https://gitea.example.com/owner/repo" } } }`. A `GITEA_REPO_URL` environment variable overrides this value.
- `GITEA_ACCESS_TOKEN` environment variable with `issue` read/write scope. Never stored in files.

If either is missing, the Gitea tools return a configuration error. Report it immediately; do not proceed.

## Session start

When the user provides a ticket number:

1. Call `gitea-get-issue` with that number
2. Read the full issue: title, description, labels, state, assignees, and all comments (comments are included in `gitea-get-issue` output)
3. Call `gitea-manage-dependencies` with `action: "list"` to check for blockers — if any blocking issues are open, surface them before proceeding
4. Treat the issue description as the authoritative spec; if it conflicts with the user's verbal summary, surface the discrepancy and confirm before proceeding
5. Post an opening comment with `gitea-add-comment`:

```
🚧 Picking up this ticket. Starting investigation.
```

Skip the opening comment if the issue is already closed.

## Reading comments

Comments are included in `gitea-get-issue` output. Each shows author, date, and body. Read carefully — they often contain clarifications, prior investigation notes, or scope changes that supersede the original description. A comment that contradicts the issue body takes precedence (it is more recent) unless the user says otherwise.

## Progress updates

Post comments at meaningful checkpoints — not after every file edit, but when a significant phase completes:
- After the implementation plan is confirmed
- After the first passing test (if TDD is in play)
- When blocked (with a description of the blocker)
- When handing off between work phases

Keep comments factual and brief:
```
✅ Implementation complete. Running reviewers now.
🚫 Blocked: users table missing email_verified column. Needs schema migration first.
```

## On completion

When all quality gates pass and the PR is opened:

```
✅ Complete. All quality gates passed.

PR: {pr_url}
Task log: agent-logs/YYYY-MM-DD-{slug}/log.md
```

Do not close the ticket. The user or team manages ticket state.

## Dependencies

- Check dependencies at session start (see above)
- Add a dependency: `gitea-manage-dependencies` with `action: "add"`, `issue_number`, `dependency_issue_number`
- Remove a dependency: `gitea-manage-dependencies` with `action: "remove"`

Always pass display numbers (the `#N` visible in the UI) — the tool resolves these to internal IDs automatically.

## Creating follow-up issues

If work reveals a bug, tech debt, or deferred item worth tracking, call `gitea-create-issue`. Include the current issue number in the body:

```
Discovered during work on #N. [Description of the follow-up.]
```

## Tool reference

- `gitea-get-issue` — read issue details and comments; use at session start and whenever you need to re-read the ticket
- `gitea-list-issues` — list open tickets
- `gitea-create-issue` — create follow-up or child tickets
- `gitea-update-issue` — update issue fields (only when user explicitly requests it)
- `gitea-manage-dependencies` — list, add, or remove blocking dependencies
- `gitea-create-pr` — open a PR on completion (coordinated by the `worktrees` skill)
- `gitea-add-comment` — progress updates, blockers, completion notes

## Error handling

If any Gitea tool returns an error: report it immediately, do not retry more than once, and continue the engineering work regardless. Ticket tracking must never block the actual task.
