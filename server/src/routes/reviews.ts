import { Router } from 'express'
import { dbGet, dbRun } from '../db/database.js'
import { readReviewOutput, readReviewSummary, findReviewDir } from '../lib/store.js'

export const reviewsRouter = Router()

// GET /api/reviews/:reviewId — get full review output (comments and summary)
reviewsRouter.get('/:reviewId', async (req, res) => {
  try {
    const review = await dbGet('SELECT * FROM reviews WHERE id = ?', [req.params.reviewId]) as {
      review_dir: string
      pr_number: number
      repository: string
    } | undefined

    if (!review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    let reviewDir = review.review_dir
    let output = readReviewOutput(reviewDir)
    let summary = readReviewSummary(reviewDir)

    // If files not found, try to auto-discover the review directory
    if (!output && !summary && review.repository) {
      const discoveredDir = findReviewDir(review.pr_number, review.repository)
      if (discoveredDir) {
        reviewDir = discoveredDir
        output = readReviewOutput(reviewDir)
        summary = readReviewSummary(reviewDir)

        // Update the database with the correct directory
        if (output || summary) {
          await dbRun(
            'UPDATE reviews SET review_dir = ? WHERE id = ?',
            [reviewDir, req.params.reviewId]
          )
        }
      }
    }

    if (!output && !summary) {
      return res.status(404).json({ error: 'Review files not found' })
    }

    res.json({
      comments: output,
      summary: summary,
      review_dir: reviewDir
    })
  } catch (err) {
    console.error('Error fetching review:', err)
    res.status(500).json({ error: 'Failed to fetch review' })
  }
})
