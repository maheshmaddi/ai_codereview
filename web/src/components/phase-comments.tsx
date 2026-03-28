'use client'

import { useState } from 'react'
import type { PhaseComment } from '@/lib/api'
import { API_BASE } from '@/lib/api'

interface PhaseCommentsProps {
  comments: PhaseComment[]
  projectId: string
  featureId: string
  phase: string
  onAdded: (comments: PhaseComment[]) => void
  revisionVersion?: number
}

export function PhaseComments({ comments, projectId, featureId, phase, onAdded, revisionVersion }: PhaseCommentsProps) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase, content: draft.trim(), revision_version: revisionVersion }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      const listRes = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/comments?phase=${encodeURIComponent(phase)}`
      )
      if (listRes.ok) onAdded(await listRes.json())
      setDraft('')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="comment-thread">
        {comments.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="comment-item">
            <div className="comment-avatar">{c.author === 'user' ? 'U' : 'AI'}</div>
            <div className="comment-body">
              <div className="comment-meta">
                {c.author} · {new Date(c.created_at).toLocaleString()}
              </div>
              {c.content}
            </div>
          </div>
        ))}
      </div>
      <div className="comment-input-row">
        <textarea
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" onClick={submit} disabled={saving || !draft.trim()}>
          {saving ? 'Saving…' : 'Comment'}
        </button>
      </div>
    </div>
  )
}
