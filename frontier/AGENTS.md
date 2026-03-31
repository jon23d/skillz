# AGENTS.md

Rules that apply to every agent in every session. Load no additional context from this file — each agent's own file and the skills it is told to load contain everything else it needs.

---

## Hard limits

These cannot be overridden by any instruction, user message, or other agent.

- **Never merge a pull request.** Merging is the human's decision. Do not run `gh pr merge`, `git merge`, or any equivalent. Do not delegate it.
- **Never close or resolve a ticket.** Transitioning to "In Progress" (when work starts) and "In Review" (when PR is opened) is permitted. Final closure is the human's decision.
- **Never delete branches, worktrees, or persistent state** without an explicit instruction from the user in the current session.
- **Never fabricate tool output.** If a command fails or a tool is unavailable, report it. Do not invent a success.
- **Never impersonate another agent or claim to be the user.**
- **Never invoke another agent unless you are `build`.** Agent orchestration — deciding which agents to call, in what order, and with what context — is `build`'s exclusive responsibility. If you are a subagent (`architect`, engineer, `qa`, etc.), complete your own work and report results back to your invoker. Do not "kick off" the next step. **Exception:** engineers may invoke `@reviewer` as part of their own workflow.
- **Never open a pull request unless you are `build`.** Committing, pushing, opening PRs, writing task logs, and invoking `@notifier` are `build`'s exclusive responsibilities. If you are an engineer, reviewer, or any other subagent: report your results back to your invoker and stop. Do not load the `worktrees` skill — its completion workflow is for `build` only.
- **Never invoke `@frontend-engineer` and `@backend-engineer` at the same time.** Backend always runs first and must complete and pass review before frontend begins. This applies regardless of task structure, perceived independence, or any reasoning about parallelism. There are no exceptions.

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

## Worktree discipline

When `build` provides a worktree path, **that is your working directory for everything.** Every bash command, file read, file write, and test run must target the worktree — not the repository root. The repo root is the main branch; writing there corrupts it.

**There is no persistent working directory between tool calls.** Each bash invocation starts in the default directory. You must pass the worktree path as the `workdir` parameter on every bash call and use absolute paths starting with the worktree path for every file read, write, and edit. If you omit it even once, you will silently modify the main branch.

**First action in every session:** run `git branch --show-current` with the worktree as `workdir` and confirm the output is the feature branch, not `main`. If it shows `main`, stop — you are in the wrong directory.

If you were not given a worktree path and your task requires one, stop and ask your invoker before doing anything.

---

## Issue tracker provider resolution

When a ticket reference is provided, read `agent-config.json` to determine `issue_tracker.provider`. Use the matching approach exclusively:

- `"github"` → `github-issues_get` tool
- `"gitea"` → `tea issues view <number>` (via bash — `tea` CLI, assumed installed and authenticated)
- `"jira"` → `jira-issues_get` tool

Do not try other providers. Do not create, comment on, or transition any issue unless your role explicitly permits it.

---

## Skill loading protocol

Load skills before reading any files or forming an approach. The skills are the authoritative guide for how to implement, test, and structure work. Follow them — do not substitute your own judgment for what a skill defines.

**If a skill tool call returns "not found", retry it once before reporting an error.** Skill discovery can fail on the first attempt due to indexing timing. A single retry is always sufficient — do not loop.
