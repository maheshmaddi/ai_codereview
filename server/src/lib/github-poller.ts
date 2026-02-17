/**
 * GitHub Polling Service — Alternative to webhooks for environments
 * without workflow access. Polls GitHub API for PRs with the trigger label.
 */

import { Octokit } from 'octokit'
import { getDb } from '../db/database.js'
import { runCommand } from './opencode-client.js'

interface ProjectRow {
  id: string
  display_name: string
  git_remote: string
  auto_review_enabled: number
  polling_enabled: number
  review_trigger_label: string
  last_polled_at: string | null
}

interface PolledPR {
  number: number
  title: string
  html_url: string
  updated_at: string
  labels: Array<{ name: string }>
  base: { repo: { full_name: string } }
}

export class GitHubPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private _isRunning = false
  private _lastPollTime: string | null = null
  private _lastError: string | null = null
  private pollIntervalMs: number
  private octokit: Octokit

  constructor() {
    const intervalSec = parseInt(process.env.GITHUB_POLLING_INTERVAL_SECONDS ?? '60', 10)
    this.pollIntervalMs = intervalSec * 1000

    const token = process.env.GITHUB_TOKEN
    if (!token) {
      console.warn('[Poller] GITHUB_TOKEN not set — polling will not work')
    }
    this.octokit = new Octokit({ auth: token })
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  get lastPollTime(): string | null {
    return this._lastPollTime
  }

  get lastError(): string | null {
    return this._lastError
  }

  start(): void {
    if (this._isRunning) {
      console.log('[Poller] Already running')
      return
    }

    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is required for polling mode')
    }

    this._isRunning = true
    this._lastError = null
    console.log(`[Poller] Started — polling every ${this.pollIntervalMs / 1000}s`)

    // Run immediately on start, then on interval
    void this.pollOnce()
    this.intervalId = setInterval(() => void this.pollOnce(), this.pollIntervalMs)
  }

  stop(): void {
    if (!this._isRunning) {
      console.log('[Poller] Already stopped')
      return
    }

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this._isRunning = false
    console.log('[Poller] Stopped')
  }

  /**
   * Single poll cycle: checks all polling-enabled projects for new PRs
   * with the configured trigger label.
   */
  async pollOnce(): Promise<{ projectsChecked: number; reviewsTriggered: number }> {
    const db = getDb()
    let projectsChecked = 0
    let reviewsTriggered = 0

    try {
      const projects = db
        .prepare(
          'SELECT * FROM projects WHERE auto_review_enabled = 1 AND polling_enabled = 1'
        )
        .all() as ProjectRow[]

      for (const project of projects) {
        try {
          const triggered = await this.pollProject(project)
          reviewsTriggered += triggered
          projectsChecked++

          // Update last_polled_at
          db.prepare("UPDATE projects SET last_polled_at = datetime('now') WHERE id = ?").run(
            project.id
          )
        } catch (err) {
          console.error(`[Poller] Error polling project ${project.id}:`, err)
        }
      }

      this._lastPollTime = new Date().toISOString()
      this._lastError = null
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this._lastError = errorMsg
      console.error('[Poller] Poll cycle error:', errorMsg)
    }

    return { projectsChecked, reviewsTriggered }
  }

  /**
   * Poll a single project for PRs with the trigger label.
   */
  private async pollProject(project: ProjectRow): Promise<number> {
    const db = getDb()
    let triggered = 0

    // Parse owner/repo from git_remote
    const { owner, repo } = this.parseGitRemote(project.git_remote)
    if (!owner || !repo) {
      console.warn(`[Poller] Could not parse git remote: ${project.git_remote}`)
      return 0
    }

    // Fetch open PRs with the trigger label
    const { data: pullRequests } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 30,
    })

    for (const pr of pullRequests) {
      const hasLabel = pr.labels.some((l) => l.name === project.review_trigger_label)
      if (!hasLabel) continue

      // Check if we already reviewed this PR's current head
      const existingReview = db
        .prepare(
          'SELECT id FROM reviews WHERE project_id = ? AND pr_number = ? ORDER BY created_at DESC LIMIT 1'
        )
        .get(project.id, pr.number) as { id: string } | undefined

      // Skip if already reviewed and PR hasn't been updated since
      if (existingReview && project.last_polled_at) {
        const prUpdated = new Date(pr.updated_at).getTime()
        const lastPolled = new Date(project.last_polled_at).getTime()
        if (prUpdated <= lastPolled) {
          continue
        }
      }

      // Skip if already reviewed this PR at all (to avoid duplicate reviews)
      if (existingReview) {
        continue
      }

      // Trigger review
      console.log(
        `[Poller] Triggering review for ${owner}/${repo} PR #${pr.number}: ${pr.title}`
      )

      try {
        const sessionId = await runCommand('codereview', `${pr.number} ${owner}/${repo}`)

        db.prepare(
          "INSERT INTO sessions (id, project_id, type, status) VALUES (?, ?, 'review', 'running')"
        ).run(sessionId, project.id)

        const reviewId = `${project.id}-pr-${pr.number}-${Date.now()}`
        db.prepare(
          `INSERT INTO reviews (id, project_id, pr_number, pr_title, pr_url, repository, reviewed_at, verdict, comment_count, review_dir)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'comment', 0, ?)`
        ).run(
          reviewId,
          project.id,
          pr.number,
          pr.title,
          pr.html_url,
          `${owner}/${repo}`,
          `pending-${sessionId}`
        )

        triggered++
        console.log(`[Poller] Review session ${sessionId} started for PR #${pr.number}`)
      } catch (err) {
        console.error(`[Poller] Failed to start review for PR #${pr.number}:`, err)
      }
    }

    return triggered
  }

  /**
   * Parse a git remote URL into owner and repo.
   * Handles both HTTPS and SSH formats.
   */
  private parseGitRemote(remote: string): { owner: string; repo: string } {
    // https://github.com/owner/repo.git
    const httpsMatch = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] }
    }

    // git@github.com:owner/repo.git
    const sshMatch = remote.match(/:([^/]+)\/([^/.]+)/)
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] }
    }

    return { owner: '', repo: '' }
  }
}

// Singleton instance
let pollerInstance: GitHubPoller | null = null

export function getPoller(): GitHubPoller {
  if (!pollerInstance) {
    pollerInstance = new GitHubPoller()
  }
  return pollerInstance
}
