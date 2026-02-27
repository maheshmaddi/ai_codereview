import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

const DB_DIR = path.join(os.homedir(), '.codereview-store')
const DB_PATH = path.join(DB_DIR, 'codereview.db')

let db: sqlite3.Database | null = null

export function getDb(): sqlite3.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(DB_DIR, { recursive: true })

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err)
        return
      }

      db!.run('PRAGMA journal_mode = WAL')
      db!.run('PRAGMA foreign_keys = ON')

      const schema = `
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
      `

      db!.exec(schema, (err) => {
        if (err) {
          reject(err)
          return
        }

        // Add review_output column if it doesn't exist (for backwards compatibility)
        db!.all("PRAGMA table_info(reviews)", [], (err, rows: any[]) => {
          if (err) {
            console.warn('Failed to check reviews table columns:', err)
            resolve()
            return
          }

          const hasReviewOutput = rows.some((row: any) => row.name === 'review_output')
          if (!hasReviewOutput) {
            db!.run("ALTER TABLE reviews ADD COLUMN review_output TEXT", (alterErr) => {
              if (alterErr) {
                console.warn('Failed to add review_output column:', alterErr)
              } else {
                console.log('Added review_output column to reviews table')
              }
              resolve()
            })
          } else {
            resolve()
          }
        })
      })
    })
  })
}

export function getGlobalSetting(key: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const db = getDb()
    db.get('SELECT value FROM global_settings WHERE key = ?', [key], (err, row: any) => {
      if (err) {
        reject(err)
      } else {
        resolve(row?.value)
      }
    })
  })
}

export function setGlobalSetting(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDb()
    db.run(`
      INSERT INTO global_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `, [key, value, value], (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

export function dbGet(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    const db = getDb()
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export function dbAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const db = getDb()
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export function dbRun(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
  return new Promise((resolve, reject) => {
    const db = getDb()
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}
