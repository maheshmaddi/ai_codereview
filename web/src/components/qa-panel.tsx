'use client'

import { useState } from 'react'
import { MessageCircle, CheckCircle } from 'lucide-react'
import type { PhaseQuestion } from '@/lib/api'
import { answerQuestion } from '@/lib/api'

interface Props {
  featureId: string
  questions: PhaseQuestion[]
  onAnswered?: () => void
}

export function QAPanel({ featureId, questions, onAnswered }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState<number | null>(null)

  const handleSubmit = async (questionId: number) => {
    const answer = answers[questionId]?.trim()
    if (!answer) return

    setSubmitting(questionId)
    try {
      await answerQuestion(featureId, questionId, answer)
      setAnswers((prev) => ({ ...prev, [questionId]: '' }))
      onAnswered?.()
    } catch (e) {
      console.error('Failed to submit answer:', e)
    } finally {
      setSubmitting(null)
    }
  }

  const allAnswered = questions.length > 0 && questions.every((q) => q.answer)

  return (
    <div className="qa-panel">
      {questions.map((q) => (
        <div key={q.id} className={`qa-item ${q.answer ? 'qa-item--answered' : 'qa-item--pending'}`}>
          <div className="qa-item__question">
            <MessageCircle size={16} />
            <span>{q.question}</span>
          </div>
          {q.answer ? (
            <div className="qa-item__answer">
              <CheckCircle size={14} style={{ color: '#16a34a' }} />
              <span>{q.answer}</span>
            </div>
          ) : (
            <div className="qa-item__input">
              <input
                className="input"
                placeholder="Type your answer..."
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(q.id)}
                disabled={submitting === q.id}
              />
              <button
                className="btn primary"
                disabled={!answers[q.id]?.trim() || submitting === q.id}
                onClick={() => handleSubmit(q.id)}
              >
                {submitting === q.id ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          )}
        </div>
      ))}
      {questions.length === 0 && (
        <p className="muted">No questions yet. Upload a requirement and run analysis.</p>
      )}
      {allAnswered && (
        <div className="qa-panel__complete">
          <CheckCircle size={16} style={{ color: '#16a34a' }} />
          All questions answered — ready to generate plan
        </div>
      )}
    </div>
  )
}
