'use client'

import Link from 'next/link'
import { PlusCircle, Layers } from 'lucide-react'
import type { Feature, FeaturePhase } from '@/lib/api'

const phaseLabels: Record<FeaturePhase, string> = {
  architecture: 'Architecture',
  development: 'Development',
  testing: 'Testing',
  completed: 'Completed',
}

const phaseColors: Record<FeaturePhase, string> = {
  architecture: '#f59e0b',
  development: '#2563eb',
  testing: '#8b5cf6',
  completed: '#16a34a',
}

interface Props {
  projectId: string
  features: Feature[]
  onCreateClick: () => void
}

export function FeatureList({ projectId, features, onCreateClick }: Props) {
  return (
    <div>
      <div className="hero" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Features</h3>
        <button className="btn primary" onClick={onCreateClick}>
          <PlusCircle size={16} /> New Feature
        </button>
      </div>
      {features.length === 0 ? (
        <div className="card">
          <p className="muted">No features yet. Create one to start the architecture → development → testing lifecycle.</p>
        </div>
      ) : (
        <div className="grid">
          {features.map((f) => (
            <Link
              key={f.id}
              href={`/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(f.id)}`}
              className="card feature-card"
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Layers size={16} />
                <h3 style={{ margin: 0, flex: 1 }}>{f.name}</h3>
                <span
                  className="badge"
                  style={{ background: phaseColors[f.current_phase] + '20', color: phaseColors[f.current_phase] }}
                >
                  {phaseLabels[f.current_phase]}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                Created {new Date(f.created_at).toLocaleDateString()}
                {f.branch_name && ` · ${f.branch_name}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
