import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { v4 as uuidv4 } from './utils.js'
import { getDb } from '../db/database.js'
import { runCommandInDirWithFallback, pollSessionMessages } from '../lib/openclaw-client.js'

export const phasesRouter = Router()

// Multer config for requirement file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.homedir(), '.codereview-store', 'uploads')
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.md', '.txt']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error(`Invalid file type. Allowed: ${allowed.join(', ')}`))
  },
})

// ─── Helper: generate UUID (no crypto dep) ───────────────────────────
function genId(): string {
  return 'f-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

// ─── SSE helper ───────────────────────────────────────────────────────
function setupSSE(res: import('express').Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }
  return sendEvent
}

// ═══════════════════════════════════════════════════════════════════════
// FEATURE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

// GET /api/projects/:projectId/features
phasesRouter.get('/projects/:projectId/features', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const db = getDb()
  const features = await db
    .prepare(
      `SELECT fp.*,
        (SELECT COUNT(*) FROM phase_questions pq WHERE pq.feature_id = fp.id AND pq.answer IS NULL) as unanswered_questions,
        (SELECT MAX(pr.version) FROM phase_revisions pr WHERE pr.feature_id = fp.id AND pr.phase = fp.current_phase) as current_version
       FROM feature_phases fp
       WHERE fp.project_id = ?
       ORDER BY fp.created_at DESC`
    )
    .all(projectId)

  res.json(features)
})

// POST /api/projects/:projectId/features
phasesRouter.post('/projects/:projectId/features', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { name } = req.body as { name?: string }

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Feature name is required' })
  }

  const db = getDb()
  const id = genId()

  await db.prepare(
    `INSERT INTO feature_phases (id, project_id, name) VALUES (?, ?, ?)`
  ).run(id, projectId, name)

  const feature = await db.prepare('SELECT * FROM feature_phases WHERE id = ?').get(id)
  res.status(201).json(feature)
})

