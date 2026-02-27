'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ProjectSummary } from '@/lib/api'
import { Search, FolderKanban, GitBranch, CheckCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react'

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up_to_date':
        return <CheckCircle size={12} style={{ color: '#10b981' }} />
      case 'needs_regeneration':
        return <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
      case 'draft':
        return <Clock size={12} style={{ color: '#3b82f6' }} />
      default:
        return <Clock size={12} style={{ color: '#94a3b8' }} />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up_to_date':
        return '#10b981'
      case 'needs_regeneration':
        return '#f59e0b'
      case 'draft':
        return '#3b82f6'
      default:
        return '#94a3b8'
    }
  }

  return (
    <>
      <div className="toolbar">
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            placeholder="Search by project name or git remote..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: '44px' }}
          />
        </div>
      </div>

      <div className="grid">
        {filtered.map((project) => {
          const statusColor = getStatusColor(project.status)
          return (
            <Link
              className="card"
              key={project.project_id}
              href={`/projects/${encodeURIComponent(project.project_id)}`}
              style={{ display: 'block' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FolderKanban size={24} style={{ color: '#60a5fa', flexShrink: 0 }} />
                  <h3>{project.display_name}</h3>
                </div>
                <ArrowRight size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
              </div>
              <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <GitBranch size={14} style={{ flexShrink: 0, color: '#64748b' }} />
                {project.git_remote}
              </p>
              <div
                className="row"
                style={{ marginTop: 12, justifyContent: 'space-between' }}
              >
                <span
                  className="badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    color: statusColor,
                    border: `1px solid ${statusColor}40`,
                    background: `${statusColor}10`,
                  }}
                >
                  {getStatusIcon(project.status)}
                  {project.status}
                </span>
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {project.total_modules} modules
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
