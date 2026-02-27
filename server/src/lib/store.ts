/**
 * Centralized review store — file system operations
 * All review documents live under ~/.codereview-store/
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

export const STORE_ROOT = path.join(os.homedir(), '.codereview-store')
export const PROJECTS_DIR = path.join(STORE_ROOT, 'projects')
export const REVIEWS_DIR = path.join(STORE_ROOT, 'reviews')

export type DiscoveredProject = {
  projectId: string
  displayName: string
  gitRemote: string
  storePath: string
}

/** Parse git remote URL into a file system path segment */
export function remoteToStorePath(gitRemote: string): string {
  // https://github.com/org/project.git → github.com/org/project
  return gitRemote
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/:/g, '/')
}

/** Get the store directory for a project */
export function getProjectStoreDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId)
}

/** Read the codereview_index.json for a project */
export function readIndex(projectId: string): Record<string, unknown> | null {
  const indexPath = path.join(getProjectStoreDir(projectId), 'codereview_index.json')
  if (!fs.existsSync(indexPath)) return null
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
}

/** Read a markdown document from the store */
export function readDocument(projectId: string, moduleNameOrRoot: string | null): string | null {
  const storeDir = getProjectStoreDir(projectId)

  let filePath: string
  if (moduleNameOrRoot === null) {
    // Root document: find {project}_codereview.md
    const index = readIndex(projectId)
    if (!index) return null
    filePath = path.join(storeDir, index.root_codereview as string)
  } else {
    // Module document
    const index = readIndex(projectId)
    if (!index) return null
    const modules = index.modules as Array<{ name: string; codereview_file: string }>
    const moduleEntry = modules.find((m) => m.name === moduleNameOrRoot)
    if (!moduleEntry) return null
    filePath = path.join(storeDir, moduleEntry.codereview_file)
  }

  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf-8')
}

/** Write a markdown document to the store */
export function writeDocument(
  projectId: string,
  moduleNameOrRoot: string | null,
  content: string
): string {
  const storeDir = getProjectStoreDir(projectId)

  let filePath: string
  if (moduleNameOrRoot === null) {
    const index = readIndex(projectId)
    if (!index) throw new Error('Project index not found')
    filePath = path.join(storeDir, index.root_codereview as string)
  } else {
    const index = readIndex(projectId)
    if (!index) throw new Error('Project index not found')
    const modules = index.modules as Array<{ name: string; codereview_file: string }>
    const moduleEntry = modules.find((m) => m.name === moduleNameOrRoot)
    if (!moduleEntry) throw new Error(`Module "${moduleNameOrRoot}" not found in index`)
    filePath = path.join(storeDir, moduleEntry.codereview_file)
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/** Read review_comments.json from a review directory */
export function readReviewOutput(reviewDir: string): Record<string, unknown> | null {
  // Handle both relative and absolute paths
  const filePath = path.isAbsolute(reviewDir)
    ? path.join(reviewDir, 'review_comments.json')
    : path.join(REVIEWS_DIR, reviewDir, 'review_comments.json')

  console.log(`[Store] Reading review output from: ${filePath}`)

  if (!fs.existsSync(filePath)) {
    console.error(`[Store] Review file not found: ${filePath}`)
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim()

    if (!content || content === '{}') {
      console.warn(`[Store] Review file is empty: ${filePath}`)
      return null
    }

    const data = JSON.parse(content)
    console.log(`[Store] Successfully loaded review data with ${(data as any).comments?.length || 0} comments`)
    return data
  } catch (error) {
    console.error(`[Store] Failed to parse review file:`, error)
    return null
  }
}

/** Read review_summary.md from a review directory */
export function readReviewSummary(reviewDir: string): string | null {
  const filePath = path.isAbsolute(reviewDir)
    ? path.join(reviewDir, 'review_summary.md')
    : path.join(REVIEWS_DIR, reviewDir, 'review_summary.md')

  console.log(`[Store] Reading review summary from: ${filePath}`)

  if (!fs.existsSync(filePath)) {
    console.error(`[Store] Review summary file not found: ${filePath}`)
    return null
  }

  try {
    const data = fs.readFileSync(filePath, 'utf-8')
    console.log(`[Store] Successfully loaded review summary (${data.length} bytes)`)
    return data
  } catch (error) {
    console.error(`[Store] Failed to read review summary file:`, error)
    return null
  }
}

/** Find review directory by PR number and repository name */
export function findReviewDir(prNumber: number, repository: string): string | null {
  if (!fs.existsSync(REVIEWS_DIR)) return null

  const dirs = fs.readdirSync(REVIEWS_DIR)
  const pattern = new RegExp(`\\d{4}-\\d{2}-\\d{2}_PR-${prNumber}_${repository.replace(/\//g, '_')}$`)

  for (const dir of dirs) {
    if (pattern.test(dir)) {
      return dir
    }
  }

  return null
}

/** List all review directories */
export function listReviewDirs(): string[] {
  if (!fs.existsSync(REVIEWS_DIR)) return []
  return fs.readdirSync(REVIEWS_DIR).sort().reverse()
}

/** Read project settings.json */
export function readSettings(projectId: string): Record<string, unknown> | null {
  const settingsPath = path.join(getProjectStoreDir(projectId), 'settings.json')
  if (!fs.existsSync(settingsPath)) return null
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
}

/** Write project settings.json */
export function writeSettings(projectId: string, settings: Record<string, unknown>): void {
  const storeDir = getProjectStoreDir(projectId)
  fs.mkdirSync(storeDir, { recursive: true })
  fs.writeFileSync(path.join(storeDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

/**
 * Discover projects from the centralized store.
 * A project is considered valid when codereview_index.json exists.
 */
export function discoverProjectsFromStore(): DiscoveredProject[] {
  if (!fs.existsSync(PROJECTS_DIR)) return []

  const discovered: DiscoveredProject[] = []

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (!entry.isDirectory()) continue

      const indexPath = path.join(fullPath, 'codereview_index.json')
      if (fs.existsSync(indexPath)) {
        try {
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
            project?: string
            git_remote?: string
          }

          const relativePath = path.relative(PROJECTS_DIR, fullPath)
          const projectId = relativePath.split(path.sep).join('/')
          const fallbackName = projectId.split('/').pop() ?? projectId
          const displayName = (index.project?.trim() || fallbackName).trim()
          const gitRemote = (index.git_remote?.trim() || `https://${projectId}.git`).trim()

          discovered.push({
            projectId,
            displayName,
            gitRemote,
            storePath: fullPath,
          })
        } catch {
          // Ignore invalid index files and continue scanning.
        }
        continue
      }

      walk(fullPath)
    }
  }

  walk(PROJECTS_DIR)
  return discovered
}
