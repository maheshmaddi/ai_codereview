import Link from 'next/link'
import { listProjects } from '@/lib/api'

export default async function HistoryLandingPage() {
  const projects = await listProjects()

  return (
    <div>
      <h1 className="page-title">History</h1>
      <p className="muted">Pick a project to view its review history.</p>

      <div className="list">
        {projects.map((project) => (
          <Link
            key={project.project_id}
            className="card row"
            href={`/projects/${encodeURIComponent(project.project_id)}/history`}
          >
            <span>{project.display_name}</span>
            <span className="badge">Open</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
