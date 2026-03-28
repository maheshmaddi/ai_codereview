'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PhaseStepper } from '@/components/phase-stepper'
import { FileUpload } from '@/components/file-upload'
import { QAPanel } from '@/components/qa-panel'
import { RevisionSelector } from '@/components/revision-selector'
import { PlanViewer } from '@/components/plan-viewer'
import { PhaseComments } from '@/components/phase-comments'
import { SSELog } from '@/components/sse-log'
import type {
  Feature, PhaseRevisionSummary, PhaseRevision,
  PhaseQuestion, PhaseComment, UploadedFile
} from '@/lib/api'
import { API_BASE } from '@/lib/api'

type Tab = 'qa' | 'plan' | 'comments'

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

export default function ArchitecturePage() {
  const params = useParams()
  const projectId = decodeURIComponent(params.projectId as string)
  const featureId = params.featureId as string

  const [feature, setFeature] = useState<Feature | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [questions, setQuestions] = useState<PhaseQuestion[]>([])
  const [revisions, setRevisions] = useState<PhaseRevisionSummary[]>([])
  const [activeVersion, setActiveVersion] = useState<number | null>(null)
  const [activeRevision, setActiveRevision] = useState<PhaseRevision | null>(null)
  const [comments, setComments] = useState<PhaseComment[]>([])
  const [tab, setTab] = useState<Tab>('qa')
  const [logLines, setLogLines] = useState<Array<{ type: string; message: string }>>([])
  const [busy, setBusy] = useState(false)
  const [architectComments, setArchitectComments] = useState('')

  const addLog = (type: string, message: string) => setLogLines((prev) => [...prev, { type, message }])

  const loadFeature = useCallback(async () => {
    const [fRes, filesRes, questionsRes, revisionsRes, commentsRes] = await Promise.all([
      fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}`),
      fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/uploaded-files`),
      fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/questions`),
      fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/revisions`),
      fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/comments?phase=architecture`),
    ])
    if (fRes.ok) setFeature(await fRes.json())
    if (filesRes.ok) setUploadedFiles(await filesRes.json())
    if (questionsRes.ok) setQuestions(await questionsRes.json())
    if (revisionsRes.ok) {
      const revs: PhaseRevisionSummary[] = await revisionsRes.json()
      setRevisions(revs)
      if (revs.length > 0 && activeVersion === null) {
        const latest = revs[revs.length - 1].version
        setActiveVersion(latest)
      }
    }
    if (commentsRes.ok) setComments(await commentsRes.json())
  }, [projectId, featureId, activeVersion])

  useEffect(() => { loadFeature() }, [])

  useEffect(() => {
    if (activeVersion == null) return
    fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/revisions/${activeVersion}`)
      .then((r) => r.ok ? r.json() : null)
      .then((rev) => setActiveRevision(rev))
  }, [activeVersion, projectId, featureId])

  async function handleAnalyze() {
    if (uploadedFiles.length === 0) { alert('Please upload a requirement document first'); return }
    setBusy(true)
    setLogLines([])
    setTab('qa')
    const stop = streamSSE(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/analyze`,
      (e) => {
        addLog(e.type as string, (e.message as string) ?? JSON.stringify(e))
        if (e.type === 'done' || e.type === 'error') {
          setBusy(false)
          loadFeature()
        }
      }
    )
    setTimeout(stop, 10 * 60 * 1000) // 10 min max
  }

  async function handleGeneratePlan() {
    setBusy(true)
    setLogLines([])
    const stop = streamSSE(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/generate-plan`,
      (e) => {
        addLog(e.type as string, (e.message as string) ?? JSON.stringify(e))
        if (e.type === 'done') {
          setBusy(false)
          const v = e.version as number
          setActiveVersion(v)
          setTab('plan')
          loadFeature()
        }
        if (e.type === 'error') { setBusy(false) }
      }
    )
    setTimeout(stop, 10 * 60 * 1000)
  }

  async function handleRevise() {
    if (!architectComments.trim()) { alert('Please add revision comments'); return }
    await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/revise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments: architectComments.trim() }),
    })
    setArchitectComments('')
    loadFeature()
  }

  async function handleApprove() {
    if (!confirm('Approve this architecture plan and move to Development?')) return
    await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/architecture/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    })
    loadFeature()
  }

  const allQuestionsAnswered = questions.length > 0 && questions.every((q) => q.answer)
  const hasRevisions = revisions.length > 0
  const latestStatus = revisions[revisions.length - 1]?.status
  const isApproved = feature?.arch_approved === 1

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

      <div className="phase-layout">
        {/* ── Left Sidebar ── */}
        <div className="phase-sidebar">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Requirement Document</h3>
            <FileUpload
              projectId={projectId}
              featureId={featureId}
              uploadedFiles={uploadedFiles}
              onUploadComplete={setUploadedFiles}
            />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                onClick={handleAnalyze}
                disabled={busy || uploadedFiles.length === 0}
              >
                {busy ? 'Analyzing…' : 'Analyze Requirements'}
              </button>
            </div>
          </div>

          {hasRevisions && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Revisions</h3>
              <RevisionSelector
                revisions={revisions}
                activeVersion={activeVersion}
                onSelect={(v) => { setActiveVersion(v); setTab('plan') }}
              />
            </div>
          )}

          {isApproved && (
            <div className="card" style={{ marginTop: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#15803d', fontWeight: 600 }}>
                ✅ Architecture Approved
              </p>
              <Link
                className="btn primary"
                href={`/projects/${encodeURIComponent(projectId)}/features/${featureId}/development`}
                style={{ marginTop: 8, display: 'inline-block' }}
              >
                Go to Development →
              </Link>
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div>
          {/* Tabs */}
          <div className="phase-tabs">
            <button className={`phase-tab${tab === 'qa' ? ' phase-tab--active' : ''}`} onClick={() => setTab('qa')}>
              Q&A {questions.length > 0 && `(${questions.filter(q => !q.answer).length} pending)`}
            </button>
            <button className={`phase-tab${tab === 'plan' ? ' phase-tab--active' : ''}`} onClick={() => setTab('plan')} disabled={!hasRevisions}>
              Architecture Plan {hasRevisions ? `(v${activeVersion})` : ''}
            </button>
            <button className={`phase-tab${tab === 'comments' ? ' phase-tab--active' : ''}`} onClick={() => setTab('comments')}>
              Comments ({comments.length})
            </button>
          </div>

          {tab === 'qa' && (
            <div>
              <QAPanel
                questions={questions}
                projectId={projectId}
                featureId={featureId}
                onAnswered={setQuestions}
              />
              {allQuestionsAnswered && (
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <button className="btn primary" onClick={handleGeneratePlan} disabled={busy}>
                    {busy ? 'Generating…' : `Generate Architecture Plan ${hasRevisions ? `(v${revisions.length + 1})` : '(v1)'}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'plan' && (
            <div>
              <PlanViewer revision={activeRevision} />
              {!isApproved && hasRevisions && (
                <div className="phase-actions">
                  <textarea
                    placeholder="Architect comments (required for revision request)…"
                    value={architectComments}
                    onChange={(e) => setArchitectComments(e.target.value)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      className="btn"
                      onClick={handleRevise}
                      disabled={busy || !architectComments.trim()}
                      title="Request a revised plan"
                    >
                      ↩ Send for Revision
                    </button>
                    <button
                      className="btn primary"
                      onClick={handleApprove}
                      disabled={busy || latestStatus === 'revision_requested'}
                    >
                      ✓ Approve Plan
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
              phase="architecture"
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
