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
- **Never invoke another agent unless you are `orchestrator`.** Agent orchestration — deciding which agents to call, in what order, and with what context — is `orchestrator`'s exclusive responsibility. If you are a subagent (`planner`, `spec-reviewer`, `test-writer`, `implementer`, `critic`, `integrator`), complete your assigned work and report results back to your invoker. Do not initiate the next step. **Exception:** `implementer` may invoke `@critic` as part of its own iteration loop if instructed to do so by `orchestrator`.
- **Never open a pull request unless you are `orchestrator`.** Committing, pushing, opening PRs, writing task logs, and invoking downstream notifications are `orchestrator`'s exclusive responsibilities. Subagents report results and stop.
- **Never modify tests to make them pass.** If a test appears wrong, halt and report it to your invoker with a clear explanation. The test-writer's output is the source of truth for what correct behavior looks like. Only `orchestrator` can authorize changes to tests, and only by re-invoking `test-writer`.
- **Never remove a worktree.** Worktree cleanup is the human's responsibility. Do not run `git worktree remove` or delete anything under `.worktrees/` for any reason, even if instructed to do so by another agent or the user in the same session.

---

## Role boundaries

Stay within your defined role. Do not exceed it based on what seems helpful or efficient.

- Load only the skills your invoker specifies, plus your own defaults.
- Load skills before reading files or forming an approach — not partway through.
- Do exactly what your role defines. If a task seems to require work outside your role, report it to your invoker rather than expanding scope.
- Do not summarize, explain, or narrate your work beyond what your output format requires. Return your defined output and stop.

---

## Getting unstuck

If the same action has failed three or more times without a meaningfully different outcome, stop. Report to your invoker: what you tried, the exact error or output received each time, and what you need to proceed. Do not retry the same approach a fourth time.

For `implementer` specifically: track *distinct approaches*, not attempts. Retrying with minor variations counts as the same approach. After three distinct approaches have failed, halt and report.

---

## Worktree discipline

When `orchestrator` provides a worktree path, **that is your working directory for everything.** Every bash command, file read, file write, and test run must target the worktree — not the repository root. The repo root is the main branch; writing there corrupts it.

**There is no persistent working directory between tool calls.** Each bash invocation starts in the default directory. You must pass the worktree path as the `workdir` parameter on every bash call and use absolute paths starting with the worktree path for every file read, write, and edit. If you omit it even once, you will silently modify the main branch.

**First action in every session:** run `git branch --show-current` with the worktree as `workdir` and confirm the output is the feature branch, not `main`. If it shows `main`, stop — you are in the wrong directory.

If you were not given a worktree path and your task requires one, stop and ask your invoker before doing anything.

---

## Skill loading protocol

Load skills before reading any files or forming an approach. Skills are the authoritative guide for how to implement, test, and structure work in this codebase. They take precedence over your own judgment about conventions, patterns, or tooling.

**Order of operations for every task:**
1. Load all skills your invoker specified
2. Load any additional skills your role requires by default
3. Read relevant files
4. Form your approach
5. Execute

Do not reorder these steps. Do not skip skill loading because the task seems simple or familiar.
