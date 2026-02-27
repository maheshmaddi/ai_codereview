import { listProjectReviews } from '@/lib/api'
import { HistoryTable } from '@/components/history-table'
import { History } from 'lucide-react'

interface Props {
  params: { projectId: string }
}

export default async function ProjectHistoryPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const reviews = await listProjectReviews(projectId)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <History size={28} style={{ color: '#60a5fa' }} />
        <div>
          <h1 className="page-title">Project History</h1>
          <p className="muted">{projectId}</p>
        </div>
      </div>
      {reviews.length === 0 ? (
        <div
          className="card"
          style={{
            marginTop: 16,
            padding: '32px',
            textAlign: 'center',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}
        >
          <History size={48} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <p style={{ color: '#64748b', margin: 0 }}>No reviews executed yet for this project.</p>
        </div>
      ) : (
        <HistoryTable reviews={reviews} projectId={projectId} />
      )}
    </div>
  )
}
