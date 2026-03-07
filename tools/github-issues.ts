import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { join } from "path"
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

interface GithubConfig {
  apiBase: string
  token: string
}

function getConfig(): GithubConfig | null {
  const token = process.env.GITHUB_ACCESS_TOKEN
  if (!token) return null

  try {
    const config = JSON.parse(readFileSync(join(process.cwd(), "agent-config.json"), "utf-8"))
    const repoUrl = process.env.GITHUB_REPO_URL ?? config?.issue_tracker?.github?.repo_url
    if (!repoUrl) return null

    const url = new URL(repoUrl)
    const [owner, repo] = url.pathname.split("/").filter(Boolean)
    if (!owner || !repo) return null

    const apiBase =
      url.hostname === "github.com"
        ? `https://api.github.com/repos/${owner}/${repo}`
        : `${url.origin}/api/v3/repos/${owner}/${repo}`

    return { apiBase, token }
  } catch {
    return null
  }
}

const NOT_CONFIGURED =
  "GitHub not configured — set GITHUB_ACCESS_TOKEN and either GITHUB_REPO_URL or add issue_tracker.github.repo_url to agent-config.json. See GITHUB_SETUP.md."

// ── Provider ───────────────────────────────────────────────────────────────

class GithubIssues extends IssueTracker {
  constructor(private config: GithubConfig) {
    super()
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.config.apiBase}${path}`, {
      ...options,
      headers: { ...this.headers, ...(options.headers ?? {}) },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(`GitHub ${res.status}: ${err.message ?? res.statusText}`)
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
    const [raw, rawComments] = await Promise.all([
      this.request<Record<string, unknown>>(`/issues/${id}`),
      this.request<Record<string, unknown>[]>(`/issues/${id}/comments`).catch(() => []),
    ])

    const comments: Comment[] = rawComments.map((c) => ({
      id: String(c.id),
      author: (c.user as { login: string }).login,
      body: c.body as string,
      created_at: c.created_at as string,
    }))

    return { ...this.toIssue(raw), comments, attachments: [] }
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
    if (params.labels !== undefined) payload.labels = params.labels
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
      per_page: String(Math.min(params.limit ?? 20, 50)),
      ...(params.assignee ? { assignee: params.assignee } : {}),
      ...(params.labels?.length ? { labels: params.labels.join(",") } : {}),
    })
    const raw = await this.request<Record<string, unknown>[]>(`/issues?${query}`)
    // GitHub issues endpoint includes PRs — filter them out
    return raw.filter((i) => !i.pull_request).map((i) => this.toIssue(i))
  }

  async searchIssues(query: string, limit = 20): Promise<Issue[]> {
    // GitHub search requires the repo scope in the query
    const raw = this.config.apiBase.match(/repos\/([^/]+\/[^/]+)/)
    const repoScope = raw ? `repo:${raw[1]} ` : ""
    const result = await this.request<{ items: Record<string, unknown>[] }>(
      `/search/issues?q=${encodeURIComponent(repoScope + query + " is:issue")}&per_page=${Math.min(limit, 50)}`
        .replace(this.config.apiBase, "https://api.github.com")
    )
    return result.items.map((i) => this.toIssue(i))
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

  async listAttachments(_id: string): Promise<Attachment[]> {
    throw new Error("GitHub does not support issue attachments via the REST API.")
  }

  async readAttachment(_issueId: string, _attachmentId: string) {
    throw new Error("GitHub does not support issue attachments via the REST API.")
  }

  async uploadAttachment(_issueId: string, _filePath: string): Promise<Attachment> {
    throw new Error("GitHub does not support issue attachments via the REST API.")
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────

function tracker(): GithubIssues {
  const config = getConfig()
  if (!config) throw new Error(NOT_CONFIGURED)
  return new GithubIssues(config)
}

export const get = tool({
  description: "Read a GitHub issue by number, including comments.",
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
  description: "Create a new GitHub issue.",
  args: {
    title: tool.schema.string().describe("Issue title"),
    description: tool.schema.string().optional().describe("Issue body (Markdown supported)"),
    labels: tool.schema.string().optional().describe("Comma-separated label names"),
    assignees: tool.schema.string().optional().describe("Comma-separated GitHub usernames"),
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
  description: "Update an existing GitHub issue. Only provided fields are changed.",
  args: {
    id: tool.schema.string().describe("Issue number"),
    title: tool.schema.string().optional(),
    description: tool.schema.string().optional().describe("Replaces existing body"),
    state: tool.schema.string().optional().describe('"open" or "closed"'),
    labels: tool.schema.string().optional().describe("Comma-separated labels (replaces existing)"),
    assignees: tool.schema.string().optional().describe("Comma-separated usernames (replaces existing)"),
  },
  async execute(args) {
    try {
      const issue = await tracker().updateIssue(args.id, {
        title: args.title,
        description: args.description,
        state: args.state as "open" | "closed" | undefined,
        labels: args.labels?.split(",").map((s) => s.trim()),
        assignees: args.assignees?.split(",").map((s) => s.trim()),
      })
      return `Updated #${issue.id}: ${issue.title}\nState: ${issue.status} | URL: ${issue.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const list = tool({
  description: "List GitHub issues with optional filters.",
  args: {
    state: tool.schema.string().optional().describe('"open" (default), "closed", or "all"'),
    assignee: tool.schema.string().optional(),
    labels: tool.schema.string().optional().describe("Comma-separated label names"),
    limit: tool.schema.number().optional().describe("Max results (default 20, max 50)"),
  },
  async execute(args) {
    try {
      const issues = await tracker().listIssues({
        state: args.state as ListIssuesParams["state"],
        assignee: args.assignee,
        labels: args.labels?.split(",").map((s) => s.trim()),
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
  description: "Search GitHub issues by keyword.",
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
  description: "Add a comment to a GitHub issue.",
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
  description: 'Transition a GitHub issue status. Use "closed" to close, "open" to reopen.',
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
