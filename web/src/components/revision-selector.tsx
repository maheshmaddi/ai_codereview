'use client'

import type { PhaseRevisionSummary } from '@/lib/api'

interface RevisionSelectorProps {
  revisions: PhaseRevisionSummary[]
  activeVersion: number | null
  onSelect: (version: number) => void
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending_review: 'Pending Review',
  revision_requested: 'Needs Revision',
  draft: 'Draft',
}

export function RevisionSelector({ revisions, activeVersion, onSelect }: RevisionSelectorProps) {
  if (revisions.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>No revisions yet.</p>
  }

  return (
    <div>
      <div className="revision-selector">
        {revisions.map((rev) => {
          const isActive = rev.version === activeVersion
          let cls = 'revision-pill'
          if (isActive) cls += ' revision-pill--active'
          if (rev.status === 'approved') cls += ' revision-pill--approved'
          return (
            <button key={rev.version} className={cls} onClick={() => onSelect(rev.version)}>
              v{rev.version}
            </button>
          )
        })}
      </div>
      {activeVersion != null && revisions.find((r) => r.version === activeVersion) && (
        <div style={{ marginTop: 8 }}>
          {(() => {
            const rev = revisions.find((r) => r.version === activeVersion)!
            return (
              <span className={`revision-status revision-status--${rev.status}`}>
                {STATUS_LABELS[rev.status] ?? rev.status}
              </span>
            )
          })()}
        </div>
      )}
    </div>
  )
}
