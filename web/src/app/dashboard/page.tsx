import Link from 'next/link'
import { listProjects } from '@/lib/api'

export default async function DashboardPage() {
  const projects = await listProjects()
  const totalModules = projects.reduce((sum, p) => sum + p.total_modules, 0)
  const needsRegen = projects.filter((p) => p.status === 'needs_regeneration').length
  const drafts = projects.filter((p) => p.status === 'draft').length

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="muted">Overview of projects and generated review documentation.</p>

      <div className="grid">
        <div className="card">
          <h3>Total Projects</h3>
          <p>{projects.length}</p>
        </div>
        <div className="card">
          <h3>Total Modules</h3>
          <p>{totalModules}</p>
        </div>
        <div className="card">
          <h3>Draft Projects</h3>
          <p>{drafts}</p>
        </div>
        <div className="card">
          <h3>Needs Regeneration</h3>
          <p>{needsRegen}</p>
        </div>
      </div>

      <div className="list">
        {projects.map((project) => (
          <Link
            key={project.project_id}
            className="card row"
            href={`/projects/${encodeURIComponent(project.project_id)}`}
          >
            <span>{project.display_name}</span>
            <span className="badge">{project.status}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
