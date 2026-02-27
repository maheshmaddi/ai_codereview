/**
 * PR Check API — Check for open PRs with trigger label and optionally trigger reviews
 * Streams SSE events for live updates (similar to add project)
 */

import { Router } from 'express'
import { Octokit } from 'octokit'
import { dbGet, dbRun } from '../db/database.js'
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

export type PRStatus = {
  pr_number: number
  pr_title: string
  status: 'pending_review' | 'already_reviewed'
  reviewed_at?: string
}

/**
 * Run codereview CLI command
 */
async function runReviewCLI(
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
    // Step 1: Clone repository
    sendEvent('status', { message: `[PR #${prNumber}] Cloning ${gitRemote}...` })

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

      let stdout = ''
      let stderr = ''

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

    // Step 3: Save review output to database if successful
    if (exitCode === 0) {
      try {
        sendEvent('status', { message: `[PR #${prNumber}] Saving review output to database...` })
        await saveReviewOutput(projectId, prNumber, tempDir, sendEvent)
        sendEvent('status', { message: `[PR #${prNumber}] Review output saved successfully.` })
      } catch (outputErr) {
        console.error(`[Review CLI] Failed to save review output for PR #${prNumber}:`, outputErr)
        sendEvent('status', { message: `[PR #${prNumber}] Warning: Could not save review output.` })
      }

      // Step 4: Remove the trigger label if review was successful
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
 * Save review output to database
 */
async function saveReviewOutput(
  projectId: string,
  prNumber: number,
  reviewDir: string,
  sendEvent: (type: string, data: Record<string, unknown>) => void
): Promise<void> {
  const reviewOutputPath = path.join(reviewDir, 'review_comments.json')

  if (!fs.existsSync(reviewOutputPath)) {
    throw new Error('Review output file not found')
  }

  try {
    const reviewOutput = fs.readFileSync(reviewOutputPath, 'utf-8')
    const outputData = JSON.parse(reviewOutput)

    // Save to database
    await dbRun(
      `INSERT INTO reviews (id, project_id, pr_number, review_dir, review_output, reviewed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        outputData.pr_number ? `${projectId}-pr-${outputData.pr_number}-${Date.now()}` : `${projectId}-pr-${prNumber}-${Date.now()}`,
        projectId,
        prNumber,
        reviewDir,
        reviewOutput,
      ]
    )

    sendEvent('review_saved', { pr_number: prNumber })
    console.log(`[Review CLI] Saved review output for PR #${prNumber}`)
  } catch (err) {
    console.error(`[Review CLI] Error saving review output:`, err)
    throw err
  }
}

/**
 * Remove trigger label from a PR after successful review
 */
async function removeTriggerLabel(
  owner: string,
  repo: string,
  prNumber: number,
  projectId: string
): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.warn('[PR Check] GITHUB_TOKEN not configured')
    return
  }

  const octokit = new Octokit({ auth: token })

  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: process.env.REVIEW_TRIGGER_LABEL ?? 'ai_codereview',
    })
  } catch (error) {
    console.error('[PR Check] Failed to remove label:', error)
  }
}

/**
 * Parse git remote URL into owner and repo
 */
