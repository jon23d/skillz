---
name: pull-requests
description: Use when opening, updating, or listing pull requests. Use when asked to "open a PR", "create a pull request", "submit for review", or "raise a PR". Apply when work on a feature branch is complete and ready for review.
---

# Pull Requests

All pull request operations go through the PR tools. Read `agent-config.json` to determine the provider before doing anything else.

## Before opening a PR

1. **Run prettier and fix all formatting issues.** Run `npx prettier --check .` (or the project's equivalent). If it fails, run `npx prettier --write .`, commit the changes, and push. Do not open a PR until prettier passes with zero errors.
2. **Confirm the branch is pushed.** Run `git status` and `git push` if needed. A PR against an unpushed branch will fail or be empty.
3. **Confirm there are no merge conflicts.** Run `git fetch origin` then `git merge origin/<base>` (or `git rebase origin/<base>`). Resolve any conflicts before proceeding.
4. **Confirm the branch name follows the convention**: `feature/TICKET-short-description` — e.g. `feature/PROJ-42-add-auth`.

## Resolving merge conflicts

If `git merge` or `git rebase` reports conflicts:

1. Open each conflicted file and resolve manually
2. Stage resolved files with `git add`
3. Continue the rebase (`git rebase --continue`) or commit the merge (`git commit`)
4. Push the resolved branch before opening the PR

Never open a PR on a branch with unresolved conflicts.

## Tools

Read `agent-config.json → git_host.provider` to select the right tool set.

**GitHub** (`provider: "github"`) — use `gh` CLI. Check `gh auth status` first; stop and tell the user if it fails.
```bash
gh pr create --title "..." --body "..."   # open a PR
gh pr view <number> --json number,title,state,body,headRefName
gh pr list --json number,title,state,headRefName
gh pr edit <number> --title "..." --body "..."
```
See `skills/github/SKILL.md` for full reference.

**Gitea** (`provider: "gitea"`):
- `gitea-prs_create` — open a PR
- `gitea-prs_get` — read a PR
- `gitea-prs_list` — list PRs
- `gitea-prs_update` — update title or body

The base branch defaults to `main`. Override by setting `default_branch` in `agent-config.json`:

```json
"git_host": {
  "provider": "github",
  "github": {
    "repo_url": "https://github.com/owner/repo",
    "default_branch": "develop"
  }
}
```

## PR body template

Always use this template. Fill every section — do not leave sections empty or omit them.

```markdown
## Summary
<!-- What changed and why. 2-4 sentences. -->

## Changes
<!-- Bullet list of notable changes. Be specific. -->
- 

## How to Test
<!-- Starting from main running locally, numbered steps a reviewer must follow to test this PR.
     If no setup is needed beyond checking out the branch, write exactly:
     "No setup needed — check out the branch and run the app." -->

## Screenshots
<!-- Frontend changes: embed each screenshot as an inline image using the syntax below.
     The image must render directly in the PR body — do NOT use a table of links or bare filenames.
     One image per line. Each must use a relative blob URL so GitHub renders it inline:
     ![Description of what is shown](../blob/BRANCH/.agent-logs/YYYY-MM-DD-slug/filename.png?raw=true)
     No frontend changes: remove this section. -->

## Closes
Closes #ISSUE_NUMBER
```

## Writing the How to Test section

Before writing this section, scan the diff for signals that require reviewer action:

- **New or changed env vars** — `.env.example`, config files, new `process.env` references
- **Database changes** — new migration files, schema changes, seed data files
- **New dependencies** — `package.json`, `requirements.txt`, `go.mod`, etc. that require an install step
- **New scripts** — entries added to `package.json scripts`, Makefile targets, shell scripts
- **Infrastructure changes** — Docker, Kubernetes, or other config that needs applying
- **External service setup** — new API keys, webhooks, third-party config
- **Feature flags** — any flag references that need enabling in a local config or dashboard
- **Test data / seed files** — scripts the reviewer must run to get usable data in the DB
- **Port or URL changes** — if the service now runs on a different port or a new endpoint is the entry point

Write one numbered step per action. Start from: *reviewer has `main` checked out and running locally.*

This section is always required. If none of the above apply, write: "No setup needed — check out the branch and run the app."

For GitHub, `Closes #42` in the body will automatically close the linked issue when the PR is merged. Use the issue number, not the full URL.

## After opening the PR

If the project uses Jira, call these two tools immediately after the PR is created:

1. `jira-issues_transition` — transition the issue to "In Review"
2. `jira-issues_link_pr` — post the PR URL as a comment on the Jira issue

If the issue tracker is GitHub or Gitea (not Jira), the `Closes #N` keyword in the body handles the link — no additional step needed.

## Screenshots

Each screenshot must be an **inline embedded image** that renders directly in the PR body. Do not use a table of links, bare filenames, or hyperlinked text — the reviewer must be able to see the screenshots without clicking anything.

Use `![description](url)` syntax with relative blob URLs and `?raw=true`. Do not use `raw.githubusercontent.com` — those URLs return 404 for private repos because the viewer's browser has no token.

**Before writing any URL, run:**
```bash
git branch --show-current   # → BRANCH
```

Then construct each URL using the exact relative path reported by `@frontend-engineer`:

```markdown
![Description of what is shown](../blob/BRANCH/.agent-logs/YYYY-MM-DD-slug/filename.png?raw=true)
```

**Example** — branch `feature/PROJ-42-login`, file reported as `.agent-logs/2026-03-15-login/login-form.png`:
```markdown
![Login form](../blob/feature/PROJ-42-login/.agent-logs/2026-03-15-login/login-form.png?raw=true)
```

The `../blob/` prefix works because GitHub resolves relative URLs in PR bodies against the PR page URL (`/owner/repo/pull/N`). The `?raw=true` suffix tells GitHub to serve the binary image instead of the HTML file viewer.

**The image must exist on the branch before the PR is opened.** Verify by running `git show HEAD:.agent-logs/...` for each screenshot path. If a file is missing, the `@frontend-engineer` did not complete the screenshot step — send them back before opening the PR. Do not open the PR with a Screenshots section containing broken links, and do not omit the Screenshots section when screenshots were taken.
