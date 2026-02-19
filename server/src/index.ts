import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { projectsRouter } from './routes/projects.js'
import { reviewsRouter } from './routes/reviews.js'
import { sessionsRouter } from './routes/sessions.js'
import { webhookRouter } from './routes/webhook.js'
import { pollingRouter } from './routes/polling.js'
import { settingsRouter } from './routes/settings.js'
import { prCheckRouter } from './routes/pr-check.js'
import { getPoller } from './lib/github-poller.js'
import { initDatabase } from './db/database.js'

const app = express()
const PORT = process.env.PORT ?? 3001

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/projects', projectsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/settings', settingsRouter)
app.use('/webhooks', webhookRouter)
app.use('/api/polling', pollingRouter)
app.use('/api/projects', prCheckRouter)

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Initialize DB and start server
await initDatabase()

app.listen(PORT, () => {
  console.log(`OpenCode Code Review server running on port ${PORT}`)

  // Auto-start GitHub poller if enabled
  if (process.env.GITHUB_POLLING_ENABLED === 'true') {
    try {
      const poller = getPoller()
      poller.start()
      console.log('GitHub polling mode enabled')
    } catch (err) {
      console.error('Failed to start GitHub poller:', err)
    }
  }
})

export default app
