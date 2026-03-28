'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DiagramList } from './mermaid-diagram'
import type { PhaseRevision } from '@/lib/api'

interface PlanViewerProps {
  revision: PhaseRevision | null
  extraTabs?: Array<{ label: string; content: React.ReactNode }>
}

export function PlanViewer({ revision, extraTabs = [] }: PlanViewerProps) {
  const allTabs = [
    { label: 'Plan', key: 'plan' },
    { label: 'Diagrams', key: 'diagrams' },
    ...extraTabs.map((t) => ({ label: t.label, key: t.label })),
  ]
  const [activeTab, setActiveTab] = useState('plan')

  if (!revision) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <p className="muted">No plan generated yet.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="phase-tabs">
        {allTabs.map((tab) => (
          <button
            key={tab.key}
            className={`phase-tab${activeTab === tab.key ? ' phase-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'plan' && (
        <div className="card markdown-body" style={{ lineHeight: 1.7 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{revision.content}</ReactMarkdown>
        </div>
      )}

      {activeTab === 'diagrams' && (
        <DiagramList diagrams={revision.diagrams ?? []} />
      )}

      {extraTabs.map((tab) => activeTab === tab.label && (
        <div key={tab.label}>{tab.content}</div>
      ))}
    </div>
  )
}
