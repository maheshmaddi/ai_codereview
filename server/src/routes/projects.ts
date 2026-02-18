import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db/database.js'
import {
  readIndex,
  readDocument,
  writeDocument,
  readSettings,
  writeSettings,
  getProjectStoreDir,
  discoverProjectsFromStore,
  remoteToStorePath,
  REVIEWS_DIR,
  PROJECTS_DIR,
} from '../lib/store.js'
import { runCommand, runCommandInDirWithFallback, pollSessionMessages } from '../lib/opencode-client.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

export const projectsRouter = Router()

async function syncProjectsFromStore(): Promise<{ discovered: number; upserted: number }> {
  const db = getDb()
  const discovered = discoverProjectsFromStore()
  console.log('[syncProjectsFromStore] Discovered projects:', discovered)
  let upserted = 0

  const upsertStmt = db.prepare(
    `INSERT INTO projects (id, display_name, git_remote, store_path)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       git_remote = excluded.git_remote,
       store_path = excluded.store_path,
       updated_at = datetime('now')`
  )

  for (const project of discovered) {
    console.log('[syncProjectsFromStore] Upserting project:', project)
    await upsertStmt.run(project.projectId, project.displayName, project.gitRemote, project.storePath)
    upserted += 1
  }

  console.log('[syncProjectsFromStore] Upserted:', upserted, 'out of', discovered.length)
  return { discovered: discovered.length, upserted }
}

// GET /api/projects — list all projects with summary info
projectsRouter.get('/', async (_req, res) => {
  await syncProjectsFromStore()
  const db = getDb()
  const projects = await db
    .prepare(
      `SELECT p.id, p.display_name, p.git_remote, p.updated_at,
              COUNT(r.id) as review_count,
              MAX(r.reviewed_at) as last_review_date
       FROM projects p
       LEFT JOIN reviews r ON r.project_id = p.id
       GROUP BY p.id
       ORDER BY p.display_name`
    )
    .all() as Array<{
      id: string
      display_name: string
      git_remote: string
      updated_at: string
      review_count: number
      last_review_date: string | null
    }>

  console.log('[GET /api/projects] Returning projects:', projects.map(p => ({ id: p.id, display_name: p.display_name })))

  const summaries = projects.map((p) => {
    const index = readIndex(p.id)
    const storeDir = getProjectStoreDir(p.id)
    const hasIndex = index !== null

    let status: string
    if (!hasIndex) {
      status = 'not_initialized'
    } else if (!p.last_review_date) {
      status = 'draft'
    } else {
      const indexMtime = fs.existsSync(path.join(storeDir, 'codereview_index.json'))
        ? fs.statSync(path.join(storeDir, 'codereview_index.json')).mtime.toISOString()
        : null
      status = indexMtime && indexMtime > p.updated_at ? 'needs_regeneration' : 'up_to_date'
    }

    return {
      project_id: p.id,
      display_name: p.display_name,
      git_remote: p.git_remote,
      total_modules: index ? (index.modules as unknown[]).length : 0,
      last_review_date: p.last_review_date,
      last_generated_date: index?.generated_at ?? null,
      status,
    }
  })

  res.json(summaries)
})

// POST /api/projects/refresh — discover and sync projects from filesystem store
projectsRouter.post('/refresh', async (_req, res) => {
  const result = await syncProjectsFromStore()
  res.json({
    success: true,
    ...result,
  })
})

