---
name: pull-request
description: Use when opening, updating, or listing pull requests. Use when asked to "open a PR", "create a pull request", "submit for review", or "raise a PR". Apply when work on a feature branch is complete and ready for review.
---

# Pull Requests

All pull request operations go through the PR tools. Read `agent-config.json` to determine the provider before doing anything else.

## Before opening a PR

1. **Confirm the branch is pushed.** Run `git status` and `git push` if needed. A PR against an unpushed branch will fail or be empty.
2. **Confirm there are no merge conflicts.** Run `git fetch origin` then `git merge origin/<base>` (or `git rebase origin/<base>`). Resolve any conflicts before proceeding.
3. **Confirm the branch name follows the convention**: `feature/TICKET-short-description` — e.g. `feature/PROJ-42-add-auth`.

## Resolving merge conflicts

If `git merge` or `git rebase` reports conflicts:

1. Open each conflicted file and resolve manually
2. Stage resolved files with `git add`
3. Continue the rebase (`git rebase --continue`) or commit the merge (`git commit`)
4. Push the resolved branch before opening the PR

Never open a PR on a branch with unresolved conflicts.

## Tools

Read `agent-config.json → git_host.provider` to select the right tool set.

**GitHub** (`provider: "github"`):
- `github-prs_create` — open a PR
- `github-prs_get` — read a PR
- `github-prs_list` — list PRs
- `github-prs_update` — update title or body

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

## Screenshots
<!-- Frontend changes: embed screenshots using relative URLs to images committed on this branch.
     Example: ![Login form](/.screenshots/login-form.png)
     No frontend changes: remove this section. -->

## Closes
Closes #ISSUE_NUMBER
```

For GitHub, `Closes #42` in the body will automatically close the linked issue when the PR is merged. Use the issue number, not the full URL.

## After opening the PR

If the project uses Jira, call these two tools immediately after the PR is created:

1. `jira-issues_transition` — transition the issue to "In Review"
2. `jira-issues_link_pr` — post the PR URL as a comment on the Jira issue

If the issue tracker is GitHub or Gitea (not Jira), the `Closes #N` keyword in the body handles the link — no additional step needed.

## Screenshots

Screenshots are embedded as relative URLs pointing to images committed on the feature branch:

```markdown
![Description of what is shown](/.screenshots/filename.png)
```

The image must exist on the branch at the path used in the URL. If screenshots have not yet been committed to the branch, omit the Screenshots section and update the PR body later using `github-prs_update` or `gitea-prs_update` once they are available.