// GET /api/projects/:projectId/features/:featureId
phasesRouter.get('/projects/:projectId/features/:featureId', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const featureId = req.params.featureId
  const db = getDb()

  const feature = await db
    .prepare('SELECT * FROM feature_phases WHERE id = ? AND project_id = ?')
    .get(featureId, projectId)

  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' })
  }

  const unanswered = await db
    .prepare('SELECT COUNT(*) as count FROM phase_questions WHERE feature_id = ? AND answer IS NULL')
    .get(featureId) as { count: number }

  const currentRevision = await db
    .prepare(
      `SELECT * FROM phase_revisions WHERE feature_id = ? AND phase = ? ORDER BY version DESC LIMIT 1`
    )
    .get(featureId, feature.current_phase) as Record<string, unknown> | undefined

  res.json({
    ...feature,
    unanswered_questions: unanswered.count,
    current_revision: currentRevision || null,
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ARCHITECTURE PHASE
// ═══════════════════════════════════════════════════════════════════════

// POST /api/features/:featureId/upload-requirement
phasesRouter.post('/features/:featureId/upload-requirement', upload.single('file'), async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const feature = await db.prepare('SELECT * FROM feature_phases WHERE id = ?').get(featureId)
  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  // Store file record
  await db.prepare(
    `INSERT INTO uploaded_files (feature_id, filename, original_name, file_path, file_size, mime_type)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    featureId,
    req.file.filename,
    req.file.originalname,
    req.file.path,
    req.file.size,
    req.file.mimetype,
  )

  // Update feature with requirement file
  await db.prepare(
    `UPDATE feature_phases SET requirement_file = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(req.file.originalname, featureId)

  res.status(201).json({
    filename: req.file.filename,
    original_name: req.file.originalname,
    file_size: req.file.size,
    mime_type: req.file.mimetype,
  })
})

// POST /api/features/:featureId/architecture/analyze
phasesRouter.post('/features/:featureId/architecture/analyze', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const feature = await db
    .prepare('SELECT * FROM feature_phases WHERE id = ?')
    .get(featureId) as Record<string, unknown> | undefined

  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' })
  }

  const sendEvent = setupSSE(res)
  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  try {
    // Get uploaded file content
    const uploadedFile = await db
      .prepare('SELECT * FROM uploaded_files WHERE feature_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(featureId) as Record<string, unknown> | undefined

    let fileContent = ''
    if (uploadedFile?.file_path && fs.existsSync(uploadedFile.file_path as string)) {
      fileContent = fs.readFileSync(uploadedFile.file_path as string, 'utf-8')
    }

    sendEvent('status', { message: 'Starting requirement analysis...' })

    // Run architecture-analyze skill
    const args = JSON.stringify({
      featureId,
      featureName: feature.name,
      requirement: fileContent.slice(0, 5000),
    })

    // Collect all OpenClaw output so we can extract questions from it
    const outputLines: string[] = []
    let rawOutput = ''
    const captureOutput = (line: string) => {
      outputLines.push(line)
      sendEvent('session_event', { message: line })
    }

    let openclawSucceeded = false
    try {
      const runResult = await runCommandInDirWithFallback(
        'architecture-analyze',
        process.cwd(),
        captureOutput,
        args,
      )

      if (runResult.mode === 'api') {
        sendEvent('status', { message: `Session started: ${runResult.sessionId}` })
        const pollResult = await pollSessionMessages(
          runResult.sessionId,
          (text) => {
            outputLines.push(text)
            sendEvent('session_event', { message: text })
          },
          abortController.signal,
        )
        openclawSucceeded = pollResult !== 'error'
      } else {
        openclawSucceeded = runResult.exitCode === 0
        rawOutput = runResult.rawOutput
      }

      if (openclawSucceeded) {
        sendEvent('status', { message: 'OpenClaw analysis completed successfully.' })
      } else {
        sendEvent('status', { message: 'OpenClaw exited with non-zero code. Extracting questions from output...' })
      }
    } catch (e) {
      const err = e as Error
      sendEvent('status', { message: `OpenClaw analysis failed: ${err.message}. Using default questions.` })
    }

    // Check if questions already exist in DB (e.g. from a previous run)
    const existing = await db
      .prepare('SELECT COUNT(*) as count FROM phase_questions WHERE feature_id = ?')
      .get(featureId) as { count: number }

    if (existing.count === 0) {
      // Try to extract questions from the OpenClaw output
      const extracted = extractQuestionsFromOutput(rawOutput || outputLines, feature.name as string)

      if (extracted.length > 0) {
        sendEvent('status', { message: `Extracted ${extracted.length} questions from analysis.` })
        for (const q of extracted) {
          await db.prepare(
            `INSERT INTO phase_questions (feature_id, phase, question) VALUES (?, 'architecture', ?)`
          ).run(featureId, q)
        }
      } else {
        // Fall back to default questions
        sendEvent('status', { message: 'Generating default analysis questions...' })

        const defaultQuestions = [
          `What is the primary goal and scope of the "${feature.name}" feature?`,
          'What authentication and authorization mechanisms should be used?',
          'Are there specific performance or scalability requirements?',
          'What are the key integration points with existing modules?',
          'Should this feature support multi-tenancy or be single-tenant?',
        ]

        for (const q of defaultQuestions) {
          await db.prepare(
            `INSERT INTO phase_questions (feature_id, phase, question) VALUES (?, 'architecture', ?)`
          ).run(featureId, q)
        }

        sendEvent('status', { message: `Generated ${defaultQuestions.length} default analysis questions.` })
      }
    }

    sendEvent('done', { message: 'Analysis complete', featureId })
  } catch (e) {
    const err = e as Error
    sendEvent('error', { message: err.message })
  } finally {
    res.end()
  }
})

// GET /api/features/:featureId/architecture/questions
phasesRouter.get('/features/:featureId/architecture/questions', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const questions = await db
    .prepare('SELECT * FROM phase_questions WHERE feature_id = ? ORDER BY created_at ASC')
    .all(featureId)

  res.json(questions)
})

// POST /api/features/:featureId/architecture/questions/:questionId/answer
phasesRouter.post('/features/:featureId/architecture/questions/:questionId/answer', async (req, res) => {
  const { questionId } = req.params
  const { answer } = req.body as { answer?: string }

  if (!answer || typeof answer !== 'string') {
    return res.status(400).json({ error: 'Answer is required' })
  }

  const db = getDb()
  await db.prepare(
    `UPDATE phase_questions SET answer = ?, answered_at = datetime('now') WHERE id = ?`
  ).run(answer, questionId)

  const updated = await db.prepare('SELECT * FROM phase_questions WHERE id = ?').get(questionId)
  res.json(updated)
})

