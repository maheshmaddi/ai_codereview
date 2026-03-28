'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PhaseStepper } from '@/components/phase-stepper'
import { DevelopmentProgress } from '@/components/development-progress'
import { PhaseComments } from '@/components/phase-comments'
import { SSELog } from '@/components/sse-log'
import type { Feature, DevelopmentStep, PhaseComment } from '@/lib/api'
import { API_BASE } from '@/lib/api'

type Tab = 'progress' | 'summary' | 'comments'

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

export default function DevelopmentPage() {
  const params = useParams()
  const projectId = decodeURIComponent(params.projectId as string)
  const featureId = params.featureId as string

  const [feature, setFeature] = useState<Feature | null>(null)
  const [steps, setSteps] = useState<DevelopmentStep[]>([])
  const [branchName, setBranchName] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [comments, setComments] = useState<PhaseComment[]>([])
  const [tab, setTab] = useState<Tab>('progress')
  const [logLines, setLogLines] = useState<Array<{ type: string; message: string }>>([])
  const [busy, setBusy] = useState(false)
  const [changeRequest, setChangeRequest] = useState('')

  const addLog = (type: string, message: string) => setLogLines((prev) => [...prev, { type, message }])

  const loadData = useCallback(async () => {
    try {
      const enc = encodeURIComponent(projectId)
      const [fRes, statusRes, summaryRes, commentsRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}`),
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}/development/status`),
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}/development/summary`),
        fetch(`${API_BASE}/api/projects/${enc}/features/${featureId}/comments?phase=development`),
      ])
      if (fRes.ok) setFeature(await fRes.json())
      if (statusRes.ok) {
        const data = await statusRes.json()
        setSteps(data.steps ?? [])
        setBranchName(data.branch_name)
      }
      if (summaryRes.ok) { const d = await summaryRes.json(); setSummary(d.summary) }
      if (commentsRes.ok) setComments(await commentsRes.json())
    } catch (err) {
      console.error('Failed to load development data:', err)
    }
  }, [projectId, featureId])

  useEffect(() => { loadData() }, [])

  async function handleStart() {
    setBusy(true)
    setLogLines([])
    setTab('progress')
    const stop = streamSSE(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/development/start`,
      (e) => {
        addLog(e.type as string, (e.message as string) ?? JSON.stringify(e))
        if (e.type === 'step_update') loadData()
        if (e.type === 'done' || e.type === 'error') {
          setBusy(false)
          loadData()
          if (e.type === 'done') setTab('summary')
        }
      }
    )
    setTimeout(stop, 30 * 60 * 1000) // 30 min max
  }

  async function handleRequestChanges() {
    if (!changeRequest.trim()) { alert('Please describe the changes needed'); return }
    await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/development/request-changes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments: changeRequest.trim() }),
    })
    setChangeRequest('')
    loadData()
  }

  async function handleApprove() {
    if (!confirm('Approve development and move to Testing?')) return
    await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/development/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    })
    loadData()
  }

  const isApproved = feature?.dev_approved === 1
  const hasSteps = steps.length > 0
  const allDone = hasSteps && steps.every((s) => s.status === 'completed')

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

      {feature && !feature.arch_approved && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fbbf24', marginBottom: 12 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: 14 }}>
            ⚠️ Architecture must be approved before starting development.{' '}
            <Link href={`/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture`} style={{ color: '#2563eb' }}>
              Go to Architecture →
            </Link>
          </p>
        </div>
      )}

      <div className="phase-tabs">
        <button className={`phase-tab${tab === 'progress' ? ' phase-tab--active' : ''}`} onClick={() => setTab('progress')}>
          Progress
        </button>
        <button className={`phase-tab${tab === 'summary' ? ' phase-tab--active' : ''}`} onClick={() => setTab('summary')} disabled={!summary}>
          Change Summary
        </button>
        <button className={`phase-tab${tab === 'comments' ? ' phase-tab--active' : ''}`} onClick={() => setTab('comments')}>
          Comments ({comments.length})
        </button>
      </div>

      {tab === 'progress' && (
        <div>
          <DevelopmentProgress steps={steps} branchName={branchName} />
          {!hasSteps && feature?.arch_approved === 1 && (
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={handleStart} disabled={busy}>
                {busy ? 'Running…' : '▶ Start Development'}
              </button>
            </div>
          )}
          {hasSteps && !allDone && !busy && (
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={handleStart} disabled={busy}>
                ↺ Re-run Development
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'summary' && summary && (
        <div>
          <div className="card markdown-body" style={{ lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
          {!isApproved && allDone && (
            <div className="phase-actions">
              <textarea
                placeholder="Request changes (describe what needs to be fixed)…"
                value={changeRequest}
                onChange={(e) => setChangeRequest(e.target.value)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn" onClick={handleRequestChanges} disabled={busy || !changeRequest.trim()}>
                  ↩ Request Changes
                </button>
                <button className="btn primary" onClick={handleApprove} disabled={busy}>
                  ✓ Approve & Proceed
                </button>
              </div>
            </div>
          )}
          {isApproved && (
            <div className="card" style={{ marginTop: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#15803d', fontWeight: 600 }}>
                ✅ Development Approved
              </p>
              <Link
                className="btn primary"
                href={`/projects/${encodeURIComponent(projectId)}/features/${featureId}/testing`}
                style={{ marginTop: 8, display: 'inline-block' }}
              >
                Go to Testing →
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === 'comments' && (
        <PhaseComments
          comments={comments}
          projectId={projectId}
          featureId={featureId}
          phase="development"
          onAdded={setComments}
        />
      )}

      {logLines.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <SSELog lines={logLines} />
        </div>
      )}
    </div>
  )
}
