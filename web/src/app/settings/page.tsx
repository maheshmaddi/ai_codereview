import Link from 'next/link'
import { listProjects } from '@/lib/api'

export default async function SettingsLandingPage() {
  const projects = await listProjects()

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="muted">Project-level settings pages.</p>

      <div className="list">
        {projects.map((project) => (
          <Link
            key={project.project_id}
            className="card row"
            href={`/projects/${encodeURIComponent(project.project_id)}/settings`}
          >
            <span>{project.display_name}</span>
            <span className="badge">Open</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
