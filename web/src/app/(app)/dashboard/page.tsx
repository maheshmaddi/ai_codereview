import { Suspense } from 'react'
import { listProjects } from '@/lib/store-client'
import { ProjectCard } from '@/components/dashboard/project-card'
import { PageHeader } from '@/components/ui/page-header'
import { RefreshCw } from 'lucide-react'

async function ProjectsGrid() {
  const projects = await listProjects()

  if (projects.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-500 text-sm mb-4">
          No projects registered yet. Run{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
            /codereview-int-deep
          </code>{' '}
          in your project to initialize it.
        </p>
      </div>
    )
  }

  return (
    <>
      {projects.map((project) => (
        <ProjectCard key={project.project_id} project={project} />
      ))}
    </>
  )
}

export default function DashboardPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        description="Overview of all registered code review projects"
        action={
          <form action="/api/projects/refresh" method="POST">
            <button type="submit" className="btn-secondary">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </form>
        }
      />

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Suspense
          fallback={Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-48 animate-pulse bg-gray-100" />
          ))}
        >
          <ProjectsGrid />
        </Suspense>
      </div>
    </div>
  )
}
