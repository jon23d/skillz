// Shared types and interface for all pull request providers.
// Each provider implements PullRequestTracker and reads its own
// config from agent-config.json and env vars.

export interface PullRequest {
  id: string
  title: string
  body: string
  status: "open" | "closed" | "merged"
  head: string         // source branch
  base: string         // target branch
  url: string
  created_at: string
  updated_at: string
}

export interface CreatePRParams {
  title: string
  body: string
  head: string         // feature branch, e.g. "feature/PROJ-42-add-auth"
  base: string         // target branch, e.g. "main"
}

export interface UpdatePRParams {
  title?: string
  body?: string
}

export interface ListPRsParams {
  state?: "open" | "closed" | "all"
  limit?: number
}

export abstract class PullRequestTracker {
  /** Open a new pull request */
  abstract createPR(params: CreatePRParams): Promise<PullRequest>

  /** Read a pull request by ID or number */
  abstract getPR(id: string): Promise<PullRequest>

  /** List pull requests */
  abstract listPRs(params?: ListPRsParams): Promise<PullRequest[]>

  /** Update the title or body of an existing pull request */
  abstract updatePR(id: string, params: UpdatePRParams): Promise<PullRequest>
}
