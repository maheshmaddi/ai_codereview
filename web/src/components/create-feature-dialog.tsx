'use client'

import { useState } from 'react'
import { createFeature } from '@/lib/api'
import { useRouter } from 'next/navigation'

interface CreateFeatureDialogProps {
  projectId: string
}

export function CreateFeatureDialog({ projectId }: CreateFeatureDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const feature = await createFeature(projectId, name.trim())
      router.push(`/projects/${encodeURIComponent(projectId)}/features/${feature.id}/architecture`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        + New Feature
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div className="card" style={{ width: 420, maxWidth: '92vw' }}>
        <h3 style={{ marginTop: 0 }}>New Feature</h3>
        <p className="muted">Give this feature a descriptive name. You'll upload the requirement document next.</p>
        <input
          className="input"
          placeholder="e.g. User Authentication via OAuth"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</p>}
        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create Feature'}
          </button>
          <button className="btn" onClick={() => { setOpen(false); setName('') }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