function parseGitRemote(remote: string): { owner: string; repo: string } {
  // https://github.com/owner/repo.git → github.com/owner/repo
  const httpsMatch = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  // git@github.com:owner/repo.git → github.com/owner/repo
  const sshMatch = remote.match(/([^/]+)\/([^/.]+)/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  return { owner: '', repo: '' }
}

// POST /api/projects/:projectId/check-prs — Check for open PRs with trigger label and optionally trigger reviews
prCheckRouter.post('/:projectId/check-prs', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { auto_trigger = false } = req.body as { auto_trigger?: boolean }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('-cache', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  const db = await dbGet('SELECT * FROM projects WHERE id = ?', [projectId]) as {
    id: string
    display_name: string
    git_remote: string
    review_trigger_label: string
  } | undefined

  if (!db) {
    sendEvent('error', { message: 'Project not found' })
    res.end()
    return
  }

  const { owner, repo } = parseGitRemote(db.git_remote)
  const triggerLabel = db.review_trigger_label

  try {
    // Check for GitHub token
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      sendEvent('status', { message: 'Fetching project configuration...' })
      sendEvent('error', { message: 'GITHUB_TOKEN not configured. Cannot fetch PRs.' })
      res.end()
      return
    }

    sendEvent('status', { message: `Project: ${db.git_remote}` })
    sendEvent('status', { message: `Trigger label: ${triggerLabel}` })
    sendEvent('status', { message: `Repository ${owner}/${repo}` })

    // Fetch open PRs
    sendEvent('status', { message: 'Fetching open pull requests from GitHub...' })

    const octokit = new Octokit({ auth: token })

    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 50,
    })

    sendEvent('status', { message: `Found ${pullRequests.length} open PRs` })

    // Filter PRs with trigger label
    const prsWithLabel = pullRequests.filter((pr) =>
      pr.labels.some((l) => l.name === triggerLabel)
    )

    const prsWithLabelCount = prsWithLabel.length
    sendEvent('info', { message: `Found ${prsWithLabelCount} PR(s) with label "${triggerLabel}"` })

    // Check review history for each PR
    const prsToReview: PRInfo[] = []

     for (const pr of prsWithLabel) {
       const existingReview = await dbGet(
         'SELECT id, reviewed_at FROM reviews WHERE project_id = ? AND pr_number = ? ORDER BY reviewed_at DESC LIMIT 1',
         [projectId, pr.number]
       ) as { id: string; reviewed_at: string } | undefined

       const prStatus: PRStatus = {
         pr_number: pr.number,
         pr_title: pr.title,
         status: existingReview ? 'already_reviewed' : 'pending_review',
         reviewed_at: existingReview?.reviewed_at,
       }

       if (existingReview && prStatus.reviewed_at) {
         // Check if PR has been updated since last review
         const prUpdated = new Date(pr.updated_at).getTime()
         const lastReviewed = new Date(prStatus.reviewed_at).getTime()

         // Only re-review if PR has been updated after last review
         if (prUpdated <= lastReviewed) {
           sendEvent('status', { message: `PR #${pr.number} already reviewed at ${prStatus.reviewed_at}` })
           prStatus.status = 'already_reviewed'
         }
       } else {
         prStatus.status = 'pending_review'
         prsToReview.push({
           number: pr.number,
           title: pr.title,
           html_url: pr.html_url,
           updated_at: pr.updated_at,
           has_trigger_label: false
         })
       }
     }

    sendEvent('done', {
      message: `Found ${prsToReview.length} PR(s) ready for review.`,
      prs_to_review: prsToReview.map(pr => ({
        pr_number: pr.number,
        pr_title: pr.title,
      })),
    })

    // Auto-trigger reviews if requested
    if (auto_trigger && prsToReview.length > 0) {
      sendEvent('status', { message: 'Starting reviews for pending PRs with live CLI output...' })
      await triggerReviewsCLI(projectId, db.git_remote, prsToReview, sendEvent, res)
    }

    res.end()
   } catch (error) {
     console.error('[Review PR] Error:', error)
     const errorMessage = error instanceof Error ? error.message : 'An error occurred'
     sendEvent('error', { message: errorMessage })
     res.end()
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
  const { owner, repo } = parseGitRemote(gitRemote)
  const reviewId = `${projectId}-pr-review-${Date.now()}`
  const sessionId = `cli-${Date.now()}-${Math.floor(Math.random() * 10000)}`

  const db = await dbGet('SELECT id FROM projects WHERE id = ?', [projectId])
  let triggeredCount = 0

  for (const pr of prsToReview) {
    try {
      sendEvent('status', { message: `\n========== Starting review for PR #${pr.number}: ${pr.title} ==========` })
      const exitCode = await runReviewCLI(projectId, db.git_remote, pr.number, owner, repo, sendEvent)

      if (exitCode === 0) {
        triggeredCount++
      } else {
        sendEvent('error', { message: `Review failed for PR #${pr.number}` })
      }
    } catch (err) {
      console.error(`[Review CLI] Error running review for PR #${pr.number}:`, err)
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
 * Run review in background without SSE streaming
 */
async function runReviewCLIBackground(
  projectId: string,
  gitRemote: string,
  prNumber: number,
  owner: string,
  repo: string,
  reviewId: string,
  sessionId: string
): Promise<number> {
  const cloneId = `codereview-pr-${Date.now()}`
  const tempDir = path.join(os.tmpdir(), cloneId)

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
        console.log(`[Background Review] Cleaned up temp dir: ${tempDir}`)
      }
    } catch (e) {
      console.error('[Background Review] Failed to clean up temp dir:', e)
    }
  }

  try {
    console.log(`[Background Review] Starting review for PR #${prNumber}...`)

    // Step 1: Clone repository
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

    console.log(`[Background Review] Repository cloned successfully.`)

    // Step 2: Run the codereview command
    console.log(`[Background Review] Running opencode command...`)

    const exitCode = await new Promise<number>((resolve, reject) => {
      const cliArgs = ['run', '--command', 'codereview', '--dir', tempDir, `${prNumber} ${owner}/${repo}`]

      const proc = spawn('opencode', cliArgs, {
        cwd: tempDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      })

      proc.on('close', (code) => resolve(code ?? 0))
      proc.on('error', reject)
    })

    console.log(`[Background Review] CLI completed with exit code ${exitCode}`)

    // Step 3: Save review output to database if successful
    if (exitCode === 0) {
      try {
        console.log(`[Background Review] Saving review output to database...`)
        await saveReviewOutput(projectId, prNumber, tempDir, (type: string, data: Record<string, unknown>) => {})
        console.log(`[Background Review] Review output saved successfully.`)
      } catch (outputErr) {
        console.error(`[Background Review] Failed to save review output for PR #${prNumber}:`, outputErr)
      }

      // Step 4: Remove the trigger label if review was successful
      try {
        await removeTriggerLabel(owner, repo, prNumber, projectId)
        console.log(`[Background Review] Label removed successfully.`)
      } catch (labelErr) {
        console.error(`[Background Review] Failed to remove label for PR #${prNumber}:`, labelErr)
      }
    }

    cleanup()
    return exitCode
  } catch (err) {
    cleanup()
    throw err
  }
}

