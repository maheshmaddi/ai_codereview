'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listProjects } from '@/lib/api'
import type { ProjectSummary } from '@/lib/api'
import { ProjectsGrid } from '@/components/projects-grid'
import { AddProjectDialog } from '@/components/add-project-dialog'

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectSummary[]>([])

  const loadProjects = () => {
    listProjects().then(setProjects).catch(console.error)
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const handleProjectAdded = () => {
    // Re-fetch project list after a new project is added
    loadProjects()
    router.refresh()
  }

  return (
    <div>
      <div className="hero">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="muted">Projects discovered from centralized review store.</p>
        </div>
        <div className="toolbar">
          <AddProjectDialog onDone={handleProjectAdded} />
          <button className="btn" onClick={loadProjects}>Refresh from Store</button>
        </div>
      </div>
      <ProjectsGrid projects={projects} />
    </div>
  )
}


