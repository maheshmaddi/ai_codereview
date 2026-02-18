/**
 * PR Check API — Check for open PRs with trigger label and optionally trigger reviews
 * Streams SSE events for live updates (similar to add project)
 */

import { Router } from 'express'
import { Octokit } from 'octokit'
import { getDb } from '../db/database.js'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const prCheckRouter = Router()

interface PRInfo {
  number: number
  title: string
  html_url: string
  updated_at: string
  has_trigger_label: boolean
}

// POST /api/projects/:projectId/check-prs — check for open PRs with trigger label
prCheckRouter.post('/:projectId/check-prs', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { auto_trigger = false } = req.body as { auto_trigger?: boolean }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  const db = getDb()

  try {
    // Get project details
    sendEvent('status', { message: 'Fetching project configuration...' })

    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(projectId) as {
        id: string
        git_remote: string
        review_trigger_label: string
        auto_review_enabled: number
        store_path: string
      } | undefined

    if (!project) {
      sendEvent('error', { message: 'Project not found' })
      res.end()
      return
    }

    sendEvent('status', { message: `Project: ${project.git_remote}` })
    sendEvent('status', { message: `Trigger label: ${project.review_trigger_label}` })

    // Parse owner/repo from git_remote
    const { owner, repo } = parseGitRemote(project.git_remote)
    if (!owner || !repo) {
      sendEvent('error', { message: `Could not parse git remote: ${project.git_remote}` })
      res.end()
      return
    }

    sendEvent('status', { message: `Repository: ${owner}/${repo}` })

    // Check for GitHub token
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      sendEvent('error', { message: 'GITHUB_TOKEN not configured. Cannot fetch PRs.' })
      res.end()
      return
    }

    const octokit = new Octokit({ auth: token })

    // Fetch open PRs
    sendEvent('status', { message: 'Fetching open pull requests from GitHub...' })

    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 50,
    })

    sendEvent('status', { message: `Found ${pullRequests.length} open PRs` })

    // Process each PR
    const prsWithLabel: PRInfo[] = []

    for (const pr of pullRequests) {
      const hasLabel = pr.labels.some((l) => l.name === project.review_trigger_label)
      if (hasLabel) {
        prsWithLabel.push({
          number: pr.number,
          title: pr.title,
          html_url: pr.html_url,
          updated_at: pr.updated_at,
          has_trigger_label: true,
        })
      }
    }

    // Send PR list info
    sendEvent('prs_found', {
      total: pullRequests.length,
      with_label: prsWithLabel.length,
      label: project.review_trigger_label,
      prs: prsWithLabel,
    })

    // Check which PRs have already been reviewed
    const prsToReview: PRInfo[] = []

    for (const pr of prsWithLabel) {
      const existingReview = db
        .prepare(
          'SELECT id, reviewed_at FROM reviews WHERE project_id = ? AND pr_number = ? ORDER BY reviewed_at DESC LIMIT 1'
        )
        .get(projectId, pr.number) as { id: string; reviewed_at: string } | undefined

      if (existingReview) {
        sendEvent('pr_status', {
          pr_number: pr.number,
          pr_title: pr.title,
          status: 'already_reviewed',
          reviewed_at: existingReview.reviewed_at,
        })
      } else {
        prsToReview.push(pr)
        sendEvent('pr_status', {
          pr_number: pr.number,
          pr_title: pr.title,
          status: 'pending_review',
        })
      }
    }

    if (prsToReview.length === 0) {
      sendEvent('status', { message: 'No new PRs to review.' })
      sendEvent('done', {
        message: 'Check completed. No new PRs require review.',
        prs_checked: pullRequests.length,
        prs_with_label: prsWithLabel.length,
        prs_reviewed: 0,
      })
      res.end()
      return
    }

    sendEvent('status', { message: `${prsToReview.length} PR(s) ready for review` })

    // Auto-trigger reviews if requested
    if (auto_trigger) {
      await triggerReviewsCLI(projectId, project.git_remote, prsToReview, sendEvent, res)
    } else {
      // Return PRs that need review without triggering
      sendEvent('done', {
        message: `${prsToReview.length} PR(s) ready for review.`,
        prs_checked: pullRequests.length,
        prs_with_label: prsWithLabel.length,
        prs_reviewed: 0,
        prs_to_review: prsToReview,
      })
      res.end()
    }
  } catch (err) {
    const errorMsg = (err as Error).message
    console.error('[PR Check] Error:', err)
    sendEvent('error', { message: errorMsg })
    res.end()
  }
})

