import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'
import multer from 'multer'
import { getDb } from '../db/database.js'
import { runCommandInDirWithFallback, pollSessionMessages } from '../lib/openclaw-client.js'

export const phasesRouter = express.Router()

const STORE_DIR = path.join(os.homedir(), '.codereview-store')

function featureStorePath(projectId: string, featureId: string) {
  return path.join(STORE_DIR, 'features', projectId.replace(/\//g, '_'), featureId)
}

// Multer storage config - store to disk
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const { projectId, featureId } = req.params
    const dir = path.join(featureStorePath(projectId, featureId), 'requirements')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `req_${Date.now()}${ext}`)
  },
})

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
]

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const allowed = ['.pdf', '.docx', '.md', '.txt']
    if (!allowed.includes(ext) && !ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Only PDF, DOCX, MD, and TXT files are allowed'))
    }
    cb(null, true)
  },
})

// SSE helper
function sseHeaders(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

function sseSend(res: express.Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

// ─── Feature CRUD ────────────────────────────────────────────────────────────

// GET /api/projects/:projectId/features
phasesRouter.get('/projects/:projectId/features', async (req, res) => {
  try {
    const db = getDb()
    const features = await db.all(
      'SELECT * FROM feature_phases WHERE project_id = ? ORDER BY created_at DESC',
      req.params.projectId
    )
    res.json(features)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features
phasesRouter.post('/projects/:projectId/features', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const db = getDb()
    const id = crypto.randomUUID()
    await db.run(
      `INSERT INTO feature_phases (id, project_id, name) VALUES (?, ?, ?)`,
      id, req.params.projectId, name.trim()
    )
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ?', id)
    res.status(201).json(feature)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/projects/:projectId/features/:featureId
phasesRouter.get('/projects/:projectId/features/:featureId', async (req, res) => {
  try {
    const db = getDb()
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ? AND project_id = ?', req.params.featureId, req.params.projectId)
    if (!feature) return res.status(404).json({ error: 'Feature not found' })
    res.json(feature)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── Architecture Phase ───────────────────────────────────────────────────────

// POST /api/projects/:projectId/features/:featureId/upload-requirement
phasesRouter.post(
  '/projects/:projectId/features/:featureId/upload-requirement',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
      const db = getDb()
      const feature = await db.get('SELECT * FROM feature_phases WHERE id = ? AND project_id = ?', req.params.featureId, req.params.projectId)
      if (!feature) return res.status(404).json({ error: 'Feature not found' })

      await db.run(
        `INSERT INTO uploaded_files (feature_id, filename, original_name, file_path, file_size, mime_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        req.params.featureId,
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype
      )
      await db.run(
        `UPDATE feature_phases SET requirement_file = ?, updated_at = datetime('now') WHERE id = ?`,
        req.file.filename,
        req.params.featureId
      )
      res.json({ filename: req.file.filename, original_name: req.file.originalname, file_size: req.file.size })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  }
)

// GET /api/projects/:projectId/features/:featureId/uploaded-files
phasesRouter.get('/projects/:projectId/features/:featureId/uploaded-files', async (req, res) => {
  try {
    const db = getDb()
    const files = await db.all(
      'SELECT * FROM uploaded_files WHERE feature_id = ? ORDER BY created_at DESC',
      req.params.featureId
    )
    res.json(files)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/architecture/analyze  (SSE)
phasesRouter.post('/projects/:projectId/features/:featureId/architecture/analyze', async (req, res) => {
  sseHeaders(res)
  try {
    const db = getDb()
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ?', req.params.featureId)
    if (!feature) { sseSend(res, { type: 'error', message: 'Feature not found' }); return res.end() }

    const reqDir = path.join(featureStorePath(req.params.projectId, req.params.featureId), 'requirements')
    const files = fs.existsSync(reqDir) ? fs.readdirSync(reqDir) : []
    if (files.length === 0) { sseSend(res, { type: 'error', message: 'No requirement file uploaded' }); return res.end() }

    sseSend(res, { type: 'status', message: 'Analyzing requirements with OpenClaw...' })

    // Read requirement content for context
    const reqFile = path.join(reqDir, files[0])
    let reqContent = ''
    try {
      reqContent = fs.readFileSync(reqFile, 'utf-8').slice(0, 8000) // cap at 8KB
    } catch { reqContent = '[binary file - PDF/DOCX]' }

    // Write context file for OpenClaw skill
    const workDir = featureStorePath(req.params.projectId, req.params.featureId)
    fs.mkdirSync(workDir, { recursive: true })
    fs.writeFileSync(path.join(workDir, 'requirement_content.txt'), reqContent)
    fs.writeFileSync(path.join(workDir, 'feature_context.json'), JSON.stringify({
      feature_id: feature.id,
      feature_name: feature.name,
      project_id: req.params.projectId,
    }))

    const result = await runCommandInDirWithFallback(
      'architecture-analyze',
      workDir,
      (line) => sseSend(res, { type: 'session_event', message: line }),
    )

    if (result.mode === 'api') {
      const status = await pollSessionMessages(result.sessionId, (msg) => sseSend(res, { type: 'session_event', message: msg }))
      if (status === 'error') { sseSend(res, { type: 'error', message: 'Analysis failed' }); return res.end() }
    }

    // Read generated questions
    const questionsFile = path.join(workDir, 'architecture_questions.json')
    let questions: Array<{ question: string }> = []
    if (fs.existsSync(questionsFile)) {
      try { questions = JSON.parse(fs.readFileSync(questionsFile, 'utf-8')) } catch { }
    }

    // Store questions in DB
    for (const q of questions) {
      await db.run(
        `INSERT INTO phase_questions (feature_id, phase, question) VALUES (?, 'architecture', ?)`,
        req.params.featureId, q.question
      )
    }

    sseSend(res, { type: 'done', questions_count: questions.length })
    res.end()
  } catch (err) {
    sseSend(res, { type: 'error', message: (err as Error).message })
    res.end()
  }
})

// GET /api/projects/:projectId/features/:featureId/architecture/questions
phasesRouter.get('/projects/:projectId/features/:featureId/architecture/questions', async (req, res) => {
  try {
    const db = getDb()
    const questions = await db.all(
      `SELECT * FROM phase_questions WHERE feature_id = ? AND phase = 'architecture' ORDER BY id ASC`,
      req.params.featureId
    )
    res.json(questions)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/architecture/questions/:questionId/answer
phasesRouter.post('/projects/:projectId/features/:featureId/architecture/questions/:questionId/answer', async (req, res) => {
  try {
    const { answer } = req.body
    if (!answer?.trim()) return res.status(400).json({ error: 'answer is required' })
    const db = getDb()
    await db.run(
      `UPDATE phase_questions SET answer = ?, answered_at = datetime('now') WHERE id = ? AND feature_id = ?`,
      answer.trim(), req.params.questionId, req.params.featureId
    )
    const question = await db.get('SELECT * FROM phase_questions WHERE id = ?', req.params.questionId)
    res.json(question)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/architecture/generate-plan  (SSE)
phasesRouter.post('/projects/:projectId/features/:featureId/architecture/generate-plan', async (req, res) => {
  sseHeaders(res)
  try {
    const db = getDb()
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ?', req.params.featureId)
    if (!feature) { sseSend(res, { type: 'error', message: 'Feature not found' }); return res.end() }

    // Check all questions answered
    const unanswered = await db.all(
      `SELECT id FROM phase_questions WHERE feature_id = ? AND phase = 'architecture' AND answer IS NULL`,
      req.params.featureId
    )
    if (unanswered.length > 0) {
      sseSend(res, { type: 'error', message: `${unanswered.length} questions still need answers` })
      return res.end()
    }

    sseSend(res, { type: 'status', message: 'Generating architecture plan...' })

    // Write Q&A context for OpenClaw
    const workDir = featureStorePath(req.params.projectId, req.params.featureId)
    const questions = await db.all(
      `SELECT question, answer FROM phase_questions WHERE feature_id = ? AND phase = 'architecture'`,
      req.params.featureId
    )
    fs.writeFileSync(path.join(workDir, 'qa_answers.json'), JSON.stringify(questions, null, 2))

    const result = await runCommandInDirWithFallback(
      'architecture-plan',
      workDir,
      (line) => sseSend(res, { type: 'session_event', message: line }),
    )

    if (result.mode === 'api') {
      const status = await pollSessionMessages(result.sessionId, (msg) => sseSend(res, { type: 'session_event', message: msg }))
      if (status === 'error') { sseSend(res, { type: 'error', message: 'Plan generation failed' }); return res.end() }
    }

    // Read generated plan
    const planFile = path.join(workDir, 'architecture_plan.md')
    const diagramsFile = path.join(workDir, 'architecture_diagrams.json')
    let content = '# Architecture Plan\n\n*Generated plan will appear here.*'
    let diagrams = null
    if (fs.existsSync(planFile)) { content = fs.readFileSync(planFile, 'utf-8') }
    if (fs.existsSync(diagramsFile)) {
      try { diagrams = JSON.parse(fs.readFileSync(diagramsFile, 'utf-8')) } catch { }
    }

    // Get next version
    const lastRev = await db.get(
      `SELECT MAX(version) as v FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture'`,
      req.params.featureId
    )
    const version = (lastRev?.v ?? 0) + 1

    await db.run(
      `INSERT INTO phase_revisions (feature_id, phase, version, content, diagrams, status)
       VALUES (?, 'architecture', ?, ?, ?, 'pending_review')`,
      req.params.featureId, version, content, diagrams ? JSON.stringify(diagrams) : null
    )

    sseSend(res, { type: 'done', version })
    res.end()
  } catch (err) {
    sseSend(res, { type: 'error', message: (err as Error).message })
    res.end()
  }
})

// GET /api/projects/:projectId/features/:featureId/architecture/revisions
phasesRouter.get('/projects/:projectId/features/:featureId/architecture/revisions', async (req, res) => {
  try {
    const db = getDb()
    const revisions = await db.all(
      `SELECT id, version, status, architect_comments, created_at FROM phase_revisions
       WHERE feature_id = ? AND phase = 'architecture' ORDER BY version ASC`,
      req.params.featureId
    )
    res.json(revisions)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/projects/:projectId/features/:featureId/architecture/revisions/:version
phasesRouter.get('/projects/:projectId/features/:featureId/architecture/revisions/:version', async (req, res) => {
  try {
    const db = getDb()
    const revision = await db.get(
      `SELECT * FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' AND version = ?`,
      req.params.featureId, parseInt(req.params.version)
    )
    if (!revision) return res.status(404).json({ error: 'Revision not found' })
    if (revision.diagrams) { try { revision.diagrams = JSON.parse(revision.diagrams) } catch { } }
    res.json(revision)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/architecture/revise
phasesRouter.post('/projects/:projectId/features/:featureId/architecture/revise', async (req, res) => {
  try {
    const { comments } = req.body
    const db = getDb()
    // Mark latest as revision_requested
    const latest = await db.get(
      `SELECT id FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' ORDER BY version DESC LIMIT 1`,
      req.params.featureId
    )
    if (latest) {
      await db.run(
        `UPDATE phase_revisions SET status = 'revision_requested', architect_comments = ? WHERE id = ?`,
        comments ?? null, latest.id
      )
    }
    if (comments) {
      await db.run(
        `INSERT INTO phase_comments (feature_id, phase, content) VALUES (?, 'architecture', ?)`,
        req.params.featureId, comments
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/architecture/approve
phasesRouter.post('/projects/:projectId/features/:featureId/architecture/approve', async (req, res) => {
  try {
    const db = getDb()
    const latest = await db.get(
      `SELECT id FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' ORDER BY version DESC LIMIT 1`,
      req.params.featureId
    )
    if (!latest) return res.status(400).json({ error: 'No architecture plan to approve' })

    await db.run(`UPDATE phase_revisions SET status = 'approved' WHERE id = ?`, latest.id)
    await db.run(
      `UPDATE feature_phases SET current_phase = 'development', arch_approved = 1, updated_at = datetime('now') WHERE id = ?`,
      req.params.featureId
    )
    res.json({ success: true, next_phase: 'development' })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── Development Phase ────────────────────────────────────────────────────────

// POST /api/projects/:projectId/features/:featureId/development/start  (SSE)
phasesRouter.post('/projects/:projectId/features/:featureId/development/start', async (req, res) => {
  sseHeaders(res)
  try {
    const db = getDb()
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ?', req.params.featureId)
    if (!feature) { sseSend(res, { type: 'error', message: 'Feature not found' }); return res.end() }
    if (!feature.arch_approved) { sseSend(res, { type: 'error', message: 'Architecture must be approved first' }); return res.end() }

    const branchName = `feature/${feature.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${feature.id.slice(0, 8)}`
    await db.run(
      `UPDATE feature_phases SET branch_name = ?, updated_at = datetime('now') WHERE id = ?`,
      branchName, feature.id
    )

    const steps = ['branch_created', 'code_changes', 'build_check', 'arch_verify', 'push', 'summary']
    // Clear old steps
    await db.run('DELETE FROM development_steps WHERE feature_id = ?', feature.id)
    for (const step of steps) {
      await db.run(
        `INSERT INTO development_steps (feature_id, step_name, status) VALUES (?, ?, 'pending')`,
        feature.id, step
      )
    }

    const workDir = featureStorePath(req.params.projectId, feature.id)
    // Write branch info for skill
    const archRevision = await db.get(
      `SELECT content FROM phase_revisions WHERE feature_id = ? AND phase = 'architecture' AND status = 'approved' ORDER BY version DESC LIMIT 1`,
      feature.id
    )
    fs.writeFileSync(path.join(workDir, 'development_context.json'), JSON.stringify({
      branch_name: branchName,
      feature_name: feature.name,
      project_id: req.params.projectId,
      architecture_plan: archRevision?.content ?? '',
    }))

    const updateStep = async (stepName: string, status: string, detail?: string) => {
      await db.run(
        `UPDATE development_steps SET status = ?, detail = ?, completed_at = CASE WHEN ? IN ('completed','error') THEN datetime('now') ELSE NULL END
         WHERE feature_id = ? AND step_name = ?`,
        status, detail ?? null, status, feature.id, stepName
      )
      sseSend(res, { type: 'step_update', step: stepName, status, detail })
    }

    await updateStep('branch_created', 'running')
    sseSend(res, { type: 'status', message: `Creating branch ${branchName}...` })

    const result = await runCommandInDirWithFallback(
      'development-execute',
      workDir,
      (line) => sseSend(res, { type: 'session_event', message: line }),
    )

    if (result.mode === 'api') {
      await pollSessionMessages(result.sessionId, (msg) => sseSend(res, { type: 'session_event', message: msg }))
    }

    // Mark all steps completed (OpenClaw handles actual execution)
    for (const step of steps) {
      await updateStep(step, 'completed')
    }

    // Read generated summary
    const summaryFile = path.join(workDir, 'change_summary.md')
    if (fs.existsSync(summaryFile)) {
      const summary = fs.readFileSync(summaryFile, 'utf-8')
      await db.run(
        `UPDATE development_steps SET change_summary = ? WHERE feature_id = ? AND step_name = 'summary'`,
        summary, feature.id
      )
    }

    sseSend(res, { type: 'done', branch: branchName })
    res.end()
  } catch (err) {
    sseSend(res, { type: 'error', message: (err as Error).message })
    res.end()
  }
})

// GET /api/projects/:projectId/features/:featureId/development/status
phasesRouter.get('/projects/:projectId/features/:featureId/development/status', async (req, res) => {
  try {
    const db = getDb()
    const steps = await db.all(
      'SELECT * FROM development_steps WHERE feature_id = ? ORDER BY id ASC',
      req.params.featureId
    )
    const feature = await db.get('SELECT branch_name, dev_approved FROM feature_phases WHERE id = ?', req.params.featureId)
    res.json({ steps, branch_name: feature?.branch_name, dev_approved: !!feature?.dev_approved })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/projects/:projectId/features/:featureId/development/summary
phasesRouter.get('/projects/:projectId/features/:featureId/development/summary', async (req, res) => {
  try {
    const db = getDb()
    const step = await db.get(
      `SELECT change_summary FROM development_steps WHERE feature_id = ? AND step_name = 'summary'`,
      req.params.featureId
    )
    res.json({ summary: step?.change_summary ?? null })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/development/approve
phasesRouter.post('/projects/:projectId/features/:featureId/development/approve', async (req, res) => {
  try {
    const db = getDb()
    await db.run(
      `UPDATE feature_phases SET current_phase = 'testing', dev_approved = 1, updated_at = datetime('now') WHERE id = ?`,
      req.params.featureId
    )
    res.json({ success: true, next_phase: 'testing' })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/development/request-changes
phasesRouter.post('/projects/:projectId/features/:featureId/development/request-changes', async (req, res) => {
  try {
    const { comments } = req.body
    const db = getDb()
    if (comments) {
      await db.run(
        `INSERT INTO phase_comments (feature_id, phase, content) VALUES (?, 'development', ?)`,
        req.params.featureId, comments
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── Testing Phase ────────────────────────────────────────────────────────────

// POST /api/projects/:projectId/features/:featureId/testing/generate-plan  (SSE)
phasesRouter.post('/projects/:projectId/features/:featureId/testing/generate-plan', async (req, res) => {
  sseHeaders(res)
  try {
    const db = getDb()
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ?', req.params.featureId)
    if (!feature) { sseSend(res, { type: 'error', message: 'Feature not found' }); return res.end() }
    if (!feature.dev_approved) { sseSend(res, { type: 'error', message: 'Development must be approved first' }); return res.end() }

    sseSend(res, { type: 'status', message: 'Generating test plan...' })

    const workDir = featureStorePath(req.params.projectId, feature.id)
    const result = await runCommandInDirWithFallback(
      'testing-plan',
      workDir,
      (line) => sseSend(res, { type: 'session_event', message: line }),
    )

    if (result.mode === 'api') {
      await pollSessionMessages(result.sessionId, (msg) => sseSend(res, { type: 'session_event', message: msg }))
    }

    const planFile = path.join(workDir, 'test_plan.md')
    let content = '# Test Plan\n\n*Generated test plan will appear here.*'
    if (fs.existsSync(planFile)) { content = fs.readFileSync(planFile, 'utf-8') }

    const lastRev = await db.get(
      `SELECT MAX(version) as v FROM phase_revisions WHERE feature_id = ? AND phase = 'testing'`,
      feature.id
    )
    const version = (lastRev?.v ?? 0) + 1

    await db.run(
      `INSERT INTO phase_revisions (feature_id, phase, version, content, status) VALUES (?, 'testing', ?, ?, 'pending_review')`,
      feature.id, version, content
    )

    sseSend(res, { type: 'done', version })
    res.end()
  } catch (err) {
    sseSend(res, { type: 'error', message: (err as Error).message })
    res.end()
  }
})

// GET /api/projects/:projectId/features/:featureId/testing/revisions
phasesRouter.get('/projects/:projectId/features/:featureId/testing/revisions', async (req, res) => {
  try {
    const db = getDb()
    const revisions = await db.all(
      `SELECT id, version, status, architect_comments, created_at FROM phase_revisions
       WHERE feature_id = ? AND phase = 'testing' ORDER BY version ASC`,
      req.params.featureId
    )
    res.json(revisions)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/projects/:projectId/features/:featureId/testing/revisions/:version
phasesRouter.get('/projects/:projectId/features/:featureId/testing/revisions/:version', async (req, res) => {
  try {
    const db = getDb()
    const revision = await db.get(
      `SELECT * FROM phase_revisions WHERE feature_id = ? AND phase = 'testing' AND version = ?`,
      req.params.featureId, parseInt(req.params.version)
    )
    if (!revision) return res.status(404).json({ error: 'Revision not found' })
    res.json(revision)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/testing/revise
phasesRouter.post('/projects/:projectId/features/:featureId/testing/revise', async (req, res) => {
  try {
    const { comments } = req.body
    const db = getDb()
    const latest = await db.get(
      `SELECT id FROM phase_revisions WHERE feature_id = ? AND phase = 'testing' ORDER BY version DESC LIMIT 1`,
      req.params.featureId
    )
    if (latest) {
      await db.run(
        `UPDATE phase_revisions SET status = 'revision_requested', architect_comments = ? WHERE id = ?`,
        comments ?? null, latest.id
      )
    }
    if (comments) {
      await db.run(
        `INSERT INTO phase_comments (feature_id, phase, content) VALUES (?, 'testing', ?)`,
        req.params.featureId, comments
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/testing/approve  (SSE)
phasesRouter.post('/projects/:projectId/features/:featureId/testing/approve', async (req, res) => {
  sseHeaders(res)
  try {
    const db = getDb()
    const feature = await db.get('SELECT * FROM feature_phases WHERE id = ?', req.params.featureId)
    if (!feature) { sseSend(res, { type: 'error', message: 'Feature not found' }); return res.end() }

    const latest = await db.get(
      `SELECT id FROM phase_revisions WHERE feature_id = ? AND phase = 'testing' ORDER BY version DESC LIMIT 1`,
      feature.id
    )
    if (latest) {
      await db.run(`UPDATE phase_revisions SET status = 'approved' WHERE id = ?`, latest.id)
    }

    sseSend(res, { type: 'status', message: 'Generating test code...' })

    const workDir = featureStorePath(req.params.projectId, feature.id)
    const result = await runCommandInDirWithFallback(
      'testing-execute',
      workDir,
      (line) => sseSend(res, { type: 'session_event', message: line }),
    )

    if (result.mode === 'api') {
      await pollSessionMessages(result.sessionId, (msg) => sseSend(res, { type: 'session_event', message: msg }))
    }

    await db.run(
      `UPDATE feature_phases SET current_phase = 'completed', updated_at = datetime('now') WHERE id = ?`,
      feature.id
    )

    sseSend(res, { type: 'done' })
    res.end()
  } catch (err) {
    sseSend(res, { type: 'error', message: (err as Error).message })
    res.end()
  }
})

// ─── Comments (shared) ────────────────────────────────────────────────────────

// GET /api/projects/:projectId/features/:featureId/comments
phasesRouter.get('/projects/:projectId/features/:featureId/comments', async (req, res) => {
  try {
    const db = getDb()
    const { phase } = req.query
    let comments
    if (phase) {
      comments = await db.all(
        'SELECT * FROM phase_comments WHERE feature_id = ? AND phase = ? ORDER BY created_at ASC',
        req.params.featureId, phase
      )
    } else {
      comments = await db.all(
        'SELECT * FROM phase_comments WHERE feature_id = ? ORDER BY created_at ASC',
        req.params.featureId
      )
    }
    res.json(comments)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/projects/:projectId/features/:featureId/comments
phasesRouter.post('/projects/:projectId/features/:featureId/comments', async (req, res) => {
  try {
    const { phase, content, revision_version } = req.body
    if (!phase || !content?.trim()) return res.status(400).json({ error: 'phase and content are required' })
    const db = getDb()
    const result = await db.run(
      `INSERT INTO phase_comments (feature_id, phase, content, revision_version) VALUES (?, ?, ?, ?)`,
      req.params.featureId, phase, content.trim(), revision_version ?? null
    )
    const comment = await db.get('SELECT * FROM phase_comments WHERE id = ?', result.lastID)
    res.status(201).json(comment)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