// POST /api/projects/add — clone a git repo and run deep init, streaming SSE status
projectsRouter.post('/add', async (req, res) => {
  const { git_url, display_name } = req.body as { git_url?: string; display_name?: string }

  if (!git_url || typeof git_url !== 'string') {
    return res.status(400).json({ error: 'git_url is required' })
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

  const cloneId = `codereview-clone-${Date.now()}`
  const tempDir = path.join(os.tmpdir(), cloneId)
  
  // Log the temp directory for debugging
  console.log('[ADD PROJECT] os.tmpdir():', os.tmpdir())
  console.log('[ADD PROJECT] Clone ID:', cloneId)
  console.log('[ADD PROJECT] Temp dir path:', tempDir)
  console.log('[ADD PROJECT] Temp dir exists before clone:', fs.existsSync(tempDir))
  let sessionId: string | undefined

  const cleanup = () => {
    try {
      if (fs.existsSync(tempDir)) {
        console.log('[ADD PROJECT] Temp dir still exists at cleanup - this means it was NOT cleaned up yet')
        console.log('[ADD PROJECT] Temp dir contents before cleanup:', fs.readdirSync(tempDir))
        console.log('[ADD PROJECT] NOT cleaning up temp dir - keeping for manual inspection')
        console.log('[ADD PROJECT] Temp dir location:', tempDir)
        console.log('[ADD PROJECT] Manually delete when ready: rmdir /s /q', `"${tempDir}"`)
      }
    } catch (e) {
      console.error('[ADD PROJECT] Failed to check temp dir:', e)
    }
  }

  try {
    // Step 1: Clone the repository
    sendEvent('status', { message: `Cloning ${git_url}...` })

    await new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', ['clone', '--progress', git_url, tempDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      gitProcess.stdout.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim()
        if (line) sendEvent('status', { message: line })
      })

      gitProcess.stderr.on('data', (chunk: Buffer) => {
        // git clone sends progress to stderr
        const line = chunk.toString().trim()
        if (line) sendEvent('status', { message: line })
      })

      gitProcess.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`git clone failed with exit code ${code}`))
      })

      gitProcess.on('error', reject)
    })

    sendEvent('status', { message: 'Repository cloned successfully.' })

    // Step 2: Run deep init — try SDK, fall back to CLI
    sendEvent('status', { message: 'Starting deep initialization (this may take several minutes)...' })

    const abortController = new AbortController()
    req.on('close', () => abortController.abort())

    const runResult = await runCommandInDirWithFallback(
      'codereview-int-deep',
      tempDir,
      (line) => sendEvent('session_event', { message: line }),
    )

    if (runResult.mode === 'sdk') {
      // SDK mode: session is running async, poll for messages
      sendEvent('status', { message: `OpenCode session started: ${runResult.sessionId}` })
      sendEvent('session_started', { session_id: runResult.sessionId })

      const pollResult = await pollSessionMessages(
        runResult.sessionId,
        (text) => sendEvent('session_event', { message: text }),
        abortController.signal
      )

      if (pollResult === 'error') {
        sendEvent('error', { message: 'Deep init encountered an error. Check OpenCode logs.' })
        cleanup()
        res.end()
        return
      }
    } else {
      // CLI mode: process already completed synchronously
      if (runResult.exitCode !== 0) {
        sendEvent('error', { message: `opencode CLI exited with code ${runResult.exitCode}` })
        cleanup()
        res.end()
        return
      }
    sendEvent('status', { message: 'Deep initialization completed via CLI.' })
    }

    // Step 3: Copy project files from temp dir to centralized store
    sendEvent('status', { message: 'Analyzing generated files...' })

    const projectId = remoteToStorePath(git_url)
    const targetStoreDir = getProjectStoreDir(projectId)

    console.log('[ADD PROJECT] Project ID:', projectId)
    console.log('[ADD PROJECT] Target store dir:', targetStoreDir)
    console.log('[ADD PROJECT] Temp dir exists:', fs.existsSync(tempDir))

    // List all files in temp directory recursively
    const getAllFiles = (dir: string, base = ''): string[] => {
      const files: string[] = []
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = path.join(base, entry.name)
        if (entry.isDirectory()) {
          files.push(...getAllFiles(fullPath, relativePath))
        } else {
          files.push(relativePath)
        }
      }
      return files
    }

    const allFiles = getAllFiles(tempDir)
    console.log('[ADD PROJECT] All files in temp dir (recursive):', allFiles)

    // Find codereview-related files
    const codereviewFiles = allFiles.filter(f =>
      f.includes('codereview') || f === 'settings.json' || f === 'opencode.json' || f.endsWith('.md')
    )
    console.log('[ADD PROJECT] All files in temp dir:', allFiles)
    console.log('[ADD PROJECT] Codereview-related files found:', codereviewFiles)
    console.log('[ADD PROJECT] Count of codereview files:', codereviewFiles.length)

    if (codereviewFiles.length === 0) {
      console.log('[ADD PROJECT] WARNING: No codereview files found in temp directory!')
      sendEvent('status', { message: 'WARNING: No code review files were generated. Please check OpenCode CLI output.' })
    }

    // Copy files if any found
    let copiedCount = 0
    if (codereviewFiles.length > 0) {
      sendEvent('status', { message: `Copying ${codereviewFiles.length} files to store...` })

      // Create target directory
      fs.mkdirSync(targetStoreDir, { recursive: true })

      for (const file of codereviewFiles) {
        const srcPath = path.join(tempDir, file)
        const destPath = path.join(targetStoreDir, file)
        const destDir = path.dirname(destPath)

        console.log(`[ADD PROJECT] Copying ${file} from ${srcPath} to ${destPath}`)

        try {
          // Create parent directory if needed
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }

          fs.copyFileSync(srcPath, destPath)
          copiedCount++
          console.log(`[ADD PROJECT] Successfully copied ${file}`)
          sendEvent('status', { message: `Copied ${file}` })
        } catch (err) {
          console.error(`[ADD PROJECT] Failed to copy ${file}:`, err)
        }
      }
    }

    console.log(`[ADD PROJECT] Total copied: ${copiedCount}/${codereviewFiles.length} files`)

    // List what's in target store dir after copy
    const targetFiles = getAllFiles(targetStoreDir)
    console.log('[ADD PROJECT] Files in target store after copy:', targetFiles)

    // Step 4: Sync the project into the database
    sendEvent('status', { message: 'Syncing project to database...' })
    const syncResult = await syncProjectsFromStore()

    sendEvent('done', {
      message: `Project processed. ${copiedCount} files copied to store. Check server logs for details.`,
      project_id: projectId,
      session_id: runResult.mode === 'sdk' ? runResult.sessionId : undefined,
      synced: syncResult.upserted,
      files_copied: copiedCount,
      temp_dir_kept: true,
      manual_cleanup_required: true
    })
  } catch (e) {
    const err = e as Error & { cause?: Error }
    const msg = err.cause ? `${err.message}: ${err.cause.message}` : err.message
    console.error('Add project error:', err)
    sendEvent('error', { message: msg })
  } finally {
    cleanup()
    res.end()
  }
})



