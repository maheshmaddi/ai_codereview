import { Router } from 'express'
import { getDb } from '../db/database.js'
import { readReviewOutput } from '../lib/store.js'

export const reviewsRouter = Router()

// GET /api/reviews/:reviewId — get full review output
reviewsRouter.get('/:reviewId', async (req, res) => {
  const db = getDb()
  const review = await db
    .prepare('SELECT * FROM reviews WHERE id = ?')
    .get(req.params.reviewId) as { review_dir: string } | undefined

  if (!review) {
    return res.status(404).json({ error: 'Review not found' })
  }

  const output = readReviewOutput(review.review_dir)
  if (!output) {
    return res.status(404).json({ error: 'Review output file not found' })
  }

  res.json(output)
})
