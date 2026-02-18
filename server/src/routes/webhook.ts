/**
 * GitHub webhook receiver for PR label-based code review triggering.
 * Listens for PRs labeled with the configured trigger label.
 */

import { Router } from 'express'
import crypto from 'crypto'
import { getDb } from '../db/database.js'
import { runCommand } from '../lib/opencode-client.js'
import { remoteToStorePath } from '../lib/store.js'

export const webhookRouter = Router()

function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSig = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
}

// POST /webhooks/github — GitHub PR webhook handler
webhookRouter.post('/github', express_raw_body_middleware, async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string
  const event = req.headers['x-github-event'] as string
  const rawBody = (req as unknown as { rawBody: string }).rawBody

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET
  if (webhookSecret && signature) {
    if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }
  }

  if (event !== 'pull_request') {
    return res.status(200).json({ message: 'Event ignored' })
  }

  const payload = JSON.parse(rawBody) as {
    action: string
    pull_request: {
      number: number
      title: string
      labels: Array<{ name: string }>
      html_url: string
      base: { repo: { clone_url: string; full_name: string } }
    }
  }

  const { action, pull_request: pr } = payload

  // Only process labeled/opened/synchronize actions
  if (!['labeled', 'opened', 'synchronize', 'reopened'].includes(action)) {
    return res.status(200).json({ message: 'Action ignored' })
  }

  // Look up project by git remote
  const gitRemote = pr.base.repo.clone_url
  const projectId = remoteToStorePath(gitRemote)

  const db = getDb()
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | { id: string; auto_review_enabled: number; review_trigger_label: string }
    | undefined

  if (!project) {
    console.log(`Webhook: project not found for remote ${gitRemote}`)
    return res.status(200).json({ message: 'Project not registered' })
  }

  if (!project.auto_review_enabled) {
    return res.status(200).json({ message: 'Auto review disabled for this project' })
  }

  const hasLabel = pr.labels.some((l) => l.name === project.review_trigger_label)
  if (!hasLabel) {
    return res.status(200).json({ message: 'Trigger label not present' })
  }

  // Acknowledge webhook immediately, process async
  res.status(202).json({ message: 'Review queued', pr_number: pr.number })

  // Run review asynchronously
  try {
    const sessionId = await runCommand(
      'codereview',
      `${pr.number} ${pr.base.repo.full_name}`
    )

    await db.prepare(
      "INSERT INTO sessions (id, project_id, type, status) VALUES (?, ?, 'review', 'running')"
    ).run(sessionId, project.id)

    // Pre-create review history entry (will be updated when complete)
    const reviewId = `${projectId}-pr-${pr.number}-${Date.now()}`
    await db.prepare(
      `INSERT INTO reviews (id, project_id, pr_number, pr_title, pr_url, repository, reviewed_at, verdict, comment_count, review_dir)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'comment', 0, ?)`
    ).run(reviewId, project.id, pr.number, pr.title, pr.html_url, pr.base.repo.full_name, `pending-${sessionId}`)

    console.log(`Webhook: Review session ${sessionId} started for PR #${pr.number}`)
  } catch (e) {
    console.error('Webhook: Failed to start review:', e)
  }
})

/** Middleware to capture raw body for signature verification */
function express_raw_body_middleware(
  req: import('express').Request & { rawBody?: string },
  _res: import('express').Response,
  next: import('express').NextFunction
) {
  let body = ''
  req.on('data', (chunk: Buffer) => { body += chunk.toString() })
  req.on('end', () => {
    req.rawBody = body
    try {
      req.body = JSON.parse(body)
    } catch {
      req.body = {}
    }
    next()
  })
}
