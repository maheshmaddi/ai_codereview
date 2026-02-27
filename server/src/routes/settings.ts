import { Router } from 'express'
import { getGlobalSetting, setGlobalSetting } from '../db/database.js'
import { getAvailableModels } from '../lib/opencode-client.js'

export const settingsRouter = Router()

// GET /api/settings - get all global settings
settingsRouter.get('/', async (_req, res) => {
    try {
        const reviewModel = await getGlobalSetting('review_model') ?? 'anthropic/claude-sonnet-4-20250514'
        res.json({
            review_model: reviewModel
        })
    } catch (err) {
        console.error('Error fetching settings:', err)
        res.status(500).json({ error: 'Failed to fetch settings' })
    }
})

// PATCH /api/settings - update global settings
settingsRouter.patch('/', async (req, res) => {
    try {
        const { review_model } = req.body

        if (review_model) {
            await setGlobalSetting('review_model', review_model)
        }

        const updatedModel = await getGlobalSetting('review_model')
        res.json({
            review_model: updatedModel
        })
    } catch (err) {
        console.error('Error updating settings:', err)
        res.status(500).json({ error: 'Failed to update settings' })
    }
})

// GET /api/settings/models - get available models
settingsRouter.get('/models', async (_req, res) => {
    try {
        const models = await getAvailableModels()
        res.json(models)
    } catch (e) {
        res.status(500).json({ error: (e as Error).message })
    }
})
