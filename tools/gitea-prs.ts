import { tool } from "@opencode-ai/plugin"
import { getGiteaHostConfig, getDefaultBranch } from "./lib/agent-config"
import {
  PullRequestTracker,
  PullRequest,
  CreatePRParams,
  UpdatePRParams,
  ListPRsParams,
} from "./lib/pull-request-tracker"

// ── Config ─────────────────────────────────────────────────────────────────

const NOT_CONFIGURED =
  "Gitea not configured — set GITEA_ACCESS_TOKEN and add git_host.gitea.repo_url to agent-config.json. See GITEA_SETUP.md."

// ── Provider ───────────────────────────────────────────────────────────────

class GiteaPRs extends PullRequestTracker {
  constructor(private config: ReturnType<typeof getGiteaHostConfig> & object) {
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

  private toPR(raw: Record<string, unknown>): PullRequest {
    const state = raw.state as string
    const merged = raw.merged != null
    return {
      id: String(raw.number),
      title: raw.title as string,
      body: (raw.body as string) ?? "",
      status: merged ? "merged" : (state as "open" | "closed"),
      head: (raw.head as { label: string }).label,
      base: (raw.base as { label: string }).label,
      url: raw.html_url as string,
      created_at: raw.created_at as string,
      updated_at: raw.updated_at as string,
    }
  }

  async createPR(params: CreatePRParams): Promise<PullRequest> {
    const raw = await this.request<Record<string, unknown>>("/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
      }),
    })
    return this.toPR(raw)
  }

  async getPR(id: string): Promise<PullRequest> {
    const raw = await this.request<Record<string, unknown>>(`/pulls/${id}`)
    return this.toPR(raw)
  }

  async listPRs(params: ListPRsParams = {}): Promise<PullRequest[]> {
    const query = new URLSearchParams({
      state: params.state ?? "open",
      limit: String(Math.min(params.limit ?? 20, 50)),
    })
    const raw = await this.request<Record<string, unknown>[]>(`/pulls?${query}`)
    return raw.map((pr) => this.toPR(pr))
  }

  async updatePR(id: string, params: UpdatePRParams): Promise<PullRequest> {
    const payload: Record<string, unknown> = {}
    if (params.title !== undefined) payload.title = params.title
    if (params.body !== undefined) payload.body = params.body

    const raw = await this.request<Record<string, unknown>>(`/pulls/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
    return this.toPR(raw)
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────

function tracker(): GiteaPRs {
  const config = getGiteaHostConfig()
  if (!config) throw new Error(NOT_CONFIGURED)
  return new GiteaPRs(config)
}

export const create = tool({
  description:
    "Only use when agent-config.json sets git_host.provider to 'gitea'. Open a new Gitea pull request. Always opens as ready-for-review, never draft. Base branch defaults to the value in agent-config.json git_host.gitea.default_branch, falling back to 'main'.",
  args: {
    title: tool.schema.string().describe("PR title"),
    body: tool.schema.string().describe("PR body (Markdown). Use the pull request template."),
    head: tool.schema.string().describe("Source branch, e.g. 'feature/PROJ-42-add-auth'"),
    base: tool.schema.string().optional().describe("Target branch. Defaults to configured default branch."),
  },
  async execute(args) {
    try {
      const base = args.base ?? getDefaultBranch()
      const pr = await tracker().createPR({ title: args.title, body: args.body, head: args.head, base })
      return `Created PR #${pr.id}: ${pr.title}\nURL: ${pr.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const get = tool({
  description: "Only use when agent-config.json sets git_host.provider to 'gitea'. Read a Gitea pull request by number.",
  args: {
    id: tool.schema.string().describe("PR number, e.g. '42'"),
  },
  async execute(args) {
    try {
      const pr = await tracker().getPR(args.id)
      return [
        `PR #${pr.id}: ${pr.title}`,
        `Status: ${pr.status} | ${pr.head} → ${pr.base}`,
        `URL: ${pr.url}`,
        ``,
        pr.body || "(no body)",
      ].join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const list = tool({
  description: "Only use when agent-config.json sets git_host.provider to 'gitea'. List Gitea pull requests.",
  args: {
    state: tool.schema.string().optional().describe('"open" (default), "closed", or "all"'),
    limit: tool.schema.number().optional().describe("Max results (default 20, max 50)"),
  },
  async execute(args) {
    try {
      const prs = await tracker().listPRs({
        state: args.state as ListPRsParams["state"],
        limit: args.limit,
      })
      if (!prs.length) return `No ${args.state ?? "open"} pull requests found.`
      return prs.map((pr) =>
        `#${pr.id}  [${pr.status}]  ${pr.title}  (${pr.head} → ${pr.base})`
      ).join("\n")
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})

export const update = tool({
  description: "Only use when agent-config.json sets git_host.provider to 'gitea'. Update the title or body of an existing Gitea pull request.",
  args: {
    id: tool.schema.string().describe("PR number"),
    title: tool.schema.string().optional().describe("New title"),
    body: tool.schema.string().optional().describe("New body (replaces existing)"),
  },
  async execute(args) {
    try {
      const pr = await tracker().updatePR(args.id, { title: args.title, body: args.body })
      return `Updated PR #${pr.id}: ${pr.title}\nURL: ${pr.url}`
    } catch (e: unknown) {
      return (e as Error).message
    }
  },
})