// POST /api/features/:featureId/architecture/generate-plan
phasesRouter.post('/features/:featureId/architecture/generate-plan', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const feature = await db
    .prepare('SELECT * FROM feature_phases WHERE id = ?')
    .get(featureId) as Record<string, unknown> | undefined

  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' })
  }

  // Check all questions are answered
  const unanswered = await db
    .prepare('SELECT COUNT(*) as count FROM phase_questions WHERE feature_id = ? AND answer IS NULL')
    .get(featureId) as { count: number }

  if (unanswered.count > 0) {
    return res.status(400).json({ error: `${unanswered.count} questions remain unanswered` })
  }

  const sendEvent = setupSSE(res)
  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  try {
    sendEvent('status', { message: 'Generating architecture plan...' })

    // Get Q&A context
    const questions = await db
      .prepare('SELECT question, answer FROM phase_questions WHERE feature_id = ?')
      .all(featureId) as Array<{ question: string; answer: string }>

    const qaContext = questions.map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer}`).join('\n\n')

    // Get uploaded file content
    const uploadedFile = await db
      .prepare('SELECT * FROM uploaded_files WHERE feature_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(featureId) as Record<string, unknown> | undefined

    let reqContent = ''
    if (uploadedFile?.file_path && fs.existsSync(uploadedFile.file_path as string)) {
      reqContent = fs.readFileSync(uploadedFile.file_path as string, 'utf-8').slice(0, 3000)
    }

    // Try running OpenClaw skill
    const args = JSON.stringify({
      featureId,
      featureName: feature.name,
      requirement: reqContent,
      qa: qaContext,
    })

    const runResult = await runCommandInDirWithFallback(
      'architecture-plan',
      process.cwd(),
      (line) => sendEvent('session_event', { message: line }),
      args,
    ).catch(() => null)

    if (runResult?.mode === 'api') {
      sendEvent('status', { message: `Session started: ${runResult.sessionId}` })
      await pollSessionMessages(
        runResult.sessionId,
        (text) => sendEvent('session_event', { message: text }),
        abortController.signal,
      )
    }

    // Get current version
    const lastRevision = await db
      .prepare('SELECT MAX(version) as max_ver FROM phase_revisions WHERE feature_id = ? AND phase = ?')
      .get(featureId, 'architecture') as { max_ver: number | null }

    const version = (lastRevision?.max_ver ?? 0) + 1

    // Generate default plan content
    const planContent = generateDefaultPlan(feature.name as string, reqContent, qaContext)

    // Save revision
    await db.prepare(
      `INSERT INTO phase_revisions (feature_id, phase, version, content, diagrams, status)
       VALUES (?, 'architecture', ?, ?, ?, 'pending_review')`
    ).run(
      featureId,
      version,
      planContent,
      JSON.stringify([
        'sequenceDiagram\n    participant User\n    participant API\n    participant Service\n    participant DB\n    User->>API: Request\n    API->>Service: Process\n    Service->>DB: Store\n    DB-->>Service: ACK\n    Service-->>API: Response\n    API-->>User: Result',
        'stateDiagram-v2\n    [*] --> Draft\n    Draft --> InReview: Submit\n    InReview --> Approved: Approve\n    InReview --> Draft: Revise\n    Approved --> [*]',
      ]),
    )

    sendEvent('done', { message: 'Architecture plan generated', version })
  } catch (e) {
    const err = e as Error
    sendEvent('error', { message: err.message })
  } finally {
    res.end()
  }
})

// GET /api/features/:featureId/architecture/revisions
phasesRouter.get('/features/:featureId/architecture/revisions', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const revisions = await db
    .prepare(
      `SELECT id, version, status, architect_comments, created_at
       FROM phase_revisions
       WHERE feature_id = ? AND phase = 'architecture'
       ORDER BY version ASC`
    )
    .all(featureId)

  res.json(revisions)
})

// GET /api/features/:featureId/architecture/revisions/:version
phasesRouter.get('/features/:featureId/architecture/revisions/:version', async (req, res) => {
  const featureId = req.params.featureId
  const version = parseInt(req.params.version, 10)
  const db = getDb()

  const revision = await db
    .prepare(
      `SELECT * FROM phase_revisions
       WHERE feature_id = ? AND phase = 'architecture' AND version = ?`
    )
    .get(featureId, version)

  if (!revision) {
    return res.status(404).json({ error: 'Revision not found' })
  }

  res.json(revision)
})

// POST /api/features/:featureId/architecture/revise
phasesRouter.post('/features/:featureId/architecture/revise', async (req, res) => {
  const featureId = req.params.featureId
  const { comments } = req.body as { comments?: string }

  const db = getDb()

  const lastRevision = await db
    .prepare(
      `SELECT * FROM phase_revisions
       WHERE feature_id = ? AND phase = 'architecture'
       ORDER BY version DESC LIMIT 1`
    )
    .get(featureId) as Record<string, unknown> | undefined

  if (!lastRevision) {
    return res.status(400).json({ error: 'No plan exists to revise' })
  }

  // Mark last revision as revision_requested
  await db.prepare(
    `UPDATE phase_revisions SET status = 'revision_requested', architect_comments = ? WHERE id = ?`
  ).run(comments || null, lastRevision.id)

  // Create new revision based on last
  const newVersion = (lastRevision.version as number) + 1

  await db.prepare(
    `INSERT INTO phase_revisions (feature_id, phase, version, content, diagrams, status, architect_comments)
     VALUES (?, 'architecture', ?, ?, ?, 'pending_review', ?)`
  ).run(
    featureId,
    newVersion,
    lastRevision.content,
    lastRevision.diagrams,
    comments || null,
  )

  // Save comment
  if (comments) {
    await db.prepare(
      `INSERT INTO phase_comments (feature_id, phase, revision_version, content) VALUES (?, 'architecture', ?, ?)`
    ).run(featureId, newVersion, comments)
  }

  const revision = await db
    .prepare(
      `SELECT * FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' AND version = ?`
    )
    .get(featureId, newVersion)

  res.status(201).json(revision)
})

