---
name: project-manager
description: Use when managing ROADMAP.md, writing task logs, or planning a batch of work for a session.
---

# Project Manager

## Roadmap format

Maintain `ROADMAP.md` at the project root:

```markdown
# Roadmap

## In Progress
- [ ] [TASK-N] Short description — started: YYYY-MM-DD

## Completed
- [x] [TASK-N] Short description — completed: YYYY-MM-DD

## Backlog
- [ ] [TASK-N] Short description — priority: high | medium | low
```

Rules:
- Task IDs are sequential integers, never reused
- Descriptions are 80 characters or fewer
- Move items to Completed (never delete them) when done
- Keep Backlog sorted by priority descending
- Maximum 3 items In Progress at once — more than 3 is a risk to surface

## Task log format

Each completed task gets a file at `agent-logs/YYYY-MM-DD-HH-MM/{task-name}.md`:

```markdown
# Task: {title}
**ID**: TASK-N
**Date**: YYYY-MM-DD
**Agent**: engineer

## What was done
Short prose description of what changed and why.

## Files changed
- `path/to/file.ts` — reason

## Tests added
- Description of each new test

## Screenshots
- `agent-logs/YYYY-MM-DD-HH-MM/screenshot.png` — description
(or "None" if no UI work was done)

## Reviewer findings
- code-reviewer: pass | pass_with_issues — {notes}
- security-reviewer: pass | pass_with_issues — {notes}
- observability-reviewer: pass | pass_with_issues — {notes}

## QA verdict
pass | pass_with_issues | skipped — {notes}

## Follow-up items
- Any tech debt, deferred work, or open questions to track
```

The filename is the task description in kebab-case (e.g. `add-user-auth.md`). The timestamp is the folder name, not part of the filename.

## Session planning

At the start of a session:
1. Read `ROADMAP.md`
2. Confirm any In Progress items are still active, or move them to Backlog
3. Ask the user to confirm the next 1–3 tasks to work on
4. Check for blockers on high-priority Backlog items
