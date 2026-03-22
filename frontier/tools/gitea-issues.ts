import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { join, basename } from "path"
import {
  IssueTracker,
  Issue,
  Comment,
  Attachment,
  CreateIssueParams,
  UpdateIssueParams,
  ListIssuesParams,
} from "./lib/issue-tracker"

// ── Config ─────────────────────────────────────────────────────────────────

interface GiteaConfig {
  baseUrl: string
  owner: string
  repo: string
  token: string
}

function getConfig(): GiteaConfig | null {
  const token = process.env.GITEA_ACCESS_TOKEN
  if (!token) return null

  try {
    const config = JSON.parse(readFileSync(join(process.cwd(), "agent-config.json"), "utf-8"))
    const repoUrl = process.env.GITEA_REPO_URL ?? config?.issue_tracker?.gitea?.repo_url
    if (!repoUrl) return null

    const url = new URL(repoUrl)
    const [owner, repo] = url.pathname.split("/").filter(Boolean)
    if (!owner || !repo) return null

    return { baseUrl: url.origin, owner, repo, token }
  } catch {
    return null
  }
}

const NOT_CONFIGURED =
  "Gitea not configured — set GITEA_ACCESS_TOKEN and either GITEA_REPO_URL or add issue_tracker.gitea.repo_url to agent-config.json. See GITEA_SETUP.md."

const MIME_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  pdf: "application/pdf",
}

// ── Provider ───────────────────────────────────────────────────────────────

class GiteaIssues extends IssueTracker {
  constructor(private config: GiteaConfig) {
    super()
  }

  private get base() {
    const { baseUrl, owner, repo } = this.config
    return `${baseUrl}/api/v1/repos/${owner}/${repo}`
  }

  private get headers() {
    return {
      Authorization: `token ${this.config.token}`,
      "Content-Type": "application/json",
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...options,
      headers: { ...this.headers, ...(options.headers ?? {}) },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(`Gitea ${res.status}: ${err.message ?? res.statusText}`)
    }
    return res.json()
  }

  private toIssue(raw: Record<string, unknown>): Issue {
    return {
      id: String(raw.number),
      title: raw.title as string,
      description: (raw.body as string) ?? "",
      status: raw.state as string,
      assignee: (raw.assignee as { login: string } | null)?.login,
      labels: ((raw.labels as { name: string }[]) ?? []).map((l) => l.name),
      created_at: raw.created_at as string,
      updated_at: raw.updated_at as string,
      url: raw.html_url as string,
    }
  }

  async getIssue(id: string) {
    const [raw, rawComments, attachments] = await Promise.all([
      this.request<Record<string, unknown>>(`/issues/${id}`),
      this.request<Record<string, unknown>[]>(`/issues/${id}/comments`).catch(() => []),
      this.listAttachments(id).catch(() => []),
    ])

    const comments: Comment[] = rawComments.map((c) => ({
      id: String(c.id),
      author: (c.user as { login: string }).login,
      body: c.body as string,
      created_at: c.created_at as string,
    }))

    return { ...this.toIssue(raw), comments, attachments }
  }