// POST /api/projects/:projectId/review-prs-stream — trigger reviews with streaming (for manual trigger)
prCheckRouter.post('/:projectId/review-prs-stream', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { prs } = req.body as { prs: PRInfo[] }

  if (!prs || !Array.isArray(prs) || prs.length === 0) {
    return res.status(400).json({ error: 'prs array is required' })
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  const db = getDb()

  try {
    const project = db
      .prepare('SELECT git_remote FROM projects WHERE id = ?')
      .get(projectId) as { git_remote: string } | undefined

    if (!project) {
      sendEvent('error', { message: 'Project not found' })
      res.end()
      return
    }

    sendEvent('status', { message: `Starting reviews for ${prs.length} PR(s)...` })
    await triggerReviewsCLI(projectId, project.git_remote, prs, sendEvent, res)
  } catch (err) {
    const errorMsg = (err as Error).message
    console.error('[Review PRs Stream] Error:', err)
    sendEvent('error', { message: errorMsg })
    res.end()
  }
})

// POST /api/projects/:projectId/review-pr — trigger review for a specific PR (background, non-streaming)
prCheckRouter.post('/:projectId/review-pr', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { pr_number, pr_title, pr_url } = req.body as {
    pr_number: number
    pr_title: string
    pr_url: string
  }

  if (!pr_number || typeof pr_number !== 'number') {
    return res.status(400).json({ error: 'pr_number is required' })
  }

  const db = getDb()

  try {
    const project = db
      .prepare('SELECT git_remote FROM projects WHERE id = ?')
      .get(projectId) as { git_remote: string } | undefined

    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const { owner, repo } = parseGitRemote(project.git_remote)
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid git remote' })
    }

    // Run the review command using CLI (like add project does)
    const reviewId = `${projectId}-pr-${pr_number}-${Date.now()}`
    const sessionId = `cli-${Date.now()}`
    
    // Insert session record
    db.prepare(
      "INSERT INTO sessions (id, project_id, type, status) VALUES (?, ?, 'review', 'running')"
    ).run(sessionId, projectId)

    // Insert review record
    db.prepare(
      `INSERT INTO reviews (id, project_id, pr_number, pr_title, pr_url, repository, reviewed_at, verdict, comment_count, review_dir)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'comment', 0, ?)`
    ).run(
      reviewId,
      projectId,
      pr_number,
      pr_title || `PR #${pr_number}`,
      pr_url || `https://github.com/${owner}/${repo}/pull/${pr_number}`,
      `${owner}/${repo}`,
      `pending-${sessionId}`
    )

    // Start the review in background using CLI
    runReviewCLIBackground(projectId, project.git_remote, pr_number, owner, repo, reviewId, sessionId).catch(err => {
      console.error(`[Review PR] Background review failed for PR #${pr_number}:`, err)
      db.prepare("UPDATE sessions SET status = 'error' WHERE id = ?").run(sessionId)
    })

    res.json({
      success: true,
      session_id: sessionId,
      review_id: reviewId,
      message: `Review started for PR #${pr_number}`,
    })
  } catch (err) {
    console.error('[Review PR] Error:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

/**
 * Trigger reviews for multiple PRs using CLI mode with live streaming
 */
async function triggerReviewsCLI(
  projectId: string,
  gitRemote: string,
  prsToReview: PRInfo[],
  sendEvent: (type: string, data: Record<string, unknown>) => void,
  res: any
): Promise<void> {
  const db = getDb()
  const { owner, repo } = parseGitRemote(gitRemote)
  let triggeredCount = 0

  sendEvent('status', { message: 'Starting reviews using CLI mode...' })

  for (const pr of prsToReview) {
    try {
      sendEvent('status', { message: `\n========== Starting review for PR #${pr.number}: ${pr.title} ==========` })

      const reviewId = `${projectId}-pr-${pr.number}-${Date.now()}`
      const sessionId = `cli-${Date.now()}-${pr.number}`

      // Insert session record
      db.prepare(
        "INSERT INTO sessions (id, project_id, type, status) VALUES (?, ?, 'review', 'running')"
      ).run(sessionId, projectId)

      // Insert review record
      db.prepare(
        `INSERT INTO reviews (id, project_id, pr_number, pr_title, pr_url, repository, reviewed_at, verdict, comment_count, review_dir)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'comment', 0, ?)`
      ).run(
        reviewId,
        projectId,
        pr.number,
        pr.title,
        pr.html_url,
        `${owner}/${repo}`,
        `pending-${sessionId}`
      )

      // Run the review CLI and stream output
      const exitCode = await runReviewCLIWithStream(
        projectId,
        gitRemote,
        pr.number,
        owner,
        repo,
        sendEvent
      )

      if (exitCode === 0) {
        triggeredCount++
        db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(sessionId)
        sendEvent('review_triggered', {
          pr_number: pr.number,
          pr_title: pr.title,
          session_id: sessionId,
          review_id: reviewId,
        })
      } else {
        db.prepare("UPDATE sessions SET status = 'error' WHERE id = ?").run(sessionId)
        sendEvent('review_error', {
          pr_number: pr.number,
          pr_title: pr.title,
          error: `CLI exited with code ${exitCode}`,
        })
      }
    } catch (err) {
      sendEvent('review_error', {
        pr_number: pr.number,
        pr_title: pr.title,
        error: (err as Error).message,
      })
    }
  }

  sendEvent('done', {
    message: `Review process completed. ${triggeredCount}/${prsToReview.length} PR(s) successfully reviewed.`,
    prs_checked: prsToReview.length,
    prs_with_label: prsToReview.length,
    prs_reviewed: triggeredCount,
  })
  res.end()
}

/**
 * Run codereview CLI command in a temp directory with streaming output
 */
async function runReviewCLIWithStream(
  projectId: string,
  gitRemote: string,
  prNumber: number,
  owner: string,
  repo: string,
  sendEvent: (type: string, data: Record<string, unknown>) => void
): Promise<number> {
  const cloneId = `codereview-pr-${Date.now()}`
  const tempDir = path.join(os.tmpdir(), cloneId)

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        console.log(`[Review CLI] Cleaned up temp dir: ${tempDir}`)
      }
    } catch (e) {
      console.error('[Review CLI] Failed to clean up temp dir:', e)
    }
  }

  try {
    // Step 1: Clone the repository
    sendEvent('status', { message: `[PR #${prNumber}] Cloning ${gitRemote}...` })

    await new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', ['clone', '--depth', '1', gitRemote, tempDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      gitProcess.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      gitProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      gitProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`git clone failed: ${stderr || stdout}`))
      })

      gitProcess.on('error', reject)
    })

    sendEvent('status', { message: `[PR #${prNumber}] Repository cloned successfully.` })

    // Step 2: Run the codereview command using CLI
    sendEvent('status', { message: `[PR #${prNumber}] Running /codereview command...` })
    sendEvent('status', { message: `[PR #${prNumber}] Executing: opencode run --command codereview --dir ${tempDir} ${prNumber} ${owner}/${repo}` })

    const exitCode = await new Promise<number>((resolve, reject) => {
      const cliArgs = ['run', '--command', 'codereview', '--dir', tempDir, `${prNumber} ${owner}/${repo}`]

      const proc = spawn('opencode', cliArgs, {
        cwd: tempDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      })

      proc.stdout.on('data', (chunk: Buffer) => {
        chunk.toString().split('\n').forEach((line) => {
          const trimmed = line.trim()
          if (trimmed) {
            sendEvent('cli_output', { pr_number: prNumber, message: trimmed })
          }
        })
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        chunk.toString().split('\n').forEach((line) => {
          const trimmed = line.trim()
          if (trimmed) {
            sendEvent('cli_output', { pr_number: prNumber, message: `[stderr] ${trimmed}` })
          }
        })
      })

      proc.on('close', (code) => resolve(code ?? 0))
      proc.on('error', reject)
    })

    sendEvent('status', { message: `[PR #${prNumber}] CLI completed with exit code ${exitCode}` })

    // Step 3: Remove the trigger label if review was successful
    if (exitCode === 0) {
      try {
        sendEvent('status', { message: `[PR #${prNumber}] Removing trigger label...` })
        await removeTriggerLabel(owner, repo, prNumber, projectId)
        sendEvent('status', { message: `[PR #${prNumber}] Label removed successfully.` })
      } catch (labelErr) {
        console.error(`[Review CLI] Failed to remove label for PR #${prNumber}:`, labelErr)
        sendEvent('status', { message: `[PR #${prNumber}] Warning: Could not remove label.` })
      }
    }

    cleanup()
    return exitCode
  } catch (err) {
    cleanup()
    throw err
  }
}