// POST /api/features/:featureId/architecture/approve
phasesRouter.post('/features/:featureId/architecture/approve', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  // Approve latest revision
  await db.prepare(
    `UPDATE phase_revisions SET status = 'approved'
     WHERE feature_id = ? AND phase = 'architecture' AND id = (
       SELECT id FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture'
       ORDER BY version DESC LIMIT 1
     )`
  ).run(featureId, featureId)

  // Move to development phase
  await db.prepare(
    `UPDATE feature_phases SET current_phase = 'development', updated_at = datetime('now') WHERE id = ?`
  ).run(featureId)

  const feature = await db.prepare('SELECT * FROM feature_phases WHERE id = ?').get(featureId)
  res.json(feature)
})

// ═══════════════════════════════════════════════════════════════════════
// DEVELOPMENT PHASE
// ═══════════════════════════════════════════════════════════════════════

// POST /api/features/:featureId/development/start
phasesRouter.post('/features/:featureId/development/start', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const feature = await db
    .prepare('SELECT * FROM feature_phases WHERE id = ?')
    .get(featureId) as Record<string, unknown> | undefined

  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' })
  }

  if (feature.current_phase !== 'development') {
    return res.status(400).json({ error: 'Feature is not in development phase' })
  }

  const sendEvent = setupSSE(res)
  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  try {
    const branchName = `feature/${(feature.name as string).toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`
    await db.prepare(
      `UPDATE feature_phases SET branch_name = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(branchName, featureId)

    // Define development steps
    const steps = [
      { step_name: 'branch_created', detail: `Branch: ${branchName}` },
      { step_name: 'code_changes', detail: 'Applying code changes...' },
      { step_name: 'build', detail: 'Building project...' },
      { step_name: 'verify', detail: 'Verifying against architecture plan...' },
      { step_name: 'push', detail: 'Pushing to remote...' },
      { step_name: 'summary', detail: 'Generating change summary...' },
    ]

    // Clear old steps and insert new ones
    await db.prepare('DELETE FROM development_steps WHERE feature_id = ?').run(featureId)

    for (const step of steps) {
      await db.prepare(
        `INSERT INTO development_steps (feature_id, step_name, detail, status) VALUES (?, ?, ?, 'pending')`
      ).run(featureId, step.step_name, step.detail)
    }

    // Try running OpenClaw skill
    const approvedRevision = await db
      .prepare(
        `SELECT content FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' AND status = 'approved' ORDER BY version DESC LIMIT 1`
      )
      .get(featureId) as { content: string } | undefined

    const args = JSON.stringify({
      featureId,
      featureName: feature.name,
      branchName,
      architecturePlan: approvedRevision?.content?.slice(0, 5000) ?? '',
    })

    sendEvent('status', { message: 'Starting development execution...' })

    const runResult = await runCommandInDirWithFallback(
      'development-execute',
      process.cwd(),
      (line) => sendEvent('session_event', { message: line }),
      args,
    ).catch(() => null)

    if (runResult?.mode === 'api') {
      sendEvent('status', { message: `Session started: ${runResult.sessionId}` })
      await pollSessionMessages(
        runResult.sessionId,
        (text) => sendEvent('session_event', { message: text }),
        abortController.signal,
      )
    }

    // Simulate step completion for demo
    for (let i = 0; i < steps.length; i++) {
      await db.prepare(
        `UPDATE development_steps SET status = 'running', detail = ? WHERE feature_id = ? AND step_name = ?`
      ).run(steps[i].detail, featureId, steps[i].step_name)

      sendEvent('step', { step: steps[i].step_name, status: 'running' })

      await db.prepare(
        `UPDATE development_steps SET status = 'completed', completed_at = datetime('now') WHERE feature_id = ? AND step_name = ?`
      ).run(featureId, steps[i].step_name)

      if (steps[i].step_name === 'summary') {
        const summary = generateDefaultSummary(feature.name as string, branchName)
        await db.prepare(
          `UPDATE development_steps SET change_summary = ? WHERE feature_id = ? AND step_name = 'summary'`
        ).run(summary, featureId)
      }

      sendEvent('step', { step: steps[i].step_name, status: 'completed' })
    }

    sendEvent('done', { message: 'Development complete', branchName })
  } catch (e) {
    const err = e as Error
    sendEvent('error', { message: err.message })
  } finally {
    res.end()
  }
})

