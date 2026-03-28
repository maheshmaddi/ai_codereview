'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PhaseStepper } from '@/components/phase-stepper'
import { RevisionSelector } from '@/components/revision-selector'
import { PlanViewer } from '@/components/plan-viewer'
import { PhaseComments } from '@/components/phase-comments'
import { SSELog } from '@/components/sse-log'
import type { Feature, PhaseRevisionSummary, PhaseRevision, PhaseComment } from '@/lib/api'
import { API_BASE } from '@/lib/api'

type Tab = 'plan' | 'comments'

function streamSSE(url: string, onEvent: (e: { type: string; [k: string]: unknown }) => void): () => void {
  let stopped = false
  ;(async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (!stopped) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim()
        if (line) { try { onEvent(JSON.parse(line)) } catch { } }
      }
    }
  })()
  return () => { stopped = true }
}

export default function TestingPage() {
  const params = useParams()
  const projectId = decodeURIComponent(params.projectId as string)
  const featureId = params.featureId as string

  const [feature, setFeature] = useState<Feature | null>(null)
  const [revisions, setRevisions] = useState<PhaseRevisionSummary[]>([])
  const [activeVersion, setActiveVersion] = useState<number | null>(null)
  const [activeRevision, setActiveRevision] = useState<PhaseRevision | null>(null)
  const [comments, setComments] = useState<PhaseComment[]>([])
  const [tab, setTab] = useState<Tab>('plan')
  const [logLines, setLogLines] = useState<Array<{ type: string; message: string }>>([])
  const [busy, setBusy] = useState(false)
  const [reviseComments, setReviseComments] = useState('')

  const addLog = (type: string, message: string) => setLogLines((prev) => [...prev, { type, message }])

  const loadData = useCallback(async () => {
    try {
      const enc = encodeURIComponent(projectId)
      const [fRes, revisionsRes, commentsRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}`),
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}/testing/revisions`),
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}/comments?phase=testing`),
      ])
      if (fRes.ok) setFeature(await fRes.json())
      if (revisionsRes.ok) {
        const revs: PhaseRevisionSummary[] = await revisionsRes.json()
        setRevisions(revs)
        if (revs.length > 0 && activeVersion === null) {
          setActiveVersion(revs[revs.length - 1].version)
        }
      }
      if (commentsRes.ok) setComments(await commentsRes.json())
    } catch (err) {
      console.error('Failed to load testing data:', err)
    }
  }, [projectId, featureId, activeVersion])

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (activeVersion == null) return
    fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/testing/revisions/${activeVersion}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setActiveRevision)
  }, [activeVersion, projectId, featureId])

  async function handleGeneratePlan() {
    setBusy(true)
    setLogLines([])
    const stop = streamSSE(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/testing/generate-plan`,
      (e) => {
        addLog(e.type as string, (e.message as string) ?? JSON.stringify(e))
        if (e.type === 'done') {
          setBusy(false)
          setActiveVersion(e.version as number)
          setTab('plan')
          loadData()
        }
        if (e.type === 'error') setBusy(false)
      }
    )
    setTimeout(stop, 10 * 60 * 1000)
  }

  async function handleRevise() {
    if (!reviseComments.trim()) { alert('Please add revision comments'); return }
    await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/testing/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments: reviseComments.trim() }),
    })
    setReviseComments('')
    loadData()
  }

  async function handleApprove() {
    if (!confirm('Approve test plan and generate test code?')) return
    setBusy(true)
    setLogLines([])
    const stop = streamSSE(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/testing/approve`,
      (e) => {
        addLog(e.type as string, (e.message as string) ?? JSON.stringify(e))
        if (e.type === 'done' || e.type === 'error') {
          setBusy(false)
          loadData()
        }
      }
    )
    setTimeout(stop, 20 * 60 * 1000)
  }

  const isCompleted = feature?.current_phase === 'completed'
  const hasRevisions = revisions.length > 0
  const latestStatus = revisions[revisions.length - 1]?.status

  return (
    <div>
      <div className="hero" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">{feature?.name ?? 'Loading…'}</h1>
          <p className="muted">{projectId}</p>
        </div>
        <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}/features`}>
          ← Features
        </Link>
      </div>

      {feature && <PhaseStepper projectId={projectId} featureId={featureId} feature={feature} />}

      {feature && !feature.dev_approved && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fbbf24', marginBottom: 12 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: 14 }}>
            ⚠️ Development must be approved before generating the test plan.{' '}
            <Link href={`/projects/${encodeURIComponent(projectId)}/features/${featureId}/development`} style={{ color: '#2563eb' }}>
              Go to Development →
            </Link>
          </p>
        </div>
      )}

      <div className="phase-layout">
        {/* ── Left Sidebar ── */}
        <div className="phase-sidebar">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Test Plan</h3>
            {!hasRevisions && feature?.dev_approved === 1 && (
              <button className="btn primary" onClick={handleGeneratePlan} disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Generating…' : '⚡ Generate Test Plan'}
              </button>
            )}
            {hasRevisions && (
              <button className="btn" onClick={handleGeneratePlan} disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Generating…' : `↺ Regenerate (v${revisions.length + 1})`}
              </button>
            )}
          </div>

          {hasRevisions && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Revisions</h3>
              <RevisionSelector
                revisions={revisions}
                activeVersion={activeVersion}
                onSelect={setActiveVersion}
              />
            </div>
          )}

          {isCompleted && (
            <div className="card" style={{ marginTop: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#15803d', fontWeight: 600 }}>
                🎉 Feature Completed!
              </p>
              <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                All phases approved. Tests generated and pushed to branch.
              </p>
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div>
          <div className="phase-tabs">
            <button className={`phase-tab${tab === 'plan' ? ' phase-tab--active' : ''}`} onClick={() => setTab('plan')}>
              Test Plan {hasRevisions && `(v${activeVersion})`}
            </button>
            <button className={`phase-tab${tab === 'comments' ? ' phase-tab--active' : ''}`} onClick={() => setTab('comments')}>
              Comments ({comments.length})
            </button>
          </div>

          {tab === 'plan' && (
            <div>
              <PlanViewer revision={activeRevision} />
              {!isCompleted && hasRevisions && (
                <div className="phase-actions">
                  <textarea
                    placeholder="Developer comments for revision (required for revision request)…"
                    value={reviseComments}
                    onChange={(e) => setReviseComments(e.target.value)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      className="btn"
                      onClick={handleRevise}
                      disabled={busy || !reviseComments.trim()}
                    >
                      ↩ Revise Test Plan
                    </button>
                    <button
                      className="btn primary"
                      onClick={handleApprove}
                      disabled={busy || latestStatus === 'revision_requested'}
                    >
                      ✓ Approve & Generate Tests
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'comments' && (
            <PhaseComments
              comments={comments}
              projectId={projectId}
              featureId={featureId}
              phase="testing"
              onAdded={setComments}
              revisionVersion={activeVersion ?? undefined}
            />
          )}

          {logLines.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <SSELog lines={logLines} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
