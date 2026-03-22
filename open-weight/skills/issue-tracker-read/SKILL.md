---
name: issue-tracker-read
description: Read and extract ticket details from the configured issue tracker. Use when orchestrator needs to fetch a ticket before decomposing work.
---

# Issue Tracker: Read

Reads a ticket from the configured issue tracker and returns structured context.

## Setup

Read `agent-config.json` from the repository root to determine the provider:

```bash
cat agent-config.json
```

Use the `issue_tracker.provider` field to select the correct commands below.

---

## GitHub

### Required
- `gh` CLI installed and authenticated

### Read a ticket

```bash
gh issue view <ticket-id> --json number,title,body,labels,assignees,milestone,state \
  --repo <issue_tracker.github.repo_url>
```

### Extract fields

From the JSON response, extract:
- `title` — issue title
- `body` — full description (contains requirements, acceptance criteria)
- `labels[].name` — label names (use for scope hints)
- `state` — open/closed

---

## Gitea

### Required
- `GITEA_TOKEN` environment variable set
- `GITEA_URL` environment variable set (e.g. `https://gitea.example.com`)
- Owner and repo extracted from `issue_tracker.gitea.repo_url`

### Read a ticket

```bash
curl -s \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  "$GITEA_URL/api/v1/repos/<owner>/<repo>/issues/<ticket-id>"
```

### Extract fields

From the JSON response, extract:
- `title`
- `body`
- `labels[].name`
- `state`

---

## Jira

### Required
- `JIRA_TOKEN` environment variable set (API token)
- `JIRA_EMAIL` environment variable set
- `JIRA_URL` environment variable set (e.g. `https://yourorg.atlassian.net`)

### Read a ticket

```bash
curl -s \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  "$JIRA_URL/rest/api/3/issue/<ticket-id>"
```

### Extract fields

Jira responses are nested. Extract:
- `fields.summary` → title
- `fields.description.content` → description (Atlassian Document Format — extract plain text from `text` nodes)
- `fields.labels` → label names
- `fields.status.name` → current status
- `fields.acceptanceCriteria` → may be a custom field, check `fields` for keys containing "acceptance"

---

## Output

After reading the ticket, return a structured context object — do not pass the raw API response downstream:

```json
{
  "id": "47",
  "title": "One-line summary",
  "description": "Full requirement text",
  "labels": ["backend", "auth"],
  "raw_acceptance_criteria": "Text of acceptance criteria if present in ticket body"
}
```

If acceptance criteria are not explicitly stated in the ticket, note that in `raw_acceptance_criteria` as `null` — the orchestrator will infer them during extraction.
