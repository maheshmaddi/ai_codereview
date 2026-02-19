import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const DB_DIR = path.join(os.homedir(), '.codereview-store')
const DB_PATH = path.join(DB_DIR, 'codereview.db')

let db: sqlite3.Database | null = null

class PreparedStatement {
  private sql: string
  private database: sqlite3.Database

  constructor(database: sqlite3.Database, sql: string) {
    this.database = database
    this.sql = sql
  }

  async all(...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.database.all(this.sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  async get(...params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.database.get(this.sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  async run(...params: any[]): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.database.run(this.sql, params, function(err) {
        if (err) reject(err)
        else resolve({ lastID: this.lastID, changes: this.changes })
      })
    })
  }
}

class DatabaseWrapper {
  private database: sqlite3.Database

  constructor(database: sqlite3.Database) {
    this.database = database
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.database, sql)
  }

  async exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.database.exec(sql, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async run(sql: string, ...params: any[]): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.database.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve({ lastID: this.lastID, changes: this.changes })
      })
    })
  }

  async get(sql: string, ...params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.database.get(sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  async all(sql: string, ...params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.database.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  async pragma(pragma: string): Promise<{ lastID: number; changes: number }> {
    return this.run(`PRAGMA ${pragma}`)
  }
}

let dbWrapper: DatabaseWrapper | null = null

export function getDb(): DatabaseWrapper {
  if (!dbWrapper) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return dbWrapper
}

export async function initDatabase(): Promise<void> {
  fs.mkdirSync(DB_DIR, { recursive: true })

  db = new sqlite3.Database(DB_PATH)
  dbWrapper = new DatabaseWrapper(db)

  await dbWrapper.pragma('journal_mode = WAL')
  await dbWrapper.pragma('foreign_keys = ON')

  await dbWrapper.exec(`
    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      git_remote TEXT NOT NULL UNIQUE,
      main_branch TEXT NOT NULL DEFAULT 'main',
      auto_review_enabled INTEGER NOT NULL DEFAULT 0,
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

export async function getGlobalSetting(key: string): Promise<string | undefined> {
  const database = getDb()
  const row = await database.get('SELECT value FROM global_settings WHERE key = ?', key) as { value: string } | undefined
  return row?.value
}

export async function setGlobalSetting(key: string, value: string): Promise<void> {
  const database = getDb()
  await database.run(`
    INSERT INTO global_settings (key, value, updated_at) 
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `, key, value, value)
}
