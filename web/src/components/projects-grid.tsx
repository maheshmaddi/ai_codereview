'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ProjectSummary } from '@/lib/api'

export function ProjectsGrid({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.git_remote.toLowerCase().includes(q) ||
        p.project_id.toLowerCase().includes(q)
    )
  }, [projects, query])

  return (
    <>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search by project name or git remote..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid">
        {filtered.map((project) => (
          <Link
            className="card"
            key={project.project_id}
            href={`/projects/${encodeURIComponent(project.project_id)}`}
          >
            <h3>{project.display_name}</h3>
            <p className="muted">{project.git_remote}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="badge">{project.status}</span>
              <span className="muted">{project.total_modules} modules</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
