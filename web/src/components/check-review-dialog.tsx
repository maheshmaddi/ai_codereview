'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type EventLine = {
  id: number
  type: string
  message: string
}

type PRInfo = {
  number?: number
  pr_number?: number
  title?: string
  pr_title?: string
  html_url?: string
  updated_at?: string
}

type PRStatus = {
  pr_number: number
  pr_title: string
  status: 'pending_review' | 'already_reviewed' | 'triggered'
  reviewed_at?: string
  session_id?: string
  review_id?: string
  error?: string
}

type Phase = 'idle' | 'checking' | 'ready' | 'triggering' | 'done' | 'error'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface CheckReviewDialogProps {
  projectId: string
  projectName: string
}

export function CheckReviewDialog({ projectId, projectName }: CheckReviewDialogProps) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [lines, setLines] = useState<EventLine[]>([])
  const [prsFound, setPrsFound] = useState<PRInfo[]>([])
  const [prsToReview, setPrsToReview] = useState<PRInfo[]>([])
  const [prStatuses, setPrStatuses] = useState<Map<number, PRStatus>>(new Map())
  const [stats, setStats] = useState({ total: 0, withLabel: 0, reviewed: 0 })
  const [triggerLabel, setTriggerLabel] = useState('ai_codereview')
  const logRef = useRef<HTMLDivElement>(null)
  const lineId = useRef(0)

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines])

  const addLine = (type: string, message: string) => {
    setLines((prev) => [...prev, { id: lineId.current++, type, message }])
  }

  const handleCheck = async () => {
    setPhase('checking')
    setLines([])
    setPrsFound([])
    setPrsToReview([])
    setPrStatuses(new Map())
    setStats({ total: 0, withLabel: 0, reviewed: 0 })

    try {
      const response = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/check-prs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_trigger: false }),
        }
      )

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        addLine('error', err.error ?? 'Request failed')
        setPhase('error')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const event = JSON.parse(line)
            handleEvent(event)
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e) {
      addLine('error', (e as Error).message)
      setPhase('error')
    }
  }

   const handleEvent = (event: any) => {
     switch (event.type) {
       case 'status':
         addLine('status', event.message)
         break

       case 'info':
         addLine('info', event.message)
         break

       case 'cli_output':
        // CLI output from the review process
        addLine('cli', `[PR #${event.pr_number}] ${event.message}`)
        break

      case 'prs_found':
        setPrsFound(event.prs || [])
        setStats({
          total: event.total || 0,
          withLabel: event.with_label || 0,
          reviewed: 0,
        })
        setTriggerLabel(event.label || 'ai_codereview')
        addLine('info', `Found ${event.with_label} PR(s) with label "${event.label}"`)
        break

      case 'pr_status':
        setPrStatuses((prev) => {
          const next = new Map(prev)
          next.set(event.pr_number, {
            pr_number: event.pr_number,
            pr_title: event.pr_title,
            status: event.status,
            reviewed_at: event.reviewed_at,
          })
          return next
        })
        if (event.status === 'pending_review') {
          setPrsToReview((prev) => [
            ...prev,
            { number: event.pr_number, title: event.pr_title, html_url: '', updated_at: '' },
          ])
        }
        const prNum = event.pr_number
        const prTitle = event.pr_title

        addLine(
          event.status === 'already_reviewed' ? 'info' : 'success',
          `PR #${prNum}: ${prTitle} — ${event.status.replace('_', ' ')}`
        )
        break

      case 'review_triggered':
        setPrStatuses((prev) => {
          const next = new Map(prev)
          const existing = next.get(event.pr_number)
          if (existing) {
            next.set(event.pr_number, {
              ...existing,
              status: 'triggered',
              session_id: event.session_id,
              review_id: event.review_id,
            })
          }
          return next
        })
        addLine('success', `✅ PR #${event.pr_number}: Review triggered successfully`)
        break

      case 'review_error':
        addLine('error', `❌ PR #${event.pr_number}: ${event.error}`)
        break

       case 'done':
         setPhase('ready')
         addLine('done', event.message)
         // Set prsToReview from the prs_to_review array
         if (event.prs_to_review) {
           setPrsToReview(event.prs_to_review)
         }
         break

      case 'error':
        addLine('error', event.message)
        setPhase('error')
        break
    }
  }

   const handleTriggerReviews = async () => {
     if (prsToReview.length === 0) return

     setPhase('triggering')
     addLine('status', 'Starting reviews for pending PRs with live CLI output...')

     try {
       const response = await fetch(
         `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/review-prs-stream`,
         {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             prs: prsToReview.map((pr: any) => ({
               number: pr.pr_number || pr.number,
               title: pr.pr_title || pr.title,
               html_url: pr.html_url || '',
               updated_at: pr.updated_at || ''
             }))
           }),
         }
       )

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        addLine('error', err.error ?? 'Request failed')
        setPhase('error')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let successCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const event = JSON.parse(line)
            handleTriggerEvent(event, () => { successCount++ })
          } catch {
            // ignore parse errors
          }
        }
      }

      setStats((prev) => ({ ...prev, reviewed: successCount }))
      setPhase('done')
    } catch (e) {
      addLine('error', (e as Error).message)
      setPhase('error')
    }
  }

  const handleTriggerEvent = (event: any, onSuccess: () => void) => {
    switch (event.type) {
      case 'status':
        addLine('status', event.message)
        break

      case 'cli_output':
        // CLI output from the review process
        addLine('cli', `[PR #${event.pr_number}] ${event.message}`)
        break

      case 'review_triggered':
        setPrStatuses((prev) => {
          const next = new Map(prev)
          const existing = next.get(event.pr_number)
          if (existing) {
            next.set(event.pr_number, {
              ...existing,
              status: 'triggered',
              session_id: event.session_id,
              review_id: event.review_id,
            })
          }
          return next
        })
        addLine('success', `✅ PR #${event.pr_number}: Review completed successfully`)
        onSuccess()
        break

      case 'review_error':
        setPrStatuses((prev) => {
          const next = new Map(prev)
          const existing = next.get(event.pr_number)
          if (existing) {
            next.set(event.pr_number, {
              ...existing,
              status: 'pending_review',
              error: event.error,
            })
          }
          return next
        })
        addLine('error', `❌ PR #${event.pr_number}: ${event.error}`)
        break

      case 'done':
        addLine('done', event.message)
        break

      case 'error':
        addLine('error', event.message)
        setPhase('error')
        break
    }
  }

  const handleClose = () => {
    if (phase === 'checking' || phase === 'triggering') return
    setOpen(false)
    setPhase('idle')
    setLines([])
    setPrsFound([])
    setPrsToReview([])
    setPrStatuses(new Map())
  }

  const lineColor = (type: string) => {
    if (type === 'error') return '#ef4444'
    if (type === 'done' || type === 'success') return '#22c55e'
    if (type === 'info') return '#3b82f6'
    if (type === 'cli') return '#a78bfa' // Purple for CLI output
    return '#e2e8f0'
  }

  const canTrigger = phase === 'ready' && prsToReview.length > 0

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>
        🔍 Check for Code Review
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 800,
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Check for Code Review</h2>
                <p className="muted" style={{ margin: '4px 0 0 0', fontSize: 14 }}>
                  {projectName}
                </p>
              </div>
              <button
                className="btn"
                onClick={handleClose}
                disabled={phase === 'checking' || phase === 'triggering'}
                style={{ padding: '4px 10px' }}
              >
                ✕
              </button>
            </div>

            {/* Stats summary */}
            {(phase === 'ready' || phase === 'triggering' || phase === 'done') && stats.total > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    background: '#f1f5f9',
                    padding: 12,
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.total}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Open PRs
                  </div>
                </div>
                <div
                  style={{
                    background: '#eff6ff',
                    padding: 12,
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 600, color: '#3b82f6' }}>
                    {stats.withLabel}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    With &quot;{triggerLabel}&quot; Label
                  </div>
                </div>
                <div
                  style={{
                    background: '#f0fdf4',
                    padding: 12,
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 600, color: '#22c55e' }}>
                    {stats.reviewed}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Reviews Triggered
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {phase === 'idle' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn primary" onClick={handleCheck}>
                  Check for Open PRs
                </button>
              </div>
            )}

            {(phase === 'ready' || phase === 'done') && canTrigger && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <strong>{prsToReview.length} PR(s)</strong> ready for review
                </div>
                {phase === 'ready' && (
                  <button className="btn primary" onClick={handleTriggerReviews}>
                    🚀 Start Reviews
                  </button>
                )}
              </div>
            )}

            {/* PR Status List */}
            {prStatuses.size > 0 && (
              <div
                style={{
                  maxHeight: 200,
                  overflow: 'auto',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                }}
              >
                {Array.from(prStatuses.values()).map((pr) => (
                  <div
                    key={pr.pr_number}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>#{pr.pr_number}</div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {pr.pr_title}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {pr.status === 'triggered' && pr.review_id && (
                        <Link
                          href={`/projects/${encodeURIComponent(projectId)}/history`}
                          className="btn"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={handleClose}
                        >
                          View →
                        </Link>
                      )}
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          background:
                            pr.status === 'triggered'
                              ? '#dcfce7'
                              : pr.status === 'already_reviewed'
                              ? '#f1f5f9'
                              : '#fef3c7',
                          color:
                            pr.status === 'triggered'
                              ? '#166534'
                              : pr.status === 'already_reviewed'
                              ? '#475569'
                              : '#92400e',
                        }}
                      >
                        {pr.status === 'triggered'
                          ? 'Review Started'
                          : pr.status === 'already_reviewed'
                          ? 'Already Reviewed'
                          : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Log output */}
            {lines.length > 0 && (
              <div
                ref={logRef}
                style={{
                  background: '#0f172a',
                  borderRadius: 8,
                  padding: 12,
                  height: 200,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {lines.map((l) => (
                  <div key={l.id} style={{ color: lineColor(l.type), wordBreak: 'break-all' }}>
                    <span style={{ color: '#475569', marginRight: 6 }}>[{l.type}]</span>
                    {l.message}
                  </div>
                ))}
                {(phase === 'checking' || phase === 'triggering') && (
                  <div style={{ color: '#fbbf24', marginTop: 4 }}>⏳ Processing...</div>
                )}
              </div>
            )}

            {/* Done state */}
            {phase === 'done' && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#15803d', fontWeight: 600 }}>
                  ✅ Reviews initiated successfully!
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link
                    href={`/projects/${encodeURIComponent(projectId)}/history`}
                    className="btn primary"
                    onClick={handleClose}
                  >
                    View History →
                  </Link>
                  <button className="btn" onClick={handleClose}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Error state */}
            {phase === 'error' && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#dc2626' }}>
                  ❌ An error occurred. Check the log above.
                </span>
                <button className="btn" onClick={() => setPhase('idle')}>
                  Try Again
                </button>
              </div>
            )}

            {/* Ready with nothing to do */}
            {phase === 'ready' && prsToReview.length === 0 && (
              <div
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#475569' }}>
                  📭 No new PRs to review. All PRs with the &quot;{triggerLabel}&quot; label have been
                  reviewed.
                </span>
                <button className="btn" onClick={handleClose}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