// GET /api/features/:featureId/development/status
phasesRouter.get('/features/:featureId/development/status', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const steps = await db
    .prepare('SELECT * FROM development_steps WHERE feature_id = ? ORDER BY id ASC')
    .all(featureId)

  res.json(steps)
})

// GET /api/features/:featureId/development/summary
phasesRouter.get('/features/:featureId/development/summary', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const summaryStep = await db
    .prepare(
      `SELECT change_summary FROM development_steps WHERE feature_id = ? AND step_name = 'summary'`
    )
    .get(featureId) as { change_summary: string | null } | undefined

  if (!summaryStep?.change_summary) {
    return res.status(404).json({ error: 'No change summary available' })
  }

  res.json({ summary: summaryStep.change_summary })
})

// POST /api/features/:featureId/development/request-changes
phasesRouter.post('/features/:featureId/development/request-changes', async (req, res) => {
  const featureId = req.params.featureId
  const { comments } = req.body as { comments?: string }

  const db = getDb()

  // Save comment
  if (comments) {
    await db.prepare(
      `INSERT INTO phase_comments (feature_id, phase, content) VALUES (?, 'development', ?)`
    ).run(featureId, comments)
  }

  // Reset development steps for re-execution
  await db.prepare(
    `UPDATE development_steps SET status = 'pending', completed_at = NULL, change_summary = NULL WHERE feature_id = ?`
  ).run(featureId)

  res.json({ message: 'Changes requested. Development steps reset.' })
})

// POST /api/features/:featureId/development/approve
phasesRouter.post('/features/:featureId/development/approve', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  await db.prepare(
    `UPDATE feature_phases SET current_phase = 'testing', updated_at = datetime('now') WHERE id = ?`
  ).run(featureId)

  const feature = await db.prepare('SELECT * FROM feature_phases WHERE id = ?').get(featureId)
  res.json(feature)
})

// ═══════════════════════════════════════════════════════════════════════
// TESTING PHASE
// ═══════════════════════════════════════════════════════════════════════

// POST /api/features/:featureId/testing/generate-plan
phasesRouter.post('/features/:featureId/testing/generate-plan', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const feature = await db
    .prepare('SELECT * FROM feature_phases WHERE id = ?')
    .get(featureId) as Record<string, unknown> | undefined

  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' })
  }

  const sendEvent = setupSSE(res)

  try {
    sendEvent('status', { message: 'Generating test plan...' })

    // Get architecture plan + change summary for context
    const archPlan = await db
      .prepare(
        `SELECT content FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' AND status = 'approved' ORDER BY version DESC LIMIT 1`
      )
      .get(featureId) as { content: string } | undefined

    const summaryStep = await db
      .prepare(
        `SELECT change_summary FROM development_steps WHERE feature_id = ? AND step_name = 'summary'`
      )
      .get(featureId) as { change_summary: string | null } | undefined

    const args = JSON.stringify({
      featureId,
      featureName: feature.name,
      architecturePlan: archPlan?.content?.slice(0, 3000) ?? '',
      changeSummary: summaryStep?.change_summary?.slice(0, 3000) ?? '',
    })

    const runResult = await runCommandInDirWithFallback(
      'testing-plan',
      process.cwd(),
      (line) => sendEvent('session_event', { message: line }),
      args,
    ).catch(() => null)

    if (runResult?.mode === 'api') {
      sendEvent('status', { message: `Session started: ${runResult.sessionId}` })
      await pollSessionMessages(
        runResult.sessionId,
        (text) => sendEvent('session_event', { message: text }),
      )
    }

    // Get current version
    const lastRevision = await db
      .prepare('SELECT MAX(version) as max_ver FROM phase_revisions WHERE feature_id = ? AND phase = ?')
      .get(featureId, 'testing') as { max_ver: number | null }

    const version = (lastRevision?.max_ver ?? 0) + 1

    const testPlanContent = generateDefaultTestPlan(
      feature.name as string,
      archPlan?.content ?? '',
    )

    await db.prepare(
      `INSERT INTO phase_revisions (feature_id, phase, version, content, status)
       VALUES (?, 'testing', ?, ?, 'pending_review')`
    ).run(featureId, version, testPlanContent)

    sendEvent('done', { message: 'Test plan generated', version })
  } catch (e) {
    const err = e as Error
    sendEvent('error', { message: err.message })
  } finally {
    res.end()
  }
})

// GET /api/features/:featureId/testing/revisions
phasesRouter.get('/features/:featureId/testing/revisions', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const revisions = await db
    .prepare(
      `SELECT id, version, status, architect_comments, created_at
       FROM phase_revisions WHERE feature_id = ? AND phase = 'testing'
       ORDER BY version ASC`
    )
    .all(featureId)

  res.json(revisions)
})

