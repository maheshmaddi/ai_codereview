'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileUpload } from '@/components/file-upload'
import { QAPanel } from '@/components/qa-panel'
import { PlanViewer } from '@/components/plan-viewer'
import { PhaseStepper } from '@/components/phase-stepper'
import { PhaseComments } from '@/components/phase-comments'
import {
  getFeature, getArchitectureQuestions, getArchitectureRevisions,
  analyzeArchitecture, generateArchitecturePlan,
  reviseArchitecture, approveArchitecture,
  readSSE,
  type Feature, type PhaseQuestion, type PhaseRevision,
} from '@/lib/api'

interface Props {
  params: { projectId: string; featureId: string }
}

export default function ArchitecturePage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const { featureId } = params

  const [feature, setFeature] = useState<Feature | null>(null)
  const [questions, setQuestions] = useState<PhaseQuestion[]>([])
  const [revisions, setRevisions] = useState<PhaseRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [streamLog, setStreamLog] = useState<string[]>([])
  const [comments, setComments] = useState('')
  const [planGenerated, setPlanGenerated] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [f, q, r] = await Promise.all([
        getFeature(projectId, featureId),
        getArchitectureQuestions(featureId).catch(() => []),
        getArchitectureRevisions(featureId).catch(() => []),
      ])
      setFeature(f)
      setQuestions(q)
      setRevisions(r)
      setPlanGenerated(r.length > 0)
    } catch (e) {
      console.error('Failed to load architecture data:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, featureId])

  useEffect(() => { loadData() }, [loadData])

  const handleAnalyze = async () => {
    setStreaming(true)
    setStreamLog([])
    try {
      const res = await analyzeArchitecture(featureId)
      await readSSE(res, (event) => {
        const msg = (event as { message?: string }).message
        if (msg) setStreamLog((prev) => [...prev, msg])
      })
      await loadData()
    } catch (e) {
      console.error('Analysis failed:', e)
    } finally {
      setStreaming(false)
    }
  }

  const handleGeneratePlan = async () => {
    setStreaming(true)
    setStreamLog([])
    try {
      const res = await generateArchitecturePlan(featureId)
      await readSSE(res, (event) => {
        const msg = (event as { message?: string }).message
        if (msg) setStreamLog((prev) => [...prev, msg])
      })
      await loadData()
      setPlanGenerated(true)
    } catch (e) {
      console.error('Plan generation failed:', e)
    } finally {
      setStreaming(false)
    }
  }

  const handleRevise = async () => {
    try {
      await reviseArchitecture(featureId, comments)
      setComments('')
      await loadData()
    } catch (e) {
      console.error('Revise failed:', e)
    }
  }

  const handleApprove = async () => {
    try {
      const updated = await approveArchitecture(featureId)
      setFeature(updated)
    } catch (e) {
      console.error('Approve failed:', e)
    }
  }

  const allAnswered = questions.length > 0 && questions.every((q) => q.answer)
  const hasRevision = revisions.length > 0
  const isApproved = revisions.some((r) => r.status === 'approved')

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
          <p className="muted">Architecture Phase</p>
        </div>
      </div>

      <PhaseStepper projectId={projectId} featureId={featureId} currentPhase={feature.current_phase} />

      <div className="phase-layout" style={{ marginTop: 16 }}>
        {/* Left Panel */}
        <div className="phase-layout__sidebar">
          <FileUpload featureId={featureId} />
          <div style={{ marginTop: 12 }}>
            <h4 style={{ marginBottom: 4 }}>Status</h4>
            <p className="muted" style={{ fontSize: 13 }}>
              {isApproved ? 'Approved — Development unlocked' :
               hasRevision ? `Plan v${revisions[revisions.length - 1].version} ready for review` :
               allAnswered ? 'Ready to generate plan' :
               feature.requirement_file ? 'Requirement uploaded — analyze to start Q&A' :
               'Upload a requirement document to begin'}
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
          {!feature.requirement_file && !hasRevision && (
            <div className="card">
              <h3>Get Started</h3>
              <p className="muted">Upload a requirement document (PDF, DOCX, MD, TXT) to begin the architecture phase.</p>
            </div>
          )}

          {feature.requirement_file && !hasRevision && questions.length === 0 && (
            <div className="card">
              <h3>Analyze Requirements</h3>
              <p className="muted">Click Analyze to generate clarifying questions about your requirements.</p>
              <button className="btn primary" onClick={handleAnalyze} disabled={streaming} style={{ marginTop: 8 }}>
                {streaming ? 'Analyzing...' : 'Analyze Requirements'}
              </button>
            </div>
          )}

          {questions.length > 0 && !allAnswered && (
            <div className="card">
              <h3>Questions & Answers</h3>
              <p className="muted">Answer all questions before generating the architecture plan.</p>
              <QAPanel featureId={featureId} questions={questions} onAnswered={loadData} />
            </div>
          )}

          {allAnswered && !planGenerated && (
            <div className="card">
              <h3>Generate Architecture Plan</h3>
              <p className="muted">All questions answered. Generate the plan.</p>
              <button className="btn primary" onClick={handleGeneratePlan} disabled={streaming} style={{ marginTop: 8 }}>
                {streaming ? 'Generating...' : 'Generate Plan'}
              </button>
            </div>
          )}

          {hasRevision && (
            <PlanViewer
              featureId={featureId}
              revisions={revisions}
              questions={questions}
              showQA
            />
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

      {/* Actions Bar */}
      {hasRevision && !isApproved && (
        <div className="phase-actions">
          <div style={{ flex: 1, marginRight: 8 }}>
            <input
              className="input"
              placeholder="Architect comments..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          <button className="btn ghost" onClick={handleRevise} disabled={streaming}>
            Revise Plan
          </button>
          <button className="btn primary" onClick={handleApprove} disabled={streaming}>
            Approve
          </button>
        </div>
      )}

      {isApproved && (
        <div className="card" style={{ marginTop: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
          <p style={{ color: '#16a34a', fontWeight: 600 }}>Architecture approved! Moving to Development phase.</p>
          <Link
            className="btn primary"
            href={`/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/development`}
            style={{ marginTop: 8, display: 'inline-block' }}
          >
            Go to Development
          </Link>
        </div>
      )}

      {hasRevision && <PhaseComments featureId={featureId} phase="architecture" />}
    </div>
  )
}
