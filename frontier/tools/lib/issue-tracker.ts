// Shared types and interface for all issue tracker providers.
// Each provider implements IssueTracker and is responsible for
// reading its own config from agent-config.json and env vars.

export interface Issue {
  id: string
  title: string
  description: string
  status: string
  assignee?: string
  labels?: string[]
  created_at: string
  updated_at: string
  url: string
}

export interface Comment {
  id: string
  author: string
  body: string
  created_at: string
}

export interface Attachment {
  id: string
  filename: string
  size: number
  url: string
  created_at: string
}

export interface CreateIssueParams {
  title: string
  description?: string
  labels?: string[]
  assignees?: string[]
}

export interface UpdateIssueParams {
  title?: string
  description?: string
  state?: "open" | "closed"
  labels?: string[]
  assignees?: string[]
}

export interface ListIssuesParams {
  state?: "open" | "closed" | "all"
  assignee?: string
  labels?: string[]
  limit?: number
}

export abstract class IssueTracker {
  /** Read a single issue with its comments and attachments */
  abstract getIssue(id: string): Promise<Issue & { comments: Comment[]; attachments: Attachment[] }>

  /** Create a new issue */
  abstract createIssue(params: CreateIssueParams): Promise<Issue>

  /** Update fields on an existing issue */
  abstract updateIssue(id: string, params: UpdateIssueParams): Promise<Issue>

  /** List issues with optional filters */
  abstract listIssues(params?: ListIssuesParams): Promise<Issue[]>

  /** Search issues by keyword or query */
  abstract searchIssues(query: string, limit?: number): Promise<Issue[]>

  /** Add a comment to an issue */
  abstract addComment(id: string, body: string): Promise<Comment>

  /** Transition an issue to a new status */
  abstract transitionIssue(id: string, status: string): Promise<Issue>

  /** List attachments on an issue */
  abstract listAttachments(id: string): Promise<Attachment[]>

  /** Download and return attachment content */
  abstract readAttachment(issueId: string, attachmentId: string): Promise<{ filename: string; content: string; encoding: "utf8" | "base64" }>

  /** Upload a file as an attachment */
  abstract uploadAttachment(issueId: string, filePath: string): Promise<Attachment>
}
