'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PhaseStepper } from '@/components/phase-stepper'
import { PlanViewer } from '@/components/plan-viewer'
import { PhaseComments } from '@/components/phase-comments'
import {
  getFeature, getTestRevisions,
  generateTestPlan, reviseTestPlan, approveTesting,
  readSSE,
  type Feature, type PhaseRevision,
} from '@/lib/api'

interface Props {
  params: { projectId: string; featureId: string }
}

export default function TestingPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const { featureId } = params

  const [feature, setFeature] = useState<Feature | null>(null)
  const [revisions, setRevisions] = useState<PhaseRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [streamLog, setStreamLog] = useState<string[]>([])
  const [comments, setComments] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        getFeature(projectId, featureId),
        getTestRevisions(featureId).catch(() => []),
      ])
      setFeature(f)
      setRevisions(r)
    } catch (e) {
      console.error('Failed to load testing data:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, featureId])

  useEffect(() => { loadData() }, [loadData])

  const handleGeneratePlan = async () => {
    setStreaming(true)
    setStreamLog([])
    try {
      const res = await generateTestPlan(featureId)
      await readSSE(res, (event) => {
        const msg = (event as { message?: string }).message
        if (msg) setStreamLog((prev) => [...prev, msg])
      })
      await loadData()
    } catch (e) {
      console.error('Test plan generation failed:', e)
    } finally {
      setStreaming(false)
    }
  }

  const handleRevise = async () => {
    try {
      await reviseTestPlan(featureId, comments)
      setComments('')
      await loadData()
    } catch (e) {
      console.error('Revise failed:', e)
    }
  }

  const handleApprove = async () => {
    setStreaming(true)
    setStreamLog([])
    try {
      const res = await approveTesting(featureId)
      await readSSE(res, (event) => {
        const msg = (event as { message?: string }).message
        if (msg) setStreamLog((prev) => [...prev, msg])
      })
      await loadData()
    } catch (e) {
      console.error('Approve failed:', e)
    } finally {
      setStreaming(false)
    }
  }

  const hasRevision = revisions.length > 0
  const isApproved = revisions.some((r) => r.status === 'approved')
  const isCompleted = feature?.current_phase === 'completed'

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
          <p className="muted">Testing Phase</p>
        </div>
      </div>

      <PhaseStepper projectId={projectId} featureId={featureId} currentPhase={feature.current_phase} />

      <div className="phase-layout" style={{ marginTop: 16 }}>
        {/* Left Sidebar */}
        <div className="phase-layout__sidebar">
          <div style={{ marginTop: 12 }}>
            <h4 style={{ marginBottom: 4 }}>Status</h4>
            <p className="muted" style={{ fontSize: 13 }}>
              {isCompleted ? 'Feature lifecycle complete!' :
               isApproved ? 'Test plan approved — tests executing' :
               hasRevision ? `Test plan v${revisions[revisions.length - 1].version} ready for review` :
               'Generate a test plan to begin'}
            </p>
          </div>
          {hasRevision && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ marginBottom: 4 }}>Revision History</h4>
              {revisions.map((r) => (
                <div key={r.id} className="meta-item" style={{ fontSize: 12 }}>
                  <span>v{r.version}</span>
                  <span className={`badge ${r.status === 'approved' ? 'badge--green' : ''}`} style={{ marginLeft: 6 }}>
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="phase-layout__main">
          {!hasRevision && (
            <div className="card">
              <h3>Generate Test Plan</h3>
              <p className="muted">
                Based on the architecture plan and code changes, generate a comprehensive test plan.
              </p>
              <button className="btn primary" onClick={handleGeneratePlan} disabled={streaming} style={{ marginTop: 8 }}>
                {streaming ? 'Generating...' : 'Generate Test Plan'}
              </button>
            </div>
          )}

          {hasRevision && (
            <PlanViewer featureId={featureId} revisions={revisions} />
          )}

          {streaming && streamLog.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4>Progress</h4>
              <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
                {streamLog.map((msg, i) => (
                  <p key={i} style={{ margin: '2px 0' }}>{msg}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {hasRevision && !isApproved && !isCompleted && (
        <div className="phase-actions">
          <div style={{ flex: 1, marginRight: 8 }}>
            <input
              className="input"
              placeholder="Comments on test plan..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          <button className="btn ghost" onClick={handleRevise} disabled={streaming}>
            Revise Test Plan
          </button>
          <button className="btn primary" onClick={handleApprove} disabled={streaming}>
            {streaming ? 'Approving & Generating...' : 'Approve & Generate Tests'}
          </button>
        </div>
      )}

      {isCompleted && (
        <div className="card" style={{ marginTop: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
          <p style={{ color: '#16a34a', fontWeight: 600 }}>Feature lifecycle complete! All phases approved and tests generated.</p>
          <Link
            className="btn primary"
            href={`/projects/${encodeURIComponent(projectId)}/features`}
            style={{ marginTop: 8, display: 'inline-block' }}
          >
            Back to Features
          </Link>
        </div>
      )}

      {hasRevision && <PhaseComments featureId={featureId} phase="testing" />}
    </div>
  )
}
