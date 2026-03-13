import { tool } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { basename } from "path"
import { Version3Client } from "jira.js"
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

interface JiraConfig {
  client: Version3Client
  projectKey: string
  host: string
  currentUserEmail: string | null
}

function getConfig(): JiraConfig | null {
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN
  if (!email || !apiToken) return null

  try {
    const agentConfig = JSON.parse(readFileSync("agent-config.json", "utf-8"))
    const jiraConfig = agentConfig?.issue_tracker?.jira ?? {}
    const host = (process.env.JIRA_BASE_URL ?? jiraConfig.base_url ?? "").replace(/\/$/, "")
    const projectKey = process.env.JIRA_PROJECT_KEY ?? jiraConfig.project_key ?? ""
    if (!host) return null

    const client = new Version3Client({
      host,
      authentication: { basic: { email, apiToken } },
    })

    return { client, projectKey, host, currentUserEmail: email }
  } catch {
    return null
  }
}

const NOT_CONFIGURED =
  "Jira not configured — set JIRA_EMAIL and JIRA_API_TOKEN, and add issue_tracker.jira to agent-config.json. See JIRA_SETUP.md."

// ── ADF helpers ────────────────────────────────────────────────────────────

function toAdf(text: string) {
  const paragraphs = text.split(/\n\n+/).filter((s) => s.trim()) || [text || " "]
  return {
    version: 1,
    type: "doc",
    content: paragraphs.map((para) => ({
      type: "paragraph",
      content: [{ type: "text", text: para.trim() }],
    })),
  }
}

function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return String(adf ?? "")
  const doc = adf as { content?: unknown[] }
  if (!doc.content) return ""
  function extract(node: unknown): string {
    if (!node || typeof node !== "object") return ""
    const n = node as { type?: string; text?: string; content?: unknown[] }
    if (n.type === "text") return n.text ?? ""
    if (n.content) return n.content.map(extract).join("")
    return ""
  }
  return doc.content.map(extract).join("\n\n")
}

// ── Provider ───────────────────────────────────────────────────────────────

class JiraIssues extends IssueTracker {
  constructor(private config: JiraConfig) {
    super()
  }

  private toIssue(raw: Record<string, unknown>): Issue {
    const f = raw.fields as Record<string, unknown>
    return {
      id: raw.key as string,
      title: f.summary as string,
      description: adfToText(f.description),
      status: (f.status as { name: string })?.name ?? "",
      assignee: (f.assignee as { displayName: string } | null)?.displayName,
      labels: (f.labels as string[]) ?? [],
      created_at: f.created as string,
      updated_at: f.updated as string,
      url: `${this.config.host}/browse/${raw.key}`,
    }
  }

  async getIssue(id: string) {
    const raw = await this.config.client.issues.getIssue({
      issueIdOrKey: id,
      fields: ["summary", "description", "status", "assignee", "labels", "priority", "comment", "issuetype", "created", "updated", "attachment"],
    })

    const f = raw.fields!
    const comments: Comment[] = (f.comment?.comments ?? []).map((c) => ({
      id: c.id ?? "",
      author: c.author?.displayName ?? "unknown",
      body: adfToText(c.body),
      created_at: c.created ?? "",
    }))

    const attachments: Attachment[] = ((f.attachment as Record<string, unknown>[]) ?? []).map((a) => ({
      id: a.id as string,
      filename: a.filename as string,
      size: a.size as number,
      url: a.content as string,
      created_at: a.created as string,
    }))

    return { ...this.toIssue(raw as unknown as Record<string, unknown>), comments, attachments }
  }

  async createIssue(params: CreateIssueParams): Promise<Issue> {
    const created = await this.config.client.issues.createIssue({
      fields: {
        summary: params.title,
        issuetype: { name: "Task" },
        project: { key: this.config.projectKey },
        ...(params.description ? { description: toAdf(params.description) } : {}),
        ...(params.labels ? { labels: params.labels } : {}),
      },
    })
    // Fetch the full issue so we return a complete Issue object
    return this.getIssue(created.key!)
  }