// GET /api/projects/:projectId/index
projectsRouter.get('/:projectId/index', (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  console.log('[GET /:projectId/index] Requested projectId:', projectId)
  const index = readIndex(projectId)
  console.log('[GET /:projectId/index] Found index:', !!index)
  if (!index) {
    return res.status(404).json({ error: 'Project index not found. Run /codereview-int-deep first.' })
  }
  res.json(index)
})

// GET /api/projects/:projectId/settings
projectsRouter.get('/:projectId/settings', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  console.log('[GET /:projectId/settings] Requested projectId:', projectId)
  const db = getDb()
  const project = await db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(projectId) as Record<string, unknown> | undefined

  console.log('[GET /:projectId/settings] Found project:', project)

  if (!project) {
    return res.status(404).json({ error: 'Project not found' })
  }

  const fileSettings = readSettings(projectId) ?? {}

  res.json({
    project_id: project.id,
    display_name: project.display_name,
    git_remote: project.git_remote,
    github_token_ref: project.github_token_ref,
    main_branch: project.main_branch,
    auto_review_enabled: Boolean(project.auto_review_enabled),
    review_trigger_label: project.review_trigger_label,
    post_clone_scripts: JSON.parse(project.post_clone_scripts as string),
    review_model: project.review_model,
    excluded_paths: JSON.parse(project.excluded_paths as string),
    max_diff_lines: project.max_diff_lines,
    severity_threshold: project.severity_threshold,
    polling_enabled: Boolean(project.polling_enabled),
    last_polled_at: project.last_polled_at,
    ...fileSettings,
  })
})

// PATCH /api/projects/:projectId/settings
const SettingsSchema = z.object({
  display_name: z.string().optional(),
  main_branch: z.string().optional(),
  auto_review_enabled: z.boolean().optional(),
  review_trigger_label: z.string().optional(),
  post_clone_scripts: z.array(z.string()).optional(),
  review_model: z.string().optional(),
  excluded_paths: z.array(z.string()).optional(),
  max_diff_lines: z.number().int().positive().optional(),
  severity_threshold: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  github_token_ref: z.string().optional(),
  polling_enabled: z.boolean().optional(),
})

projectsRouter.patch('/:projectId/settings', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const parsed = SettingsSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message })
  }

  const data = parsed.data
  const db = getDb()

  const fields: string[] = []
  const values: unknown[] = []

  if (data.display_name !== undefined) { fields.push('display_name = ?'); values.push(data.display_name) }
  if (data.main_branch !== undefined) { fields.push('main_branch = ?'); values.push(data.main_branch) }
  if (data.auto_review_enabled !== undefined) { fields.push('auto_review_enabled = ?'); values.push(data.auto_review_enabled ? 1 : 0) }
  if (data.review_trigger_label !== undefined) { fields.push('review_trigger_label = ?'); values.push(data.review_trigger_label) }
  if (data.post_clone_scripts !== undefined) { fields.push('post_clone_scripts = ?'); values.push(JSON.stringify(data.post_clone_scripts)) }
  if (data.review_model !== undefined) { fields.push('review_model = ?'); values.push(data.review_model) }
  if (data.excluded_paths !== undefined) { fields.push('excluded_paths = ?'); values.push(JSON.stringify(data.excluded_paths)) }
  if (data.max_diff_lines !== undefined) { fields.push('max_diff_lines = ?'); values.push(data.max_diff_lines) }
  if (data.severity_threshold !== undefined) { fields.push('severity_threshold = ?'); values.push(data.severity_threshold) }
  if (data.github_token_ref !== undefined) { fields.push('github_token_ref = ?'); values.push(data.github_token_ref) }
  if (data.polling_enabled !== undefined) { fields.push('polling_enabled = ?'); values.push(data.polling_enabled ? 1 : 0) }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }

  fields.push("updated_at = datetime('now')")
  values.push(projectId)

  await db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  // Also persist to file settings for use by OpenCode agents
  writeSettings(projectId, { ...(readSettings(projectId) ?? {}), ...data })

  const updated = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  res.json(updated)
})