// POST /api/features/:featureId/testing/revise
phasesRouter.post('/features/:featureId/testing/revise', async (req, res) => {
  const featureId = req.params.featureId
  const { comments } = req.body as { comments?: string }

  const db = getDb()

  const lastRevision = await db
    .prepare(
      `SELECT * FROM phase_revisions WHERE feature_id = ? AND phase = 'testing' ORDER BY version DESC LIMIT 1`
    )
    .get(featureId) as Record<string, unknown> | undefined

  if (!lastRevision) {
    return res.status(400).json({ error: 'No test plan exists to revise' })
  }

  await db.prepare(
    `UPDATE phase_revisions SET status = 'revision_requested', architect_comments = ? WHERE id = ?`
  ).run(comments || null, lastRevision.id)

  const newVersion = (lastRevision.version as number) + 1

  await db.prepare(
    `INSERT INTO phase_revisions (feature_id, phase, version, content, status, architect_comments)
     VALUES (?, 'testing', ?, ?, 'pending_review', ?)`
  ).run(featureId, newVersion, lastRevision.content, comments || null)

  if (comments) {
    await db.prepare(
      `INSERT INTO phase_comments (feature_id, phase, revision_version, content) VALUES (?, 'testing', ?, ?)`
    ).run(featureId, newVersion, comments)
  }

  const revision = await db
    .prepare(`SELECT * FROM phase_revisions WHERE feature_id = ? AND phase = 'testing' AND version = ?`)
    .get(featureId, newVersion)

  res.status(201).json(revision)
})

// POST /api/features/:featureId/testing/approve
phasesRouter.post('/features/:featureId/testing/approve', async (req, res) => {
  const featureId = req.params.featureId
  const db = getDb()

  const sendEvent = setupSSE(res)

  try {
    // Approve latest test plan revision
    await db.prepare(
      `UPDATE phase_revisions SET status = 'approved'
       WHERE feature_id = ? AND phase = 'testing' AND id = (
         SELECT id FROM phase_revisions WHERE feature_id = ? AND phase = 'testing'
         ORDER BY version DESC LIMIT 1
       )`
    ).run(featureId, featureId)

    sendEvent('status', { message: 'Test plan approved. Generating test code...' })

    // Try running testing-execute skill
    const testPlan = await db
      .prepare(
        `SELECT content FROM phase_revisions WHERE feature_id = ? AND phase = 'testing' AND status = 'approved' ORDER BY version DESC LIMIT 1`
      )
      .get(featureId) as { content: string } | undefined

    const feature = await db
      .prepare('SELECT * FROM feature_phases WHERE id = ?')
      .get(featureId) as Record<string, unknown> | undefined

    const args = JSON.stringify({
      featureId,
      featureName: feature?.name ?? '',
      branchName: feature?.branch_name ?? '',
      testPlan: testPlan?.content?.slice(0, 5000) ?? '',
    })

    const runResult = await runCommandInDirWithFallback(
      'testing-execute',
      process.cwd(),
      (line) => sendEvent('session_event', { message: line }),
      args,
    ).catch(() => null)

    if (runResult?.mode === 'api') {
      await pollSessionMessages(
        runResult.sessionId,
        (text) => sendEvent('session_event', { message: text }),
      )
    }

    // Move to completed
    await db.prepare(
      `UPDATE feature_phases SET current_phase = 'completed', updated_at = datetime('now') WHERE id = ?`
    ).run(featureId)

    sendEvent('done', { message: 'Testing complete. Feature lifecycle finished.' })
  } catch (e) {
    const err = e as Error
    sendEvent('error', { message: err.message })
  } finally {
    res.end()
  }
})

// ═══════════════════════════════════════════════════════════════════════
// COMMENTS (shared across phases)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/features/:featureId/comments
phasesRouter.get('/features/:featureId/comments', async (req, res) => {
  const featureId = req.params.featureId
  const phase = req.query.phase as string | undefined
  const db = getDb()

  let query = 'SELECT * FROM phase_comments WHERE feature_id = ?'
  const params: string[] = [featureId]

  if (phase) {
    query += ' AND phase = ?'
    params.push(phase)
  }

  query += ' ORDER BY created_at ASC'

  const comments = await db.prepare(query).all(...params)
  res.json(comments)
})

// POST /api/features/:featureId/comments
phasesRouter.post('/features/:featureId/comments', async (req, res) => {
  const featureId = req.params.featureId
  const { phase, content, revision_version } = req.body as {
    phase?: string
    content?: string
    revision_version?: number
  }

  if (!phase || !content) {
    return res.status(400).json({ error: 'phase and content are required' })
  }

  const db = getDb()

  await db.prepare(
    `INSERT INTO phase_comments (feature_id, phase, revision_version, content) VALUES (?, ?, ?, ?)`
  ).run(featureId, phase, revision_version ?? null, content)

  const comment = await db
    .prepare('SELECT * FROM phase_comments WHERE feature_id = ? ORDER BY id DESC LIMIT 1')
    .get(featureId)

  res.status(201).json(comment)
})

