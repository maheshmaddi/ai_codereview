import Link from 'next/link'
import { listProjects } from '@/lib/api'
import { Clock, FolderKanban, ArrowRight } from 'lucide-react'

export default async function HistoryLandingPage() {
  const projects = await listProjects()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Clock size={28} style={{ color: '#60a5fa' }} />
        <div>
          <h1 className="page-title">History</h1>
          <p className="muted">Pick a project to view its review history.</p>
        </div>
      </div>

      <div className="list">
        {projects.map((project) => (
          <Link
            key={project.project_id}
            className="card row"
            href={`/projects/${encodeURIComponent(project.project_id)}/history`}
            style={{ display: 'block' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FolderKanban size={20} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{project.display_name}</span>
              </div>
              <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Open
                <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