  async createIssue(params: CreateIssueParams): Promise<Issue> {
    const raw = await this.request<Record<string, unknown>>("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: params.title,
        body: params.description,
        labels: params.labels,
        assignees: params.assignees,
      }),
    })
    return this.toIssue(raw)
  }

  async updateIssue(id: string, params: UpdateIssueParams): Promise<Issue> {
    const payload: Record<string, unknown> = {}
    if (params.title !== undefined) payload.title = params.title
    if (params.description !== undefined) payload.body = params.description
    if (params.state !== undefined) payload.state = params.state
    if (params.assignees !== undefined) payload.assignees = params.assignees

    const raw = await this.request<Record<string, unknown>>(`/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
    return this.toIssue(raw)
  }

  async listIssues(params: ListIssuesParams = {}): Promise<Issue[]> {
    const query = new URLSearchParams({
      state: params.state ?? "open",
      limit: String(Math.min(params.limit ?? 20, 50)),
      type: "issues",
      ...(params.assignee ? { assigned: params.assignee } : {}),
    })
    const raw = await this.request<Record<string, unknown>[]>(`/issues?${query}`)
    return raw.map((i) => this.toIssue(i))
  }

  async searchIssues(query: string, limit = 20): Promise<Issue[]> {
    const q = new URLSearchParams({ q: query, limit: String(Math.min(limit, 50)), type: "issues" })
    const raw = await this.request<Record<string, unknown>[]>(`/issues/search?${q}`)
    return raw.map((i) => this.toIssue(i))
  }

  async addComment(id: string, body: string): Promise<Comment> {
    const raw = await this.request<Record<string, unknown>>(`/issues/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    })
    return {
      id: String(raw.id),
      author: (raw.user as { login: string }).login,
      body: raw.body as string,
      created_at: raw.created_at as string,
    }
  }

  async transitionIssue(id: string, status: string): Promise<Issue> {
    const state = ["closed", "done", "complete", "resolved"].includes(status.toLowerCase())
      ? "closed"
      : "open"
    return this.updateIssue(id, { state })
  }

  async listAttachments(id: string): Promise<Attachment[]> {
    const raw = await this.request<Record<string, unknown>[]>(`/issues/${id}/assets`)
    return raw.map((a) => ({
      id: String(a.id),
      filename: a.name as string,
      size: a.size as number,
      url: (a.browser_download_url ?? a.download_url) as string,
      created_at: a.created_at as string,
    }))
  }

  async readAttachment(_issueId: string, attachmentId: string) {
    // Gitea attachment URLs are direct download links
    const res = await fetch(attachmentId, {
      headers: { Authorization: `token ${this.config.token}` },
    })
    if (!res.ok) throw new Error(`Failed to download attachment: ${res.status}`)
    const buffer = await res.arrayBuffer()
    return {
      filename: attachmentId.split("/").pop() ?? "attachment",
      content: Buffer.from(buffer).toString("base64"),
      encoding: "base64" as const,
    }
  }

  async uploadAttachment(issueId: string, filePath: string): Promise<Attachment> {
    const content = readFileSync(filePath)
    const filename = basename(filePath)
    const ext = filename.split(".").pop()?.toLowerCase() ?? ""
    const mimeType = MIME_TYPES[ext] ?? "application/octet-stream"

    const form = new FormData()
    form.append("attachment", new Blob([content], { type: mimeType }), filename)

    const res = await fetch(`${this.base}/issues/${issueId}/assets`, {
      method: "POST",
      headers: { Authorization: `token ${this.config.token}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(`Gitea ${res.status}: ${err.message ?? res.statusText}`)
    }
    const raw = await res.json() as Record<string, unknown>
    return {
      id: String(raw.id),
      filename,
      size: content.length,
      url: (raw.browser_download_url ?? raw.download_url) as string,
      created_at: raw.created_at as string,
    }
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────

function tracker(): GiteaIssues {
  const config = getConfig()
  if (!config) throw new Error(NOT_CONFIGURED)
  return new GiteaIssues(config)
}

export const get = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. Read a Gitea issue by number, including comments and attachments.",
  args: { id: tool.schema.string().describe("Issue number, e.g. '42'") },
  async execute(args) {
    try {
      const issue = await tracker().getIssue(args.id)
      const comments = issue.comments.map(
        (c) => `@${c.author} (${c.created_at.slice(0, 10)}): ${c.body}`
      ).join("\n\n") || "No comments."
      return [
        `Issue #${issue.id}: ${issue.title}`,
        `State: ${issue.status}`,
        `Labels: ${issue.labels?.join(", ") || "none"}`,
        `Assignee: ${issue.assignee ?? "none"}`,
        `URL: ${issue.url}`,
        ``,
        `## Description`,
        issue.description || "(no description)",
        ``,
        `## Comments`,
        comments,
      ].join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const create = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. Create a new Gitea issue.",
  args: {
    title: tool.schema.string().describe("Issue title"),
    description: tool.schema.string().optional().describe("Issue body (Markdown supported)"),
    labels: tool.schema.string().optional().describe("Comma-separated label names"),
    assignees: tool.schema.string().optional().describe("Comma-separated usernames"),
  },
  async execute(args) {
    try {
      const issue = await tracker().createIssue({
        title: args.title,
        description: args.description,
        labels: args.labels?.split(",").map((s) => s.trim()),
        assignees: args.assignees?.split(",").map((s) => s.trim()),
      })
      return `Created #${issue.id}: ${issue.title}\nURL: ${issue.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const update = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. Update an existing Gitea issue. Only provided fields are changed.",
  args: {
    id: tool.schema.string().describe("Issue number"),
    title: tool.schema.string().optional(),
    description: tool.schema.string().optional().describe("Replaces existing body"),
    state: tool.schema.string().optional().describe('"open" or "closed"'),
    assignees: tool.schema.string().optional().describe("Comma-separated usernames (replaces existing)"),
  },
  async execute(args) {
    try {
      const issue = await tracker().updateIssue(args.id, {
        title: args.title,
        description: args.description,
        state: args.state as "open" | "closed" | undefined,
        assignees: args.assignees?.split(",").map((s) => s.trim()),
      })
      return `Updated #${issue.id}: ${issue.title}\nState: ${issue.status} | URL: ${issue.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const list = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. List Gitea issues with optional filters.",
  args: {
    state: tool.schema.string().optional().describe('"open" (default), "closed", or "all"'),
    assignee: tool.schema.string().optional(),
    limit: tool.schema.number().optional().describe("Max results (default 20, max 50)"),
  },
  async execute(args) {
    try {
      const issues = await tracker().listIssues({
        state: args.state as ListIssuesParams["state"],
        assignee: args.assignee,
        limit: args.limit,
      })
      if (!issues.length) return `No ${args.state ?? "open"} issues found.`
      return issues.map((i) =>
        `#${i.id}  [${i.status}]  ${i.title}  (labels: ${i.labels?.join(", ") || "—"})`
      ).join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const search = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. Search Gitea issues by keyword.",
  args: {
    query: tool.schema.string().describe("Search query"),
    limit: tool.schema.number().optional().describe("Max results (default 20)"),
  },
  async execute(args) {
    try {
      const issues = await tracker().searchIssues(args.query, args.limit)
      if (!issues.length) return `No issues found for: ${args.query}`
      return issues.map((i) => `#${i.id}  [${i.status}]  ${i.title}`).join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const comment = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. Add a comment to a Gitea issue.",
  args: {
    id: tool.schema.string().describe("Issue number"),
    body: tool.schema.string().describe("Comment text (Markdown supported)"),
  },
  async execute(args) {
    try {
      const c = await tracker().addComment(args.id, args.body)
      return `Comment posted (ID: ${c.id})`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const transition = tool({
  description: 'Only use when agent-config.json sets issue_tracker.provider to \'gitea\'. Transition a Gitea issue status. Use "closed" to close, "open" to reopen.',
  args: {
    id: tool.schema.string().describe("Issue number"),
    status: tool.schema.string().describe('"open" or "closed"'),
  },
  async execute(args) {
    try {
      const issue = await tracker().transitionIssue(args.id, args.status)
      return `#${issue.id} is now ${issue.status}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const upload_attachment = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'gitea'. Upload a file as an attachment to a Gitea issue.",
  args: {
    id: tool.schema.string().describe("Issue number"),
    file_path: tool.schema.string().describe("Absolute path to the file to upload"),
  },
  async execute(args) {
    try {
      const attachment = await tracker().uploadAttachment(args.id, args.file_path)
      return `Uploaded: ${attachment.filename}\nURL: ${attachment.url}\nMarkdown: ![${attachment.filename}](${attachment.url})`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})