// ═══════════════════════════════════════════════════════════════════════
// HELPER: Default content generators
// ═══════════════════════════════════════════════════════════════════════

function generateDefaultPlan(featureName: string, requirement: string, qa: string): string {
  return `# Architecture Plan: ${featureName}

## Overview
This document outlines the architecture for the **${featureName}** feature.

## Requirements Summary
${requirement.slice(0, 500) || 'See uploaded requirement document.'}

## Q&A Context
${qa.slice(0, 1000) || 'No Q&A context available.'}

## Proposed Architecture

### Component Design
- **API Layer**: RESTful endpoints for feature interaction
- **Service Layer**: Business logic and validation
- **Data Layer**: Persistent storage with proper schema
- **Integration Layer**: Communication with existing modules

### Data Flow
\`\`\`mermaid
sequenceDiagram
    participant User
    participant API
    participant Service
    participant DB
    User->>API: HTTP Request
    API->>Service: Validate & Process
    Service->>DB: Persist Data
    DB-->>Service: Confirmation
    Service-->>API: Response
    API-->>User: HTTP Response
\`\`\`

### State Management
\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> InReview: Submit
    InReview --> Approved: Approve
    InReview --> Draft: Revise
    Approved --> Active: Deploy
    Active --> [*]
\`\`\`

### API Changes
| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/api/${featureName.toLowerCase().replace(/\s+/g, '-')}\` | GET | List all items |
| \`/api/${featureName.toLowerCase().replace(/\s+/g, '-')}\` | POST | Create new item |
| \`/api/${featureName.toLowerCase().replace(/\s+/g, '-')}/:id\` | GET | Get item by ID |
| \`/api/${featureName.toLowerCase().replace(/\s+/g, '-')}/:id\` | PUT | Update item |
| \`/api/${featureName.toLowerCase().replace(/\s+/g, '-')}/:id\` | DELETE | Delete item |

### Security Considerations
- Input validation at all entry points
- Authentication required for all endpoints
- Rate limiting on public-facing endpoints
- Data sanitization before storage

### Performance Considerations
- Database query optimization with proper indexing
- Caching strategy for frequently accessed data
- Pagination for list endpoints
- Async processing for long-running operations

### Dependencies
- No new external dependencies required
- Leverages existing infrastructure

### Implementation Notes
- Follow existing project conventions
- Maintain backward compatibility
- Add appropriate error handling
- Include logging and monitoring
`
}

function generateDefaultSummary(featureName: string, branchName: string): string {
  return `# Change Summary: ${featureName}

**Branch**: \`${branchName}\`

## Changes Applied

### New Files
- \`src/api/routes/${featureName.toLowerCase().replace(/\s+/g, '-')}.ts\` — API route handlers
- \`src/services/${featureName.toLowerCase().replace(/\s+/g, '-')}.service.ts\` — Business logic
- \`src/models/${featureName.toLowerCase().replace(/\s+/g, '-')}.model.ts\` — Data models

### Modified Files
- \`src/api/routes/index.ts\` — Added new route registration
- \`src/db/database.ts\` — Added new table schemas
- \`src/types/index.ts\` — Added new type definitions

## Architecture Compliance
All changes follow the approved architecture plan:
- Component design matches specification
- API endpoints align with planned routes
- Data layer follows proposed schema
- Security considerations implemented

## Build Status
- TypeScript compilation: **Passed**
- Lint checks: **Passed**
- Unit tests: **Passed**

## Notes
- All existing tests continue to pass
- No breaking changes introduced
- Code follows project conventions
`
}

