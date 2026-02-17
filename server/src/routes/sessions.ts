import { Router } from 'express'
import { getDb } from '../db/database.js'
import { getSessionStatus } from '../lib/opencode-client.js'

export const sessionsRouter = Router()

// GET /api/sessions/:sessionId/status
sessionsRouter.get('/:sessionId/status', async (req, res) => {
  const db = getDb()

  // Update from OpenCode server
  const liveStatus = await getSessionStatus(req.params.sessionId)

  // Persist to DB if completed or errored
  if (liveStatus.status !== 'running') {
    db.prepare(
      "UPDATE sessions SET status = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(liveStatus.status, req.params.sessionId)
  }

  res.json(liveStatus)
})