// POST /api/projects/:projectId/review-pr — Trigger review for a specific PR (background, non-streaming)
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

  const { owner, repo } = parseGitRemote((await dbGet('SELECT git_remote FROM projects WHERE id = ?', [projectId]) as { git_remote: string }).git_remote)

  const reviewId = `${projectId}-pr-${pr_number}-${Date.now()}`
  const sessionId = `cli-${Date.now()}-${Math.floor(Math.random() * 10000)}`

  // Insert session record
  await dbRun(
    "INSERT INTO sessions (id, project_id, type, status) VALUES (?, ?, 'review', 'running')",
    [sessionId, projectId]
  )

  // Start review in background using CLI
  runReviewCLIBackground(projectId, (await dbGet('SELECT git_remote FROM projects WHERE id = ?', [projectId]) as { git_remote: string }).git_remote, pr_number, owner, repo, reviewId, sessionId)
    .then(() => {
      res.json({
        success: true,
        session_id: sessionId,
        review_id: reviewId,
        message: `Review started for PR #${pr_number}`,
      })
    })
  .catch(err => {
    console.error(`[Review PR] Error`, err)
    res.status(500).json({ error: (err as Error).message })
  })
})

// POST /api/projects/:projectId/review-prs-stream — Trigger reviews for multiple PRs with SSE streaming
prCheckRouter.post('/:projectId/review-prs-stream', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { prs } = req.body as { prs: Array<{ number?: number; pr_number?: number; title?: string; pr_title?: string; html_url?: string; updated_at?: string }> }

  if (!prs || !Array.isArray(prs) || prs.length === 0) {
    return res.status(400).json({ error: 'prs array is required' })
  }

  // Normalize PR objects to have number and title properties
  const normalizedPRs = prs.map((pr: any) => ({
    number: pr.number ?? pr.pr_number,
    title: pr.title ?? pr.pr_title,
    html_url: pr.html_url || '',
    updated_at: pr.updated_at || '',
    has_trigger_label: false
  }))

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('-cache', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  const db = await dbGet('SELECT * FROM projects WHERE id = ?', [projectId])
  if (!db) {
    sendEvent('error', { message: 'Project not found' })
    res.end()
    return
  }

  const { owner, repo } = parseGitRemote(db.git_remote)

  try {
    // Send start event
    sendEvent('status', { message: `Starting reviews for ${normalizedPRs.length} PR(s) with live CLI output...` })

    // Trigger reviews sequentially
    let successCount = 0
    for (const pr of normalizedPRs) {
      try {
        sendEvent('status', { message: `\n========== Starting review for PR #${pr.number}: ${pr.title} ==========` })

        const exitCode = await runReviewCLI(
          projectId,
          db.git_remote,
          pr.number,
          owner,
          repo,
          sendEvent
        )

        if (exitCode === 0) {
          successCount++
          sendEvent('review_triggered', {
            pr_number: pr.number,
            pr_title: pr.title,
            review_id: `${projectId}-pr-${pr.number}-${Date.now()}`,
            session_id: `cli-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          })
        } else {
          sendEvent('review_error', {
            pr_number: pr.number,
            pr_title: pr.title,
            error: `Review failed with exit code ${exitCode}`,
          })
        }
      } catch (err) {
        console.error(`[Review PRs] Error running review for PR #${pr.number}:`, err)
        sendEvent('review_error', {
          pr_number: pr.number,
          pr_title: pr.title,
          error: (err as Error).message || 'Unknown error',
        })
      }
    }

    // Send done event
    sendEvent('done', {
      message: `Review process completed. ${successCount}/${prs.length} PR(s) successfully reviewed.`,
      prs_checked: prs.length,
      prs_reviewed: successCount,
    })

    res.end()
  } catch (error) {
    console.error('[Review PRs] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    sendEvent('error', { message: errorMessage })
    res.end()
  }
})
