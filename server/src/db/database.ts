import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const DB_DIR = path.join(os.homedir(), '.codereview-store')
const DB_PATH = path.join(DB_DIR, 'codereview.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): void {
  fs.mkdirSync(DB_DIR, { recursive: true })

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      git_remote TEXT NOT NULL UNIQUE,
      main_branch TEXT NOT NULL DEFAULT 'main',
      auto_review_enabled INTEGER NOT NULL DEFAULT 1,
      review_trigger_label TEXT NOT NULL DEFAULT 'ai_codereview',
      post_clone_scripts TEXT NOT NULL DEFAULT '[]',
      review_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4-20250514',
      excluded_paths TEXT NOT NULL DEFAULT '["node_modules/","dist/",".git/"]',
      max_diff_lines INTEGER NOT NULL DEFAULT 5000,
      severity_threshold TEXT NOT NULL DEFAULT 'MEDIUM',
      github_token_ref TEXT,
      polling_enabled INTEGER NOT NULL DEFAULT 0,
      last_polled_at TEXT,
      store_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Review history table
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      pr_number INTEGER NOT NULL,
      pr_title TEXT NOT NULL DEFAULT '',
      pr_url TEXT NOT NULL DEFAULT '',
      repository TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('approve', 'request_changes', 'comment')),
      comment_count INTEGER NOT NULL DEFAULT 0,
      review_dir TEXT NOT NULL,
      github_review_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Document versions table (audit trail)
    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      module_name TEXT,
      content TEXT NOT NULL,
      modified_at TEXT NOT NULL DEFAULT (datetime('now')),
      modified_by TEXT NOT NULL DEFAULT 'system',
      version INTEGER NOT NULL
    );

    -- Sessions table (OpenCode session tracking)
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('init', 'review', 'push')),
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
      progress TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- Global settings table
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_reviews_project_id ON reviews(project_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_at ON reviews(reviewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_doc_versions_project_module ON document_versions(project_id, module_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  `)

  console.log(`Database initialized at ${DB_PATH}`)
}

export function getGlobalSetting(key: string): string | undefined {
  const db = getDb()
  const row = db.prepare('SELECT value FROM global_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setGlobalSetting(key: string, value: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO global_settings (key, value, updated_at) 
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(key, value, value)
}

