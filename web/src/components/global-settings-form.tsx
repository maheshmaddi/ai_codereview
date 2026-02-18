'use client'

import { useState, useEffect } from 'react'
import type { ModelOption } from '@/lib/api'
import { getGlobalSettings, updateGlobalSettings, getAvailableModels } from '@/lib/api'

export function GlobalSettingsForm() {
    const [reviewModel, setReviewModel] = useState('')
    const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState('')

    // Fetch current settings AND available models on mount (always fresh)
    useEffect(() => {
        Promise.all([getGlobalSettings(), getAvailableModels()])
            .then(([settings, models]) => {
                setReviewModel(settings.review_model)
                setAvailableModels(models)
            })
            .catch((err) => {
                console.error('Failed to load settings:', err)
            })
            .finally(() => setLoading(false))
    }, [])

    const save = async () => {
        setStatus('Saving...')
        try {
            await updateGlobalSettings({ review_model: reviewModel })
            setStatus('Saved ✓')
        } catch (error) {
            setStatus(`Save failed: ${(error as Error).message}`)
        }
    }

    if (loading) {
        return <div className="muted">Loading settings...</div>
    }

    return (
        <div className="card">
            <div className="list">
                <label>
                    <div className="muted">Review Model</div>
                    {availableModels.length > 0 ? (
                        <select className="select" value={reviewModel} onChange={(e) => setReviewModel(e.target.value)}>
                            {availableModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.name} ({model.provider})
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            className="input"
                            value={reviewModel}
                            onChange={(e) => setReviewModel(e.target.value)}
                            placeholder="e.g., anthropic/claude-sonnet-4-20250514"
                        />
                    )}
                </label>
            </div>
            <div className="toolbar">
                <button className="btn primary" onClick={save}>Save Settings</button>
                {status && <span className="muted">{status}</span>}
            </div>
        </div>
    )
}
