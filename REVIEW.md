# Repository Review: skillz

**Date:** March 9, 2026
**Scope:** Full repo audit — structure, agents, tools, skills, docs

---

## Critical Issues

### 1. AGENTS.md is missing

The README (lines 181–189) describes an `AGENTS.md` at the repo root that "sets global rules for all agents" and is "read by all agents at startup." The file does not exist. This means the global guardrails the README promises (no reading/writing to `~/.opencode/skills`, test cleanup rules, etc.) are not actually enforced anywhere.

**Recommendation:** Create `AGENTS.md` with the rules the README already describes, or remove the section from the README if the rules live elsewhere.

### 2. README documents 11 skills; 38 actually exist

The Skills table in the README lists 11 skills. The `skills/` directory contains **38** skill folders. The 27 undocumented skills include critical ones that agents actively reference — `worktrees`, `observability`, `system-knowledge`, `testing-best-practices`, `mantine`, `prisma`, `tanstack-query`, `auth`, `stripe`, and more.

**Recommendation:** Regenerate the skills table from the directory. Even a one-liner per skill is better than omission.

### 3. JQL injection in jira-issues.ts

User-supplied values (`assignee`, `labels`) are interpolated directly into JQL strings without escaping:

```ts
const assigneeClause = params.assignee
  ? `AND assignee = "${params.assignee}"`
  : "";
```

A value like `foo" OR assignee = "bar` would break or manipulate the query.

**Recommendation:** Escape double-quotes in all user-supplied JQL fragments, or use Jira's parameterized search if the client library supports it.

---

## Structural Discrepancies

### 4. README repo-tree diagram is incomplete

The tree in the README shows only `build.md` under `agents/` and omits the other 12 agent files. It also omits `send-telegram.ts` from `tools/`. The tree should match reality or state that it's a representative subset.

### 5. Two agents undocumented in README

`local-task.md` (a privacy-focused local LLM agent) and `ticket-writer.md` (a PM agent that writes and posts tickets) exist in `agents/` but are not mentioned in the README's agent workflow description.

### 6. send-telegram.ts not documented