  async updateIssue(id: string, params: UpdateIssueParams): Promise<Issue> {
    const fields: Record<string, unknown> = {}
    if (params.title) fields.summary = params.title
    if (params.description) fields.description = toAdf(params.description)
    if (params.labels) fields.labels = params.labels

    if (Object.keys(fields).length) {
      await this.config.client.issues.editIssue({ issueIdOrKey: id, fields })
    }

    if (params.state === "closed") {
      // Find and apply a closing transition
      const { transitions = [] } = await this.config.client.issues.getTransitions({ issueIdOrKey: id })
      const done = transitions.find((t) =>
        ["done", "closed", "resolved", "complete"].includes((t.name ?? "").toLowerCase())
      )
      if (done?.id) {
        await this.config.client.issues.doTransition({ issueIdOrKey: id, transition: { id: done.id } })
      }
    }

    return this.getIssue(id)
  }

  async listIssues(params: ListIssuesParams = {}): Promise<Issue[]> {
    const statusClause = params.state === "closed"
      ? 'AND status in ("Done", "Closed", "Resolved")'
      : params.state === "all"
      ? ""
      : 'AND status not in ("Done", "Closed", "Resolved")'

    const assigneeClause = params.assignee ? `AND assignee = "${params.assignee}"` : ""
    const labelsClause = params.labels?.length
      ? `AND labels in (${params.labels.map((l) => `"${l}"`).join(",")})`
      : ""

    const jql = `project = ${this.config.projectKey} ${statusClause} ${assigneeClause} ${labelsClause} ORDER BY updated DESC`
    return this.searchIssues(jql, params.limit ?? 20)
  }

  async searchIssues(query: string, limit = 20): Promise<Issue[]> {
    // If query doesn't look like JQL, treat it as a text search
    const jql = query.includes("=") || query.includes("AND") || query.includes("ORDER")
      ? query
      : `project = ${this.config.projectKey} AND text ~ "${query}" ORDER BY updated DESC`

    const result = await this.config.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch({
      jql,
      maxResults: Math.min(limit, 50),
      fields: ["summary", "status", "assignee", "labels", "issuetype", "created", "updated"],
    })

    return (result.issues ?? []).map((i) => this.toIssue(i as unknown as Record<string, unknown>))
  }

  async addComment(id: string, body: string): Promise<Comment> {
    const raw = await this.config.client.issueComments.addComment({
      issueIdOrKey: id,
      comment: toAdf(body),
    })
    return {
      id: raw.id ?? "",
      author: (raw.author as { displayName: string })?.displayName ?? "unknown",
      body: adfToText(raw.body),
      created_at: raw.created ?? "",
    }
  }

  async transitionIssue(id: string, status: string): Promise<Issue> {
    const { transitions = [] } = await this.config.client.issues.getTransitions({ issueIdOrKey: id })
    const match = transitions.find(
      (t) => (t.name ?? "").toLowerCase() === status.toLowerCase()
    )

    if (!match) {
      const available = transitions.map((t) => t.name).join(", ")
      throw new Error(`Transition "${status}" not found. Available: ${available}`)
    }

    await this.config.client.issues.doTransition({
      issueIdOrKey: id,
      transition: { id: match.id },
    })

    // Auto-assign to current user when moving to In Progress
    if (status.toLowerCase() === "in progress" && this.config.currentUserEmail) {
      const users = await this.config.client.userSearch.findUsers({
        query: this.config.currentUserEmail,
        maxResults: 1,
      })
      if (users[0]?.accountId) {
        await this.config.client.issues.assignIssue({
          issueIdOrKey: id,
          accountId: users[0].accountId,
        })
      }
    }

    return this.getIssue(id)
  }

  async listAttachments(id: string): Promise<Attachment[]> {
    const issue = await this.getIssue(id)
    return issue.attachments
  }

  async readAttachment(_issueId: string, attachmentId: string) {
    const res = await fetch(attachmentId, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.config.currentUserEmail}:${process.env.JIRA_API_TOKEN}`
        ).toString("base64")}`,
      },
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

    const attachments = await this.config.client.issueAttachments.addAttachment({
      issueIdOrKey: issueId,
      attachment: { filename, file: content },
    })

