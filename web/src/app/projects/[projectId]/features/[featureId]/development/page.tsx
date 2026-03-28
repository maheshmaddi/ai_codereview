'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PhaseStepper } from '@/components/phase-stepper'
import { DevelopmentProgress } from '@/components/development-progress'
import { PhaseComments } from '@/components/phase-comments'
import {
  getFeature, getDevelopmentStatus, getDevelopmentSummary,
  startDevelopment, requestDevelopmentChanges, approveDevelopment,
  readSSE,
  type Feature, type DevelopmentStep,
} from '@/lib/api'

interface Props {
  params: { projectId: string; featureId: string }
}

export default function DevelopmentPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const { featureId } = params

  const [feature, setFeature] = useState<Feature | null>(null)
  const [steps, setSteps] = useState<DevelopmentStep[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [streamLog, setStreamLog] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'progress' | 'summary' | 'comments'>('progress')
  const [comments, setComments] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([
        getFeature(projectId, featureId),
        getDevelopmentStatus(featureId).catch(() => []),
      ])
      setFeature(f)
      setSteps(s)

      // Try loading summary
      const sumRes = await getDevelopmentSummary(featureId).catch(() => null)
      if (sumRes) setSummary(sumRes.summary)
    } catch (e) {
      console.error('Failed to load development data:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, featureId])

  useEffect(() => { loadData() }, [loadData])

  const handleStart = async () => {
    setStreaming(true)
    setStreamLog([])
    setActiveTab('progress')
    try {
      const res = await startDevelopment(featureId)
      await readSSE(res, (event) => {
        const msg = (event as { message?: string }).message
        const step = (event as { step?: string }).step
        if (msg) setStreamLog((prev) => [...prev, msg])
        if (step) {
          // Refresh steps on each step event
          getDevelopmentStatus(featureId).then((s) => setSteps(s)).catch(() => {})
        }
      })
      await loadData()
    } catch (e) {
      console.error('Development failed:', e)
    } finally {
      setStreaming(false)
    }
  }

  const handleRequestChanges = async () => {
    try {
      await requestDevelopmentChanges(featureId, comments)
      setComments('')
      await loadData()
    } catch (e) {
      console.error('Request changes failed:', e)
    }
  }

  const handleApprove = async () => {
    try {
      const updated = await approveDevelopment(featureId)
      setFeature(updated)
    } catch (e) {
      console.error('Approve failed:', e)
    }
  }

  const allCompleted = steps.length > 0 && steps.every((s) => s.status === 'completed')
  const isApproved = feature?.current_phase === 'testing' || feature?.current_phase === 'completed'
  const hasStarted = steps.length > 0

  if (loading) return <div className="muted" style={{ padding: 20 }}>Loading...</div>
  if (!feature) return <div className="muted" style={{ padding: 20 }}>Feature not found.</div>

  return (
    <div>
      <div className="hero">
        <div>
          <Link className="muted" href={`/projects/${encodeURIComponent(projectId)}/features`} style={{ fontSize: 13 }}>
            &larr; Back to features
          </Link>
          <h1 className="page-title">{feature.name}</h1>
          <p className="muted">Development Phase</p>
        </div>
      </div>

      <PhaseStepper projectId={projectId} featureId={featureId} currentPhase={feature.current_phase} />

      {/* Status Bar */}
      {feature.branch_name && (
        <div className="dev-status-bar">
          <span>Branch: <strong>{feature.branch_name}</strong></span>
          {allCompleted && <span style={{ color: '#16a34a' }}>Build: passing</span>}
        </div>
      )}

      {/* Tabs */}
      <div className="plan-viewer__tabs" style={{ marginTop: 16 }}>
        {(['progress', 'summary', 'comments'] as const).map((tab) => (
          <button
            key={tab}
            className={`plan-viewer__tab ${activeTab === tab ? 'plan-viewer__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        {activeTab === 'progress' && (
          <div className="card">
            {!hasStarted ? (
              <div>
                <h3>Start Development</h3>
                <p className="muted">This will create a feature branch, implement code changes, build, verify, and push.</p>
                <button className="btn primary" onClick={handleStart} disabled={streaming} style={{ marginTop: 8 }}>
                  {streaming ? 'Running...' : 'Start Development'}
                </button>
              </div>
            ) : (
              <DevelopmentProgress steps={steps} />
            )}
            {streaming && streamLog.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
                {streamLog.map((msg, i) => (
                  <p key={i} style={{ margin: '2px 0' }}>{msg}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="card">
            {summary ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
              </div>
            ) : (
              <p className="muted">No change summary available yet.</p>
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <PhaseComments featureId={featureId} phase="development" />
        )}
      </div>

      {/* Actions */}
      {allCompleted && !isApproved && (
        <div className="phase-actions">
          <div style={{ flex: 1, marginRight: 8 }}>
            <input
              className="input"
              placeholder="Comments for changes..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          <button className="btn ghost" onClick={handleRequestChanges} disabled={streaming}>
            Request Changes
          </button>
          <button className="btn primary" onClick={handleApprove} disabled={streaming}>
            Approve
          </button>
        </div>
      )}

      {isApproved && (
        <div className="card" style={{ marginTop: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
          <p style={{ color: '#16a34a', fontWeight: 600 }}>Development approved! Moving to Testing phase.</p>
          <Link
            className="btn primary"
            href={`/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/testing`}
            style={{ marginTop: 8, display: 'inline-block' }}
          >
            Go to Testing
          </Link>
        </div>
      )}
    </div>
  )
}
