'use client'

import { useState, useEffect } from 'react'
import { Send } from 'lucide-react'
import type { PhaseComment } from '@/lib/api'
import { getComments, addComment } from '@/lib/api'

interface Props {
  featureId: string
  phase: string
}

export function PhaseComments({ featureId, phase }: Props) {
  const [comments, setComments] = useState<PhaseComment[]>([])
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const data = await getComments(featureId, phase)
      setComments(data)
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [featureId, phase])

  const handleSubmit = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await addComment(featureId, phase, text.trim())
      setText('')
      await load()
    } catch (e) {
      console.error('Failed to add comment:', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="phase-comments">
      <h4>Comments</h4>
      <div className="phase-comments__list">
        {comments.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="phase-comments__item">
            <div className="phase-comments__meta">
              <strong>{c.author}</strong>
              <span className="muted">{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <p>{c.content}</p>
          </div>
        ))}
      </div>
      <div className="phase-comments__input">
        <input
          className="input"
          placeholder="Add a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={submitting}
        />
        <button className="btn primary" disabled={!text.trim() || submitting} onClick={handleSubmit}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
