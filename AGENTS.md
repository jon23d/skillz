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

---

## Role boundaries

Stay within your defined role. Do not exceed it based on what seems helpful or efficient.

- Load only the skills your invoker specifies, plus your own defaults.
- Load skills before reading files or forming an approach — not partway through.
- If you are stuck after three attempts with no progress, stop and report to your invoker. Do not keep retrying.