/**
 * Run codereview CLI command in background (non-streaming, for single PR trigger)
 */
async function runReviewCLIBackground(
  projectId: string,
  gitRemote: string,
  prNumber: number,
  owner: string,
  repo: string,
  reviewId: string,
  sessionId: string
): Promise<void> {
  const cloneId = `codereview-pr-${Date.now()}`
  const tempDir = path.join(os.tmpdir(), cloneId)
  const db = getDb()

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        console.log(`[Review CLI] Cleaned up temp dir: ${tempDir}`)
      }
    } catch (e) {
      console.error('[Review CLI] Failed to clean up temp dir:', e)
    }
  }

  try {
    console.log(`[Review CLI] Starting review for PR #${prNumber} in ${tempDir}`)

    // Step 1: Clone the repository
    await new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', ['clone', '--depth', '1', gitRemote, tempDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      gitProcess.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      gitProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`git clone failed: ${stderr}`))
      })

      gitProcess.on('error', reject)
    })

    console.log(`[Review CLI] Repository cloned to ${tempDir}`)

    // Step 2: Run the codereview command using CLI
    const exitCode = await new Promise<number>((resolve, reject) => {
      const cliArgs = ['run', '--command', 'codereview', '--dir', tempDir, `${prNumber} ${owner}/${repo}`]
      
      console.log(`[Review CLI] Executing: opencode ${cliArgs.join(' ')}`)

      const proc = spawn('opencode', cliArgs, {
        cwd: tempDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        console.log(`[Review CLI stdout] ${chunk.toString().trim()}`)
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        console.log(`[Review CLI stderr] ${chunk.toString().trim()}`)
      })

      proc.on('close', (code) => {
        console.log(`[Review CLI] Process exited with code ${code}`)
        resolve(code ?? 0)
      })

      proc.on('error', (err) => {
        console.error(`[Review CLI] Process error:`, err)
        reject(err)
      })
    })

    // Update session status
    if (exitCode === 0) {
      db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(sessionId)
      console.log(`[Review CLI] Review completed successfully for PR #${prNumber}`)
      
      // Step 3: Remove the trigger label
      try {
        console.log(`[Review CLI] Removing trigger label for PR #${prNumber}...`)
        await removeTriggerLabel(owner, repo, prNumber, projectId)
        console.log(`[Review CLI] Label removed successfully for PR #${prNumber}`)
      } catch (labelErr) {
        console.error(`[Review CLI] Failed to remove label for PR #${prNumber}:`, labelErr)
      }
    } else {
      db.prepare("UPDATE sessions SET status = 'error' WHERE id = ?").run(sessionId)
      console.error(`[Review CLI] Review failed for PR #${prNumber} with exit code ${exitCode}`)
    }

    cleanup()
  } catch (err) {
    console.error(`[Review CLI] Error:`, err)
    db.prepare("UPDATE sessions SET status = 'error' WHERE id = ?").run(sessionId)
    cleanup()
    throw err
  }
}

/**
 * Remove the trigger label from a PR after successful review
 */
async function removeTriggerLabel(
  owner: string,
  repo: string,
  prNumber: number,
  projectId: string
): Promise<void> {
  const db = getDb()
  
  // Get the project's trigger label
  const project = db
    .prepare('SELECT review_trigger_label FROM projects WHERE id = ?')
    .get(projectId) as { review_trigger_label: string } | undefined

  if (!project?.review_trigger_label) {
    console.log(`[Label Removal] No trigger label configured for project ${projectId}`)
    return
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured')
  }

  const octokit = new Octokit({ auth: token })

  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: project.review_trigger_label,
    })
    console.log(`[Label Removal] Removed label "${project.review_trigger_label}" from PR #${prNumber}`)
  } catch (err: any) {
    // Label might not exist or already removed, log but don't fail
    if (err.status === 404) {
      console.log(`[Label Removal] Label "${project.review_trigger_label}" not found on PR #${prNumber} (may already be removed)`)
    } else {
      throw err
    }
  }
}

/**
 * Parse a git remote URL into owner and repo.
 * Handles both HTTPS and SSH formats.
 */
function parseGitRemote(remote: string): { owner: string; repo: string } {
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