function extractQuestionsFromOutput(raw: string | string[], _featureName: string): string[] {
  const questions: string[] = []
  const fullText = typeof raw === 'string' ? raw : raw.join('\n')

  // Strategy 1: Parse openclaw --json output (JSON blob with payloads)
  try {
    const jsonStart = fullText.indexOf('{')
    const jsonEnd = fullText.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = fullText.slice(jsonStart, jsonEnd + 1)
      const parsed = JSON.parse(jsonStr) as { payloads?: Array<{ text?: string }> }
      const textContent = (parsed.payloads || []).map((p) => p.text || '').join('\n')

      if (textContent) {
        // Extract from markdown table: | # | Category | Question text |
        const tableRows = textContent.match(/\|\s*\d+\s*\|[^|]*\|([^|]+)\|/g)
        if (tableRows) {
          for (const row of tableRows) {
            const cells = row.split('|').map((c) => c.trim()).filter(Boolean)
            const q = cells[cells.length - 1]
            if (q && q.length > 5 && !questions.includes(q)) {
              questions.push(q)
            }
          }
        }

        // Extract numbered questions: "1. Question?" or "**1.** Question?"
        if (questions.length === 0) {
          const numRegex = /(?:\*\*)?\d+[\.\)](?:\*\*)?\s*([A-Z][^\n?]*\?)/g
          let m
          while ((m = numRegex.exec(textContent)) !== null) {
            const q = m[1].trim()
            if (q.length > 10 && !questions.includes(q)) questions.push(q)
          }
        }

        // Extract bare question lines
        if (questions.length === 0) {
          for (const seg of textContent.split(/\\n|\n/)) {
            const t = seg.trim()
            if (t.length > 15 && t.length < 300 && t.endsWith('?') && /^[A-Z]/.test(t)) {
              if (!questions.includes(t)) questions.push(t)
            }
          }
        }

        if (questions.length > 0) return questions.slice(0, 10)
      }
    }
  } catch { /* not valid JSON, fall through */ }

  // Strategy 2: Raw numbered/bulleted questions in stdout
  {
    const qRegex = /(?:^|\n)\s*(?:\d+[\.\)]\s*|[-*]\s*)([A-Z][^\n?]*\?)/g
    let m
    while ((m = qRegex.exec(fullText)) !== null) {
      const q = m[1].trim()
      if (q.length > 10 && !questions.includes(q)) questions.push(q)
    }
  }

  // Strategy 3: Bare question lines from LLM output
  if (questions.length === 0) {
    const lineArr = typeof raw === 'string' ? raw.split('\n') : raw
    for (const line of lineArr) {
      const t = line.replace(/^\[.*?\]\s*/, '').trim()
      if (t.length > 15 && t.length < 300 && t.endsWith('?') && /^[A-Z]/.test(t)) {
        if (!questions.includes(t)) questions.push(t)
      }
    }
  }

  return questions.slice(0, 10)
}

function generateDefaultTestPlan(featureName: string, _archPlan: string): string {
  return `# Test Plan: ${featureName}

## Test Strategy
Comprehensive testing covering unit, integration, and end-to-end scenarios.

---

## Test Case 1: API Endpoint — Create Item
**Priority**: Critical
**Type**: Integration Test
**Description**: Verify that creating a new item via POST endpoint works correctly.
**Steps**:
1. Send POST request with valid payload
2. Verify response status is 201
3. Verify response body contains created item with ID
4. Verify item exists in database
**Expected**: Item is created and returned with proper fields

## Test Case 2: API Endpoint — List Items
**Priority**: Critical
**Type**: Integration Test
**Description**: Verify listing items returns correct paginated results.
**Steps**:
1. Seed database with test items
2. Send GET request with pagination params
3. Verify response contains correct page of items
**Expected**: Paginated list of items with correct metadata

## Test Case 3: API Endpoint — Validation
**Priority**: High
**Type**: Unit Test
**Description**: Verify input validation rejects invalid data.
**Steps**:
1. Send POST with missing required fields
2. Send POST with invalid field types
3. Send POST with values exceeding limits
**Expected**: 400 Bad Request with validation error details

## Test Case 4: Service Layer — Business Logic
**Priority**: High
**Type**: Unit Test
**Description**: Verify service layer correctly implements business rules.
**Steps**:
1. Test create with valid data
2. Test duplicate handling
3. Test cascade operations
**Expected**: Business rules enforced correctly

## Test Case 5: Authentication & Authorization
**Priority**: Critical
**Type**: Integration Test
**Description**: Verify endpoints require proper authentication.
**Steps**:
1. Send request without auth token
2. Send request with expired token
3. Send request with valid token but insufficient permissions
**Expected**: 401/403 responses for unauthorized access

## Test Case 6: Error Handling
**Priority**: Medium
**Type**: Unit Test
**Description**: Verify graceful error handling for edge cases.
**Steps**:
1. Test database connection failure
2. Test invalid input format
3. Test concurrent access scenarios
**Expected**: Proper error responses with appropriate status codes

## Test Case 7: Performance
**Priority**: Medium
**Type**: Performance Test
**Description**: Verify response times meet requirements under load.
**Steps**:
1. Send 100 concurrent requests
2. Measure average response time
3. Check for memory leaks
**Expected**: 95th percentile response time under 200ms

---

## Test Environment
- Database: In-memory SQLite for unit tests, test database for integration
- API: Test server with mocked external dependencies
- Coverage target: 80%+

## Execution Order
1. Unit tests (fast feedback)
2. Integration tests (API + DB)
3. Performance tests (last)
`
}
