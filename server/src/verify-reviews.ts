import sqlite3 from 'sqlite3'
import path from 'path'
import os from 'os'

const dbPath = path.join(os.homedir(), '.codereview-store', 'codereview.db')
const db = new sqlite3.Database(dbPath)

db.all('SELECT id, pr_number, pr_title, repository, verdict, comment_count, reviewed_at, github_review_id FROM reviews ORDER BY reviewed_at DESC LIMIT 3', (err, rows) => {
  if (err) {
    console.error('Error:', err)
    process.exit(1)
  }

  console.log('\nRecent reviews:')
  rows.forEach((row, i) => {
    console.log(`\n${i + 1}. PR #${row.pr_number}: ${row.verdict} (${row.comment_count} comments) - ${row.github_review_id ? 'Posted' : 'Not Posted'}`)
    console.log(`   ID: ${row.id}`)
    console.log(`   Repository: ${row.repository}`)
    console.log(`   Reviewed: ${row.reviewed_at}`)
  })

  db.close()
})
