/**
 * Polling management API routes.
 * Allows starting/stopping the GitHub poller and checking status.
 */

import { Router } from 'express'
import { getPoller } from '../lib/github-poller.js'

export const pollingRouter = Router()

// GET /api/polling/status — current polling state
pollingRouter.get('/status', (_req, res) => {
    const poller = getPoller()
    res.json({
        running: poller.isRunning,
        last_poll_time: poller.lastPollTime,
        last_error: poller.lastError,
        polling_interval_seconds: parseInt(
            process.env.GITHUB_POLLING_INTERVAL_SECONDS ?? '60',
            10
        ),
        github_token_configured: Boolean(process.env.GITHUB_TOKEN),
    })
})

// POST /api/polling/start — start the poller
pollingRouter.post('/start', (_req, res) => {
    try {
        const poller = getPoller()
        poller.start()
        res.json({ message: 'Poller started', running: true })
    } catch (err) {
        res.status(400).json({ error: (err as Error).message })
    }
})

// POST /api/polling/stop — stop the poller
pollingRouter.post('/stop', (_req, res) => {
    const poller = getPoller()
    poller.stop()
    res.json({ message: 'Poller stopped', running: false })
})

// POST /api/polling/trigger — trigger an immediate poll cycle
pollingRouter.post('/trigger', async (_req, res) => {
    try {
        const poller = getPoller()
        const result = await poller.pollOnce()
        res.json({
            message: 'Poll cycle completed',
            projects_checked: result.projectsChecked,
            reviews_triggered: result.reviewsTriggered,
        })
    } catch (err) {
        res.status(500).json({ error: (err as Error).message })
    }
})
