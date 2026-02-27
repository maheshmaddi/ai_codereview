/**
 * GitHub Publisher API — Post code review comments to GitHub PRs
 */

import { Router } from 'express'
import { Octokit } from 'octokit'
import { dbGet, dbRun } from '../db/database.js'
import { readReviewOutput } from '../lib/store.js'

export const githubPublisherRouter = Router()

interface ReviewComments {
  pr_number: number
  repository: string
  overall_summary: string
  verdict: 'approve' | 'request_changes' | 'comment'
  comments: Array<{
    path: string
    start_line: number
    end_line: number
    severity: string
    category: string
    body: string
  }>
}

// POST /api/github/push-review/:reviewId — Push review comments to GitHub
githubPublisherRouter.post('/push-review/:reviewId', async (req, res) => {
  try {
    const reviewId = req.params.reviewId

    // Get review details from database
    const review = await dbGet(
      'SELECT * FROM reviews WHERE id = ?',
      [reviewId]
    ) as {
      id: string
      pr_number: number
      pr_url: string
      repository: string
      review_dir: string
      github_review_id: number | null
    } | undefined

    if (!review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    if (review.github_review_id) {
      return res.status(400).json({ error: 'Review already posted to GitHub', github_review_id: review.github_review_id })
    }

    // Read review output
    const reviewOutput = readReviewOutput(review.review_dir) as ReviewComments | null

    if (!reviewOutput) {
      return res.status(404).json({ error: 'Review output file not found' })
    }

    // Check for GitHub token
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      return res.status(500).json({ error: 'GITHUB_TOKEN not configured' })
    }

    const octokit = new Octokit({ auth: token })

    // Parse owner/repo from repository field (format: "org/project")
    const [owner, repo] = review.repository.split('/')

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid repository format' })
    }

    // Map verdict to GitHub event
    const eventMap: Record<string, 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'> = {
      approve: 'APPROVE',
      request_changes: 'REQUEST_CHANGES',
      comment: 'COMMENT',
    }

    const event = eventMap[reviewOutput.verdict] || 'COMMENT'

     // Format line comments for GitHub API
    const githubComments = reviewOutput.comments.map((comment) => {
      const body = `[${comment.severity}][${comment.category}] ${comment.body}`
      const githubComment: { path: string; body: string; side?: 'RIGHT'; line?: number; start_line?: number; start_side?: string } = {
        path: comment.path,
        body,
        side: 'RIGHT',
        line: comment.end_line,
      }

      // Add start_line for multi-line comments
      if (comment.start_line !== comment.end_line) {
        githubComment.start_line = comment.start_line
        githubComment.start_side = 'RIGHT'
      }

      return githubComment
    })

    // Submit review to GitHub
    try {
      const { data } = await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: review.pr_number,
        body: reviewOutput.overall_summary,
        event,
        comments: githubComments,
      })

      const githubReviewId = (data as { id: number }).id

      // Update database with GitHub review ID
      await dbRun(
        'UPDATE reviews SET github_review_id = ? WHERE id = ?',
        [githubReviewId, reviewId]
      )

      res.json({
        success: true,
        github_review_id: githubReviewId,
        review_url: `${review.pr_url}#pullrequestreview-${githubReviewId}`,
      })
    } catch (githubError: any) {
      console.error('GitHub API error:', githubError)

      // Handle specific GitHub API errors
      if (githubError.status === 403) {
        return res.status(403).json({
          error: 'GitHub API permission denied',
          details: 'Ensure GITHUB_TOKEN has pull request write permissions',
        })
      }

      if (githubError.status === 404) {
        return res.status(404).json({
          error: 'Pull request or repository not found',
          details: `Could not find PR #${review.pr_number} in ${review.repository}`,
        })
      }

      // Generic error
      return res.status(500).json({
        error: 'Failed to post review to GitHub',
        details: githubError.message || githubError,
      })
    }
  } catch (error) {
    console.error('Push review error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// POST /api/github/push-review-by-pr/:projectId/:prNumber — Push review by PR number
githubPublisherRouter.post('/push-review-by-pr/:projectId/:prNumber', async (req, res) => {
  try {
    const projectId = decodeURIComponent(req.params.projectId)
    const prNumber = parseInt(req.params.prNumber, 10)

    if (isNaN(prNumber)) {
      return res.status(400).json({ error: 'Invalid PR number' })
    }

    // Get the most recent review for this PR
    const review = await dbGet(
      'SELECT * FROM reviews WHERE project_id = ? AND pr_number = ? ORDER BY reviewed_at DESC LIMIT 1',
      [projectId, prNumber]
    ) as {
      id: string
      pr_number: number
      project_id: string
      review_dir: string
      review_output: string | null
      github_review_id: number | null
    } | undefined

     if (!review) {
       return res.status(404).json({ error: 'No review found for this PR' })
     }

     // Return review data for frontend to call push-review endpoint
     return res.json({
       success: true,
       review_id: review.id,
       project_id: review.project_id,
       pr_number: review.pr_number,
       github_review_id: review.github_review_id,
       review_output: review.review_output,
     })
   } catch (error) {
     console.error('Push review by PR error:', error)
     res.status(500).json({ error: (error as Error).message })
   }
 })