    const raw = Array.isArray(attachments) ? attachments[0] : attachments
    const a = raw as Record<string, unknown>
    return {
      id: a.id as string,
      filename,
      size: content.length,
      url: a.content as string,
      created_at: a.created as string,
    }
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────

function tracker(): JiraIssues {
  const config = getConfig()
  if (!config) throw new Error(NOT_CONFIGURED)
  return new JiraIssues(config)
}

export const get = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Read a Jira issue by key (e.g. PROJ-123), including comments and attachments.",
  args: { id: tool.schema.string().describe("Issue key, e.g. 'PROJ-123'") },
  async execute(args) {
    try {
      const issue = await tracker().getIssue(args.id)
      const comments = issue.comments.map(
        (c) => `@${c.author} (${c.created_at.slice(0, 10)}): ${c.body}`
      ).join("\n\n") || "No comments."
      return [
        `${issue.id}: ${issue.title}`,
        `Status: ${issue.status}`,
        `Labels: ${issue.labels?.join(", ") || "none"}`,
        `Assignee: ${issue.assignee ?? "Unassigned"}`,
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
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Create a new Jira issue in the configured project.",
  args: {
    title: tool.schema.string().describe("Issue summary/title"),
    description: tool.schema.string().optional().describe("Issue description (plain text)"),
    labels: tool.schema.string().optional().describe("Comma-separated labels"),
  },
  async execute(args) {
    try {
      const issue = await tracker().createIssue({
        title: args.title,
        description: args.description,
        labels: args.labels?.split(",").map((s) => s.trim()),
      })
      return `Created ${issue.id}: ${issue.title}\nURL: ${issue.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const update = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Update an existing Jira issue. Only provided fields are changed.",
  args: {
    id: tool.schema.string().describe("Issue key, e.g. 'PROJ-123'"),
    title: tool.schema.string().optional(),
    description: tool.schema.string().optional().describe("Replaces existing description"),
    labels: tool.schema.string().optional().describe("Comma-separated labels (replaces existing)"),
  },
  async execute(args) {
    try {
      const issue = await tracker().updateIssue(args.id, {
        title: args.title,
        description: args.description,
        labels: args.labels?.split(",").map((s) => s.trim()),
      })
      return `Updated ${issue.id}: ${issue.title}\nStatus: ${issue.status} | URL: ${issue.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const list = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. List Jira issues in the configured project. Uses JQL internally.",
  args: {
    state: tool.schema.string().optional().describe('"open" (default), "closed", or "all"'),
    assignee: tool.schema.string().optional().describe("Filter by assignee username or email"),
    labels: tool.schema.string().optional().describe("Comma-separated labels to filter by"),
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
      if (!issues.length) return "No issues found."
      return issues.map((i) =>
        `${i.id}  [${i.status}]  ${i.title}  (assignee: ${i.assignee ?? "none"})`
      ).join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const search = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Search Jira issues by keyword or JQL query. Plain text is automatically scoped to the configured project.",
  args: {
    query: tool.schema.string().describe("Keyword or JQL, e.g. 'login bug' or 'status = \"In Progress\"'"),
    limit: tool.schema.number().optional().describe("Max results (default 20)"),
  },
  async execute(args) {
    try {
      const issues = await tracker().searchIssues(args.query, args.limit)
      if (!issues.length) return `No issues found for: ${args.query}`
      return issues.map((i) => `${i.id}  [${i.status}]  ${i.title}`).join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const comment = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Add a comment to a Jira issue.",
  args: {
    id: tool.schema.string().describe("Issue key, e.g. 'PROJ-123'"),
    body: tool.schema.string().describe("Comment text (plain text)"),
  },
  async execute(args) {
    try {
      const c = await tracker().addComment(args.id, args.body)
      return `Comment posted on ${args.id} (ID: ${c.id})`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const transition = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Transition a Jira issue to a new status. Omit status to list available transitions. Automatically assigns to current user when transitioning to 'In Progress'.",
  args: {
    id: tool.schema.string().describe("Issue key, e.g. 'PROJ-123'"),
    status: tool.schema.string().optional().describe("Target status name. Omit to list available transitions."),
  },
  async execute(args) {
    try {
      if (!args.status) {
        const config = getConfig()
        if (!config) return NOT_CONFIGURED
        const { transitions = [] } = await config.client.issues.getTransitions({ issueIdOrKey: args.id })
        return `Available transitions for ${args.id}:\n${transitions.map((t) => `- ${t.name}`).join("\n")}`
      }
      const issue = await tracker().transitionIssue(args.id, args.status)
      return `${issue.id} transitioned to "${args.status}"\nStatus: ${issue.status} | URL: ${issue.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const upload_attachment = tool({
  description: "Only use when agent-config.json sets issue_tracker.provider to 'jira'. Upload a file as an attachment to a Jira issue.",
  args: {
    id: tool.schema.string().describe("Issue key, e.g. 'PROJ-123'"),
    file_path: tool.schema.string().describe("Absolute path to the file to upload"),
  },
  async execute(args) {
    try {
      const attachment = await tracker().uploadAttachment(args.id, args.file_path)
      return `Uploaded: ${attachment.filename}\nURL: ${attachment.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})
