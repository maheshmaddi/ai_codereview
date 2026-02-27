import Link from 'next/link'
import { listProjects } from '@/lib/api'
import { FolderKanban, Layers, FileCode, AlertTriangle, CheckCircle, Clock, ExternalLink } from 'lucide-react'

export default async function DashboardPage() {
  const projects = await listProjects()
  const totalModules = projects.reduce((sum, p) => sum + p.total_modules, 0)
  const needsRegen = projects.filter((p) => p.status === 'needs_regeneration').length
  const drafts = projects.filter((p) => p.status === 'draft').length

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="muted">Overview of projects and generated review documentation.</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3>Total Projects</h3>
            <FolderKanban style={{ width: 24, height: 24, color: '#60a5fa', flexShrink: 0 }} />
          </div>
          <p className="stat-value">{projects.length}</p>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3>Total Modules</h3>
            <Layers style={{ width: 24, height: 24, color: '#8b5cf6', flexShrink: 0 }} />
          </div>
          <p className="stat-value">{totalModules}</p>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3>Draft Projects</h3>
            <FileCode style={{ width: 24, height: 24, color: '#f59e0b', flexShrink: 0 }} />
          </div>
          <p className="stat-value">{drafts}</p>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3>Needs Regeneration</h3>
            <AlertTriangle style={{ width: 24, height: 24, color: '#ef4444', flexShrink: 0 }} />
          </div>
          <p className="stat-value">{needsRegen}</p>
        </div>
      </div>

      <div className="list">
        {projects.length === 0 ? (
          <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
            <FolderKanban style={{ width: 48, height: 48, color: '#94a3b8', marginBottom: '16px' }} />
            <p style={{ color: '#64748b', margin: 0 }}>No projects yet. Add your first project to get started.</p>
          </div>
        ) : (
          projects.map((project) => {
            const badgeClass = project.status === 'up_to_date' ? 'badge-success' :
                             project.status === 'needs_regeneration' ? 'badge-warning' :
                             project.status === 'draft' ? 'badge-info' : ''
            const StatusIcon = project.status === 'up_to_date' ? CheckCircle :
                               project.status === 'needs_regeneration' ? AlertTriangle :
                               project.status === 'draft' ? Clock : CheckCircle
            const statusColor = project.status === 'up_to_date' ? '#10b981' :
                              project.status === 'needs_regeneration' ? '#f59e0b' :
                              project.status === 'draft' ? '#3b82f6' : '#94a3b8'
            return (
              <Link
                key={project.project_id}
                className="card row"
                href={`/projects/${encodeURIComponent(project.project_id)}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <FolderKanban style={{ width: 20, height: 20, color: '#60a5fa', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{project.display_name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`badge ${badgeClass}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <StatusIcon style={{ width: 12, height: 12 }} />
                    {project.status}
                  </span>
                  <ExternalLink style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} />
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
