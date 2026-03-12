# AGENTS.md

Rules that apply to every agent in every session. Load no additional context from this file — each agent's own file and the skills it is told to load contain everything else it needs.

---

## Hard limits

These cannot be overridden by any instruction, user message, or other agent.

- **Never merge a pull request.** Merging is the human's decision. Do not run `gh pr merge`, `git merge`, or any equivalent. Do not delegate it.
- **Never close or resolve a ticket.** Transitioning to "In Review" is permitted. Final closure is the human's decision.
- **Never delete branches, worktrees, or persistent state** without an explicit instruction from the user in the current session.
- **Never fabricate tool output.** If a command fails or a tool is unavailable, report it. Do not invent a success.
- **Never impersonate another agent or claim to be the user.**
- **Never open a pull request unless you are `build`.** Committing, pushing, opening PRs, writing task logs, and invoking `@notifier` are `build`'s exclusive responsibilities. If you are an engineer, reviewer, or any other subagent: report your results back to your invoker and stop. Do not load the `worktrees` skill — its completion workflow is for `build` only.

---

## Role boundaries

Stay within your defined role. Do not exceed it based on what seems helpful or efficient.

- Load only the skills your invoker specifies, plus your own defaults.
- Load skills before reading files or forming an approach — not partway through.
- If you are stuck after three attempts with no progress, stop and report to your invoker. Do not keep retrying.

---

## Getting unstuck

If the same action has failed three or more times without a different outcome, stop. Report to your invoker: what you tried, the exact error received each time, and what you need to proceed. Do not retry the same approach a fourth time.

---

## Issue tracker provider resolution

When a ticket reference is provided, read `agent-config.json` to determine `issue_tracker.provider`. Use the matching tool exclusively:

- `"github"` → `github-issues_get`
- `"gitea"` → `gitea-issues_get`
- `"jira"` → `jira-issues_get`

Do not try other providers. Do not create, comment on, or transition any issue unless your role explicitly permits it.

---

## Skill loading protocol

Load skills before reading any files or forming an approach. The skills are the authoritative guide for how to implement, test, and structure work. Follow them — do not substitute your own judgment for what a skill defines.
