---
name: pull-requests
description: Use when opening, updating, or listing pull requests. Use when asked to "open a PR", "create a pull request", "submit for review", or "raise a PR". Apply when work on a feature branch is complete and ready for review.
---

# Pull Requests

All pull request operations use the `tea` CLI.

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

Use the `tea` CLI. Check availability first:
```bash
tea --version
```
If not found, stop and tell the user to install it from https://gitea.com/gitea/tea. Assume already authenticated. Run from the repo root.

`tea pulls create` takes `--description` with no file-reading flag. Write the PR body to a temp file and use command substitution to avoid multiline/escaping issues:

**Create a PR:**
```bash
cat > /tmp/pr-body.md << 'EOF'
## Summary
...
EOF

tea pulls create \
  --title "..." \
  --description "$(cat /tmp/pr-body.md)" \
  --base <base>
# --head defaults to the current branch; only set it if creating from a different branch
```

**View a specific PR** (no `view` subcommand — pass the number as a positional arg):
```bash
tea pulls <number>
tea pulls <number> --fields title,body,state,head,base,assignees
tea pulls <number> --comments    # include review comments
```

**List PRs:**
```bash
tea pulls ls                     # open PRs (default)
tea pulls ls --state closed
tea pulls ls --state all
```

**Close / reopen:**
```bash
tea pulls close <number>
tea pulls reopen <number>
```

**Note:** There is no `tea pulls edit` command. PR title and description cannot be updated via `tea`. Once opened, update the PR by pushing new commits to the branch.

Determine the base branch from git:
```bash
git symbolic-ref refs/remotes/origin/HEAD | sed 's|refs/remotes/origin/||'
```
Falls back to `main` if unset. This is also used for constructing screenshot image URLs — the repo URL comes from `git remote get-url origin`.

## PR body template

Always use this template. Fill every section — do not leave sections empty or omit them.

```markdown
# {PR title — concise imperative phrase}

{Brief summary — 2–4 sentences. What changed and why.}

# Screenshots
<!-- Frontend changes: embed each Gitea attachment URL as an inline image.
     The image must render directly in the PR body — do NOT use links or filenames.
     One image per line. See the Screenshots section below for how to upload and construct URLs.
     No frontend changes: remove this entire section. -->
![caption](https://gitea.example.com/attachments/{uuid})

# Detail

## Changes
<!-- Bullet list of notable changes. Be specific. -->
-

## How to Test
<!-- Starting from main running locally, numbered steps a reviewer must follow to test this PR.
     If no setup is needed beyond checking out the branch, write exactly:
     "No setup needed — check out the branch and run the app." -->

## Tests added
<!-- List test files added or modified and what they cover. -->

## Quality gate verdicts
<!-- @reviewer verdict. @qa verdict if run. -->

## Errors and complications
<!-- Any blockers hit and how they were resolved. "None" if clean. -->

## Follow-up items
<!-- Anything deferred, known gaps, or suggestions for future work. "None" if clean. -->

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

`Closes #42` in the body will automatically close the linked issue when the PR is merged on Gitea. Use the issue number, not the full URL.

## After opening the PR

The `Closes #N` keyword in the body links the PR to the issue — no additional step needed.

## Screenshots

Each screenshot must be an **inline embedded image** that renders directly in the PR body. Do not commit screenshots to the branch — upload them to Gitea's issue attachments API instead.

### Uploading screenshots to Gitea

Screenshots are uploaded to the **issue** (not the PR — the issue already exists before the PR is opened). Gitea serves them from a stable attachment URL that embeds inline in any PR body.

**Step 1 — Parse the repo owner and name from the remote URL:**
```bash
REMOTE_URL=$(git remote get-url origin)
# e.g. http://gitea.example.com/acme/myapp
# owner=acme  repo=myapp  issue_number=42
```

**Step 2 — Upload each screenshot:**
```bash
curl -s -X POST \
  -H "Authorization: token ${GITEA_ACCESS_TOKEN}" \
  -F "attachment=@/path/to/screenshot.png" \
  "${REMOTE_URL}/api/v1/repos/{owner}/{repo}/issues/{issue_number}/assets"
```

The response contains the URL to embed:
```json
{"browser_download_url": "https://gitea.example.com/attachments/{uuid}"}
```

**Step 3 — Embed in the `# Screenshots` section of the PR body:**
```markdown
![Login form](https://gitea.example.com/attachments/{uuid})
```

Upload all screenshots before opening the PR. Collect every `browser_download_url`, then write them into the PR body in the `# Screenshots` section. Write the full PR body to `/tmp/pr-body.md` and pass it via `$(cat /tmp/pr-body.md)` — see the `tea pulls create` command above.
