import { Router } from 'express'
import { dbRun } from '../db/database.js'
import { getSessionStatus } from '../lib/opencode-client.js'

export const sessionsRouter = Router()

// GET /api/sessions/:sessionId/status
sessionsRouter.get('/:sessionId/status', async (req, res) => {
  try {
    // Update from OpenCode server
    const liveStatus = await getSessionStatus(req.params.sessionId)

    // Persist to DB if completed or errored
    if (liveStatus.status !== 'running') {
      await dbRun(
        "UPDATE sessions SET status = ?, completed_at = datetime('now') WHERE id = ?",
        [liveStatus.status, req.params.sessionId]
      )
    }

    res.json(liveStatus)
  } catch (err) {
    console.error('Error fetching session status:', err)
    res.status(500).json({ error: 'Failed to fetch session status' })
  }
})
