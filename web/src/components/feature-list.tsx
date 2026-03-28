'use client'

import Link from 'next/link'
import type { Feature } from '@/lib/api'

interface FeatureListProps {
  features: Feature[]
  projectId: string
}

const PHASE_LABELS: Record<string, string> = {
  architecture: 'Architecture',
  development: 'Development',
  testing: 'Testing',
  completed: 'Completed',
}

export function FeatureList({ features, projectId }: FeatureListProps) {
  if (features.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <p className="muted">No features yet. Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid">
      {features.map((f) => (
        <Link
          key={f.id}
          href={`/projects/${encodeURIComponent(projectId)}/features/${f.id}/${f.current_phase === 'completed' ? 'testing' : f.current_phase}`}
          className="feature-card"
        >
          <h3 className="feature-card__name">{f.name}</h3>
          <span className={`feature-card__phase feature-card__phase--${f.current_phase}`}>
            {PHASE_LABELS[f.current_phase] ?? f.current_phase}
          </span>
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Created {new Date(f.created_at).toLocaleDateString()}
          </p>
        </Link>
      ))}
    </div>
  )
}
