import { listProjects } from '@/lib/api'
import { ProjectsGrid } from '@/components/projects-grid'

export default async function ProjectsPage() {
  const projects = await listProjects()

  return (
    <div>
      <h1 className="page-title">Projects</h1>
      <p className="muted">Projects discovered from centralized review store.</p>
      <div className="toolbar">
        <form action="/api/projects/refresh" method="POST">
          <button className="btn" type="submit">Refresh from Store</button>
        </form>
      </div>
      <ProjectsGrid projects={projects} />
    </div>
  )
}
