# Issue Tracker Tool Interface

All tools read `agent-config.json` at `context.worktree/agent-config.json` to determine the provider, then dispatch to the appropriate implementation.

## Shared types

```typescript
type IssueStatus = string        // provider-specific: "open", "in-progress", "done", etc.
type IssueId = string            // provider-specific: "PROJ-123", "#42", etc.

interface Issue {
  id: IssueId
  title: string
  description: string
  status: IssueStatus
  assignee?: string
  labels?: string[]
  created_at: string             // ISO 8601
  updated_at: string             // ISO 8601
  url: string
}

interface Comment {
  id: string
  body: string
  author: string
  created_at: string
}

interface Attachment {
  id: string
  filename: string
  size: number
  url: string
  created_at: string
}
```

---

## issue_tracker_create

Creates a new issue.

```typescript
args: {
  title:       tool.schema.string().describe("Issue title"),
  description: tool.schema.string().describe("Issue body / description"),
  assignee:    tool.schema.string().optional().describe("Username to assign"),
  labels:      tool.schema.array(tool.schema.string()).optional().describe("Labels or components"),
}

returns: Issue
```

---

## issue_tracker_read

Fetches a single issue by ID.

```typescript
args: {
  id: tool.schema.string().describe("Issue ID (e.g. PROJ-123 or #42)"),
}

returns: Issue & { comments: Comment[], attachments: Attachment[] }
```

---

## issue_tracker_update

Updates fields on an existing issue. Only provided fields are changed.

```typescript
args: {
  id:          tool.schema.string().describe("Issue ID to update"),
  title:       tool.schema.string().optional(),
  description: tool.schema.string().optional(),
  assignee:    tool.schema.string().optional(),
  labels:      tool.schema.array(tool.schema.string()).optional(),
}

returns: Issue
```

---

## issue_tracker_list

Lists issues in the project, with optional filters.

```typescript
args: {
  status:   tool.schema.string().optional().describe("Filter by status"),
  assignee: tool.schema.string().optional().describe("Filter by assignee username"),
  labels:   tool.schema.array(tool.schema.string()).optional().describe("Filter by labels"),
  limit:    tool.schema.number().optional().describe("Max results (default 25)"),
}

returns: Issue[]
```

---

## issue_tracker_search

Searches issues by keyword or query string.

```typescript
args: {
  query: tool.schema.string().describe("Search query"),
  limit: tool.schema.number().optional().describe("Max results (default 25)"),
}

returns: Issue[]
```

---

## issue_tracker_comment

Adds a comment to an issue.

```typescript
args: {
  id:   tool.schema.string().describe("Issue ID"),
  body: tool.schema.string().describe("Comment text"),
}

returns: Comment
```

---

## issue_tracker_transition

Moves an issue to a new status/state.

```typescript
args: {
  id:     tool.schema.string().describe("Issue ID"),
  status: tool.schema.string().describe("Target status (e.g. 'in-progress', 'done')"),
}

returns: Issue
```

---

## issue_tracker_attachments_list

Lists attachments on an issue.

```typescript
args: {
  id: tool.schema.string().describe("Issue ID"),
}

returns: Attachment[]
```

---

## issue_tracker_attachments_read

Downloads and returns the content of an attachment.

```typescript
args: {
  issue_id:      tool.schema.string().describe("Issue ID"),
  attachment_id: tool.schema.string().describe("Attachment ID"),
}

returns: { filename: string, content: string, encoding: "utf8" | "base64" }
```

---

## issue_tracker_attachments_upload

Uploads a file as an attachment to an issue.

```typescript
args: {
  issue_id: tool.schema.string().describe("Issue ID"),
  filepath: tool.schema.string().describe("Absolute path to file to upload"),
}

returns: Attachment
```

---

## Implementation skeleton

Each tool file follows this pattern. The provider dispatch is the same for all tools — only the API call differs.

```typescript
// .opencode/tools/issue_tracker_read.ts
import { tool } from "@opencode-ai/plugin"
import path from "path"
import fs from "fs"

export default tool({
  description: "Read a single issue by ID",
  args: {
    id: tool.schema.string().describe("Issue ID"),
  },
  async execute(args, context) {
    // 1. Load config
    const configPath = path.join(context.worktree, "agent-config.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
    const { provider } = config.issue_tracker
    const providerConfig = config.issue_tracker[provider]

    // 2. Dispatch to provider
    switch (provider) {
      case "github":
        return await github.readIssue(args.id, providerConfig)
      case "gitea":
        return await gitea.readIssue(args.id, providerConfig)
      case "jira":
        return await jira.readIssue(args.id, providerConfig)
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
})
```

Provider implementations live in `.opencode/tools/providers/`:

```
.opencode/tools/
├── issue_tracker_create.ts
├── issue_tracker_read.ts
├── issue_tracker_update.ts
├── issue_tracker_list.ts
├── issue_tracker_search.ts
├── issue_tracker_comment.ts
├── issue_tracker_transition.ts
├── issue_tracker_attachments_list.ts
├── issue_tracker_attachments_read.ts
├── issue_tracker_attachments_upload.ts
└── providers/
    ├── github.ts     # GitHub REST API implementation
    ├── gitea.ts      # Gitea API implementation
    └── jira.ts       # Jira REST API implementation
```

Each provider module exports functions matching the tool operations:
`readIssue`, `createIssue`, `updateIssue`, `listIssues`, `searchIssues`,
`addComment`, `transitionIssue`, `listAttachments`, `readAttachment`, `uploadAttachment`.