// GET /api/projects/:projectId/document
projectsRouter.get('/:projectId/document', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const moduleName = (req.query.module as string) ?? null

  const content = readDocument(projectId, moduleName)
  if (content === null) {
    return res.status(404).json({ error: 'Document not found' })
  }

  const db = getDb()
  const versionRow = await db
    .prepare(
      'SELECT version, modified_at, modified_by FROM document_versions WHERE project_id = ? AND module_name IS ? ORDER BY version DESC LIMIT 1'
    )
    .get(projectId, moduleName) as { version: number; modified_at: string; modified_by: string } | undefined

  res.json({
    project_id: projectId,
    module_name: moduleName,
    file_path: moduleName ? `modules/${moduleName}_codereview.md` : `${projectId.split('/').pop()}_codereview.md`,
    content,
    last_modified: versionRow?.modified_at ?? new Date().toISOString(),
    version: versionRow?.version ?? 1,
  })
})

// PUT /api/projects/:projectId/document
projectsRouter.put('/:projectId/document', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const { module: moduleName, content } = req.body as { module: string | null; content: string }

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' })
  }

  try {
    const filePath = writeDocument(projectId, moduleName ?? null, content)

    const db = getDb()
    const lastVersion = (
      await db
        .prepare(
          'SELECT version FROM document_versions WHERE project_id = ? AND module_name IS ? ORDER BY version DESC LIMIT 1'
        )
        .get(projectId, moduleName ?? null) as { version: number } | undefined
    )?.version ?? 0

    await db.prepare(
      'INSERT INTO document_versions (project_id, module_name, content, version, modified_by) VALUES (?, ?, ?, ?, ?)'
    ).run(projectId, moduleName ?? null, content, lastVersion + 1, 'user')

    res.json({ success: true, file_path: filePath, version: lastVersion + 1 })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// GET /api/projects/:projectId/document/versions
projectsRouter.get('/:projectId/document/versions', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const moduleName = (req.query.module as string) ?? null

  const db = getDb()
  const versions = await db
    .prepare(
      'SELECT version, modified_at, modified_by FROM document_versions WHERE project_id = ? AND module_name IS ? ORDER BY version DESC'
    )
    .all(projectId, moduleName)

  res.json(versions)
})

// GET /api/projects/:projectId/reviews
projectsRouter.get('/:projectId/reviews', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const db = getDb()
  const reviews = await db
    .prepare(
      'SELECT * FROM reviews WHERE project_id = ? ORDER BY reviewed_at DESC'
    )
    .all(projectId)

  res.json(reviews)
})

// POST /api/projects/:projectId/initialize — trigger /codereview-int-deep
projectsRouter.post('/:projectId/initialize', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)

  try {
    const sessionId = await runCommand('codereview-int-deep')

    const db = getDb()
    await db.prepare(
      "INSERT INTO sessions (id, project_id, type, status) VALUES (?, ?, 'init', 'running')"
    ).run(sessionId, projectId)

    res.json({ session_id: sessionId, message: 'Initialization started' })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// DELETE /api/projects/:projectId — delete project and clear centralized store files
projectsRouter.delete('/:projectId', async (req, res) => {
  const projectId = decodeURIComponent(req.params.projectId)
  const db = getDb()

  const project = await db
    .prepare('SELECT id, store_path FROM projects WHERE id = ?')
    .get(projectId) as { id: string; store_path: string } | undefined

  if (!project) {
    return res.status(404).json({ error: 'Project not found' })
  }

  // Capture review directories before cascading delete removes rows.
  const reviewDirs = await db
    .prepare('SELECT review_dir FROM reviews WHERE project_id = ?')
    .all(projectId) as Array<{ review_dir: string }>

  const projectStoreDir =
    typeof project.store_path === 'string' && project.store_path.trim()
      ? project.store_path
      : getProjectStoreDir(projectId)

  try {
    if (fs.existsSync(projectStoreDir)) {
      fs.rmSync(projectStoreDir, { recursive: true, force: true })
    }

    for (const row of reviewDirs) {
      const reviewPath = path.join(REVIEWS_DIR, row.review_dir)
      if (fs.existsSync(reviewPath)) {
        fs.rmSync(reviewPath, { recursive: true, force: true })
      }
    }

    await db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)

    return res.json({ success: true, project_id: projectId })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
})