The tool exists in `tools/` but isn't listed in the README's tool tables. It also requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` environment variables that aren't in the README's env-var table.

### 7. install.sh path vs README path

The README says the repo can live at `~/.config/opencode/`. The install script hardcodes `$HOME/.opencode`. These should agree.

---

## Tool Implementation Issues

### 8. Duplicated config parsing in issue tools

Both `github-issues.ts` and `gitea-issues.ts` duplicate the URL-parsing and config-reading logic that already exists as helper functions in `lib/agent-config.ts` (`getGithubIssueConfig()`, `getGiteaIssueConfig()`). The PR tools use the helpers correctly; the issue tools don't.

### 9. Silent config failures

`agent-config.ts` wraps `readFileSync("agent-config.json")` in a try/catch that returns `{}` on any error — whether the file is missing, unreadable, or contains invalid JSON. This makes misconfiguration invisible until an API call fails downstream.

### 10. URL parsing is fragile

`parseGithubUrl()` and `parseGiteaUrl()` split on `/` and assume exactly `owner/repo` in positions `[3]` and `[4]`. A trailing slash, query parameter, or `.git` suffix would produce incorrect results. No validation follows.

### 11. Hard-coded Jira issue type

`jira-issues.ts` always creates issues with type `"Task"`. Projects using Story, Bug, Epic, or custom types can't use the create tool without modification. The type should be a parameter with `"Task"` as the default.

### 12. Hard-coded Jira transition name

The auto-assign on "In Progress" transition is a hard-coded string match. Jira instances with customized workflows (different status names or languages) will silently skip the auto-assignment.

### 13. No draft PR support

Both `github-prs.ts` and `gitea-prs.ts` hard-code `draft: false`. There's no parameter to open a draft PR. The build agent's workflow doesn't mention drafts either, but in practice many teams use them.

### 14. package.json uses `"latest"` for core dependency

`@opencode-ai/plugin` is pinned to `"latest"`, which means builds are not reproducible and a breaking change upstream would silently break all tools.

---

## Agent Ambiguities

### 15. build.md branch creation timing

Phase 3 sets up a worktree (which creates a branch), but Phase 4 step 5.8 says "Commit and push the feature branch" without confirming the branch already exists or naming it. The gap between worktree creation and the push step could confuse the agent.

### 16. developer-advocate.md subagent dispatch

The agent says to "dispatch the from-scratch run subagent as the skill instructs" but the mechanism for launching a subagent from within another agent isn't specified. The `from-scratch-run` skill itself references a `local-task` agent type — it's unclear if this is still current.

### 17. local-task.md scope

Marked "Invoked by Humans Only" and uses a local LLM model (`lmstudio/qwen3.5-35b-a3b`). It's unclear whether this is intentionally disconnected from the build workflow or just hasn't been integrated yet. No guidance on when a user should choose this over the normal agents.

### 18. Reviewer concurrency

The three reviewer agents (`code-reviewer`, `security-reviewer`, `observability-reviewer`) are invoked by both `@backend-engineer` and `@frontend-engineer`. If both engineers run in parallel (as the build agent intends), there's no documented queueing or conflict resolution for simultaneous reviewer invocations.

---

## Skills Issues

### 19. Reference files are all present but not discoverable

Skills like `prisma`, `mantine`, `rest-api-design`, `postgres-schema-design`, `multi-tenancy`, `auth`, and `tanstack-query` each have `references/` subdirectories with supplementary docs. These are not mentioned in the README's skill table and wouldn't be found by someone scanning just the SKILL.md files' frontmatter.

### 20. Naming inconsistency: tdd vs test-driven-development

The directory is named `test-driven-development` but the SKILL.md frontmatter uses `name: tdd`. Agents that try to load by directory name vs. frontmatter name could get confused depending on how OpenCode resolves skill references.

### 21. Overlapping skill scopes without disambiguation

Several skill pairs cover related ground without clear guidance on which to use:
- `openapi-spec-verification` vs `swagger-ui-verification`
- `effective-typescript` vs `ts-linting`
- `mantine` vs `user-interface-design`
- `react-component-development` vs `user-interface-design`

The agents reference specific ones, but a human reading the skill list wouldn't know which to pick.

---

## .gitignore Issues

### 22. Overly broad pattern

The `.gitignore` contains only `test`, which matches any file or directory with that name anywhere in the tree. This is presumably meant to exclude `test/` directories used for skill testing, but it would also catch a file named `test.md` or a nested path like `skills/foo/test`.

### 23. Missing standard patterns

No entries for `node_modules/`, `.env`, `.DS_Store`, `*.log`, or editor directories (`.vscode/`, `.idea/`). The `tools/` directory has a `package.json`, so `node_modules/` could appear there.

---

## Documentation Gaps

### 24. No Node.js version requirement documented

The tools use built-in `fetch()` (available from Node 18+) without any HTTP client library in `package.json`. The README and setup guides don't mention a minimum Node.js version. Running on Node 16 would produce confusing errors.

### 25. Setup guides inconsistent on env-var overrides

The README mentions that `repo_url` / `base_url` fields are optional if corresponding `*_REPO_URL` / `*_BASE_URL` env vars are set. The individual setup guides in `docs/` don't consistently document this.

### 26. No skill-to-tool relationship explained

The README documents tools and skills as separate concepts but never explains how a skill invokes a tool, or whether agents call tools directly vs. through skills. The architecture would benefit from a short "how it fits together" section.

---

## Summary by Severity

| Severity | Count | Key Items |
|----------|-------|-----------|
| Critical | 3 | Missing AGENTS.md, JQL injection, 27 undocumented skills |
| Medium | 11 | Config duplication, silent failures, fragile parsing, hard-coded values, missing .gitignore entries |
| Low | 12 | Naming inconsistencies, overlapping scopes, missing Node version docs, draft PR support |
