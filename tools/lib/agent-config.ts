import { readFileSync } from "fs"
import { join } from "path"

export interface AgentConfig {
  issue_tracker?: {
    provider?: string
    gitea?: { repo_url?: string }
    github?: { repo_url?: string }
    jira?: {
      base_url?: string
      project_key?: string
    }
  }
  git_host?: {
    provider?: string
    default_branch?: string
    gitea?: { repo_url?: string; default_branch?: string }
    github?: { repo_url?: string; default_branch?: string }
  }
}

export function readAgentConfig(): AgentConfig {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "agent-config.json"), "utf-8"))
  } catch {
    return {}
  }
}

/** Returns the default branch for the configured git host. Falls back to "main". */
export function getDefaultBranch(): string {
  const config = readAgentConfig()
  const provider = config.git_host?.provider
  if (provider === "github") return config.git_host?.github?.default_branch ?? config.git_host?.default_branch ?? "main"
  if (provider === "gitea") return config.git_host?.gitea?.default_branch ?? config.git_host?.default_branch ?? "main"
  return config.git_host?.default_branch ?? "main"
}

// ── Gitea ─────────────────────────────────────────────────────────────────────

export interface GiteaConfig {
  baseUrl: string
  owner: string
  repo: string
  token: string
}

function parseGiteaUrl(repoUrl: string, token: string): GiteaConfig | null {
  try {
    const url = new URL(repoUrl)
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    return { baseUrl: url.origin, owner: parts[0], repo: parts[1], token }
  } catch {
    return null
  }
}

/** Config for Gitea issue tools */
export function getGiteaIssueConfig(): GiteaConfig | null {
  const token = process.env.GITEA_ACCESS_TOKEN
  if (!token) return null
  const repoUrl =
    process.env.GITEA_REPO_URL ?? readAgentConfig().issue_tracker?.gitea?.repo_url
  if (!repoUrl) return null
  return parseGiteaUrl(repoUrl, token)
}

/** Config for Gitea git-host tools (PRs) */
export function getGiteaHostConfig(): GiteaConfig | null {
  const token = process.env.GITEA_ACCESS_TOKEN
  if (!token) return null
  const repoUrl =
    process.env.GITEA_REPO_URL ?? readAgentConfig().git_host?.gitea?.repo_url
  if (!repoUrl) return null
  return parseGiteaUrl(repoUrl, token)
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export interface GithubConfig {
  /** Full REST API base, e.g. https://api.github.com/repos/owner/repo */
  apiBase: string
  owner: string
  repo: string
  token: string
}

function parseGithubUrl(repoUrl: string, token: string): GithubConfig | null {
  try {
    const url = new URL(repoUrl)
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    const apiBase =
      url.hostname === "github.com"
        ? `https://api.github.com/repos/${parts[0]}/${parts[1]}`
        : `${url.origin}/api/v3/repos/${parts[0]}/${parts[1]}`
    return { apiBase, owner: parts[0], repo: parts[1], token }
  } catch {
    return null
  }
}

/** Config for GitHub issue tools */
export function getGithubIssueConfig(): GithubConfig | null {
  const token = process.env.GITHUB_ACCESS_TOKEN
  if (!token) return null
  const repoUrl =
    process.env.GITHUB_REPO_URL ?? readAgentConfig().issue_tracker?.github?.repo_url
  if (!repoUrl) return null
  return parseGithubUrl(repoUrl, token)
}

/** Config for GitHub git-host tools (PRs) */
export function getGithubHostConfig(): GithubConfig | null {
  const token = process.env.GITHUB_ACCESS_TOKEN
  if (!token) return null
  const repoUrl =
    process.env.GITHUB_REPO_URL ?? readAgentConfig().git_host?.github?.repo_url
  if (!repoUrl) return null
  return parseGithubUrl(repoUrl, token)
}
