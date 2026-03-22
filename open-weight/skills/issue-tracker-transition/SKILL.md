---
name: issue-tracker-transition
description: Transition a ticket status in the configured issue tracker. Use when orchestrator needs to move a ticket to In Review after integration completes.
---

# Issue Tracker: Transition

Transitions a ticket to a new status. Only orchestrator should invoke this skill.

## Permitted transitions

- → **In Review**: permitted after integration and PR open
- All other transitions (closing, merging, resolving) are **never permitted** by any agent

## Setup

Read `agent-config.json` from the repository root to determine the provider:

```bash
cat agent-config.json
```

---

## GitHub

GitHub Issues does not have workflow states. Use labels to signal status instead.

### Remove "in-progress" label and add "in-review"

```bash
# Add in-review label
gh issue edit <ticket-id> --add-label "in-review" \
  --repo <issue_tracker.github.repo_url>

# Remove in-progress label if present
gh issue edit <ticket-id> --remove-label "in-progress" \
  --repo <issue_tracker.github.repo_url>
```

If neither label exists in the repo yet, create them first:

```bash
gh label create "in-progress" --color "0075ca" \
  --repo <issue_tracker.github.repo_url>

gh label create "in-review" --color "e4e669" \
  --repo <issue_tracker.github.repo_url>
```

---

## Gitea

### Required
- `GITEA_TOKEN` environment variable set
- `GITEA_URL` environment variable set

### Add "in-review" label

First, get the label ID:

```bash
curl -s \
  -H "Authorization: token $GITEA_TOKEN" \
  "$GITEA_URL/api/v1/repos/<owner>/<repo>/labels" \
  | grep -A2 '"in-review"'
```

Then apply it:

```bash
curl -s -X POST \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"labels": [<label-id>]}' \
  "$GITEA_URL/api/v1/repos/<owner>/<repo>/issues/<ticket-id>/labels"
```

---

## Jira

### Required
- `JIRA_TOKEN` environment variable set
- `JIRA_EMAIL` environment variable set
- `JIRA_URL` environment variable set

### Get available transitions

```bash
curl -s \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  "$JIRA_URL/rest/api/3/issue/<ticket-id>/transitions"
```

Find the transition ID for "In Review" (or equivalent status in your workflow) in the response.

### Apply the transition

```bash
curl -s -X POST \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transition": {"id": "<transition-id>"}}' \
  "$JIRA_URL/rest/api/3/issue/<ticket-id>/transitions"
```

---

## Error handling

If the transition fails, report the error to the user. The PR is already open — the human can transition the ticket manually. Do not retry more than once.
