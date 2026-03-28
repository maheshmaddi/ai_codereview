'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PhaseRevision, PhaseQuestion } from '@/lib/api'
import { RevisionSelector } from './revision-selector'
import { MermaidDiagram } from './mermaid-diagram'
import { QAPanel } from './qa-panel'

interface Props {
  featureId: string
  revisions: PhaseRevision[]
  questions?: PhaseQuestion[]
  showQA?: boolean
  onRevisionChange?: (version: number) => void
}

type Tab = 'plan' | 'diagrams' | 'qa'

export function PlanViewer({ featureId, revisions, questions, showQA, onRevisionChange }: Props) {
  const versions = revisions.map((r) => r.version)
  const [activeVersion, setActiveVersion] = useState(versions[versions.length - 1] ?? 0)
  const [activeTab, setActiveTab] = useState<Tab>('plan')

  const revision = revisions.find((r) => r.version === activeVersion)

  const handleVersionChange = (v: number) => {
    setActiveVersion(v)
    onRevisionChange?.(v)
  }

  const diagrams: string[] = (() => {
    if (!revision?.diagrams) return []
    try { return JSON.parse(revision.diagrams) } catch { return [] }
  })()

  const tabs: { key: Tab; label: string }[] = [
    { key: 'plan', label: 'Plan' },
    ...(diagrams.length > 0 ? [{ key: 'diagrams' as Tab, label: 'Diagrams' }] : []),
    ...(showQA && questions ? [{ key: 'qa' as Tab, label: 'Q&A' }] : []),
  ]

  return (
    <div className="plan-viewer">
      <div className="plan-viewer__header">
        <RevisionSelector versions={versions} active={activeVersion} onSelect={handleVersionChange} />
        {revision && (
          <span className={`badge ${revision.status === 'approved' ? 'badge--green' : ''}`}>
            {revision.status.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      <div className="plan-viewer__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`plan-viewer__tab ${activeTab === tab.key ? 'plan-viewer__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="plan-viewer__content">
        {activeTab === 'plan' && revision && (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{revision.content}</ReactMarkdown>
          </div>
        )}
        {activeTab === 'plan' && !revision && (
          <p className="muted">No plan generated yet.</p>
        )}
        {activeTab === 'diagrams' && (
          <div className="plan-viewer__diagrams">
            {diagrams.map((d, i) => (
              <div key={i} className="plan-viewer__diagram">
                <MermaidDiagram chart={d} />
              </div>
            ))}
          </div>
        )}
        {activeTab === 'qa' && questions && (
          <QAPanel featureId={featureId} questions={questions} />
        )}
      </div>
    </div>
  )
}
