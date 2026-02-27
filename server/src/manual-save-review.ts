import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DB_DIR = path.join(os.homedir(), '.codereview-store')
const DB_PATH = path.join(DB_DIR, 'codereview.db')

const reviewDir = '2026-02-27_PR-44_Simple-File-System'
const reviewPath = path.join(DB_DIR, 'reviews', reviewDir)

// Read review comments
const commentsPath = path.join(reviewPath, 'review_comments.json')
const content = fs.readFileSync(commentsPath, 'utf-8')
const reviewData = JSON.parse(content)

console.log('[Manual Save] Review Data:', {
  pr_number: reviewData.pr_number,
  repository: reviewData.repository,
  verdict: reviewData.verdict,
  comment_count: reviewData.comments.length
})

// Get project ID from repository
const projectId = 'thrishulshetty027/Simple-File-System'

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Manual Save] Database connection error:', err)
    process.exit(1)
  }

  console.log('[Manual Save] Connected to database')

  // Create review record
  const reviewId = `${projectId}-pr-${reviewData.pr_number}-${Date.now()}`
  const reviewOutput = JSON.stringify(reviewData)

  const sql = `
    INSERT INTO reviews (id, project_id, pr_number, pr_title, pr_url, repository, reviewed_at, verdict, comment_count, review_dir, review_output)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
  `

  db.run(
    sql,
    [
      reviewId,
      projectId,
      reviewData.pr_number,
      `PR #${reviewData.pr_number}`,
      `https://github.com/${reviewData.repository}/pull/${reviewData.pr_number}`,
      reviewData.repository,
      reviewData.verdict,
      reviewData.comments.length,
      reviewDir,
      reviewOutput
    ],
    function(err) {
      if (err) {
        console.error('[Manual Save] Insert error:', err)
        db.close()
        process.exit(1)
      }

      console.log(`[Manual Save] ✅ Review saved successfully!`)
      console.log(`[Manual Save] Review ID: ${reviewId}`)
      console.log(`[Manual Save] Review URL: https://github.com/${reviewData.repository}/pull/${reviewData.pr_number}#pullrequestreview-${this.lastID}`)
      console.log(`[Manual Save] Comments count: ${reviewData.comments.length}`)

      db.close()
    }
  )
})
