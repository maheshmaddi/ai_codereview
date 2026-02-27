'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listProjects } from '@/lib/api'
import type { ProjectSummary } from '@/lib/api'
import { ProjectsGrid } from '@/components/projects-grid'
import { AddProjectDialog } from '@/components/add-project-dialog'
import { FolderKanban, RefreshCw } from 'lucide-react'

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FolderKanban size={28} style={{ color: '#60a5fa' }} />
            <div>
              <h1 className="page-title">Projects</h1>
              <p className="muted">Projects discovered from centralized review store.</p>
            </div>
          </div>
        </div>
        <div className="toolbar">
          <AddProjectDialog onDone={handleProjectAdded} />
          <button
            className="btn"
            onClick={loadProjects}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} />
            Refresh from Store
          </button>
        </div>
      </div>
      <ProjectsGrid projects={projects} />
    </div>
  )
}



