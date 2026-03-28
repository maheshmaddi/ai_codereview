'use client'

import { useState } from 'react'
import type { PhaseQuestion } from '@/lib/api'
import { API_BASE } from '@/lib/api'

interface QAPanelProps {
  questions: PhaseQuestion[]
  projectId: string
  featureId: string
  onAnswered: (questions: PhaseQuestion[]) => void
  readonly?: boolean
}

export function QAPanel({ questions, projectId, featureId, onAnswered, readonly }: QAPanelProps) {
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  const unansweredCount = questions.filter((q) => !q.answer).length
  const allAnswered = unansweredCount === 0 && questions.length > 0

  async function submit(q: PhaseQuestion) {
    const answer = drafts[q.id]?.trim()
    if (!answer) return
    setSaving((prev) => ({ ...prev, [q.id]: true }))
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/questions/${q.id}/answer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      // Re-fetch all questions
      const listRes = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/questions`
      )
      if (listRes.ok) onAnswered(await listRes.json())
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving((prev) => ({ ...prev, [q.id]: false }))
    }
  }

  if (questions.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 24 }}>
        <p className="muted">No questions yet. Upload a requirement and run analysis first.</p>
      </div>
    )
  }

  return (
    <div className="qa-panel">
      {allAnswered && (
        <div className="card" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
          <p style={{ margin: 0, fontSize: 14, color: '#15803d' }}>
            ✅ All questions answered — you can now generate the architecture plan.
          </p>
        </div>
      )}
      {!allAnswered && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fbbf24' }}>
          <p style={{ margin: 0, fontSize: 14, color: '#92400e' }}>
            ⚠️ {unansweredCount} question{unansweredCount !== 1 ? 's' : ''} still need{unansweredCount === 1 ? 's' : ''} an answer before generating the plan.
          </p>
        </div>
      )}

      {questions.map((q, i) => (
        <div key={q.id} className={`qa-item ${q.answer ? 'qa-item--answered' : 'qa-item--unanswered'}`}>
          <div className="qa-question">
            <span className="qa-question__badge">
              {q.answer ? 'Answered' : 'Needs Answer'}
            </span>
            <span>Q{i + 1}: {q.question}</span>
          </div>
          <div className="qa-answer">
            {q.answer ? (
              <span className="qa-answer--text">✓ {q.answer}</span>
            ) : readonly ? (
              <span className="muted">Not yet answered</span>
            ) : (
              <>
                <textarea
                  className="input"
                  style={{ minHeight: 60, flex: 1 }}
                  placeholder="Type your answer…"
                  value={drafts[q.id] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
                <button
                  className="btn primary"
                  onClick={() => submit(q)}
                  disabled={saving[q.id] || !drafts[q.id]?.trim()}
                >
                  {saving[q.id] ? 'Saving…' : 'Submit'}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
