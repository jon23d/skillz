import { readFileSync } from "fs"
import { join } from "path"

export interface AgentConfig {
  issue_tracker?: {
    provider?: string
    gitea?: { repo_url?: string }
  }
  git_host?: {
    provider?: string
    default_branch?: string
    gitea?: { repo_url?: string; default_branch?: string }
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
  return (
    config.git_host?.gitea?.default_branch ??
    config.git_host?.default_branch ??
    "main"
  )
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
