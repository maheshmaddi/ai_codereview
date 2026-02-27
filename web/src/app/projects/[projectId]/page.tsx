import Link from 'next/link'
import { getProjectIndex, getProjectSettings } from '@/lib/api'
import { CheckReviewDialog } from '@/components/check-review-dialog'
import { FolderKanban, GitBranch, RefreshCw, History, Settings, FileCode, Calendar, Shield, Edit } from 'lucide-react'

interface Props {
  params: { projectId: string }
}

export default async function ProjectDetailPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const settings = await getProjectSettings(projectId)
  let index: Awaited<ReturnType<typeof getProjectIndex>> | null = null
  try {
    index = await getProjectIndex(projectId)
  } catch {
    index = null
  }

  return (
    <div>
      <div className="hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FolderKanban size={28} style={{ color: '#60a5fa' }} />
          <div>
            <h1 className="page-title">{settings.display_name}</h1>
            <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitBranch size={14} style={{ flexShrink: 0, color: '#64748b' }} />
              {settings.git_remote}
            </p>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 0 }}>
          <CheckReviewDialog projectId={projectId} projectName={settings.display_name} />
          <form action={`/api/projects/${encodeURIComponent(projectId)}/initialize`} method="POST">
            <button
              className="btn primary"
              type="submit"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} />
              Regenerate with AI
            </button>
          </form>
          <Link
            className="btn ghost"
            href={`/projects/${encodeURIComponent(projectId)}/history`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <History size={16} />
            Review History
          </Link>
          <Link
            className="btn ghost"
            href={`/projects/${encodeURIComponent(projectId)}/settings`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Settings size={16} />
            Settings
          </Link>
        </div>
      </div>

      {index === null ? (
        <div
          className="card"
          style={{
            marginTop: 16,
            padding: '32px',
            textAlign: 'center',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}
        >
          <FolderKanban size={48} style={{ color: '#94a3b8', marginBottom: '16px' }} />
          <h3>Project is not initialized yet</h3>
          <p className="muted" style={{ marginTop: '12px' }}>
            Run deep initialization to generate root and module review documents in centralized store.
          </p>
        </div>
      ) : (
        <div className="project-layout" style={{ marginTop: 16 }}>
          <aside className="panel project-tree">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCode size={18} style={{ color: '#60a5fa' }} />
              Project Explorer
            </h3>
            <Link
              href={`/projects/${encodeURIComponent(projectId)}/editor`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FileCode size={16} style={{ flexShrink: 0, color: '#64748b' }} />
              Root Document
            </Link>
            {index.modules.map((module) => (
              <Link
                key={module.name}
                href={`/projects/${encodeURIComponent(projectId)}/editor?module=${encodeURIComponent(module.name)}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <FileCode size={16} style={{ flexShrink: 0, color: '#64748b' }} />
                {module.name}
              </Link>
            ))}
          </aside>

          <div className="list">
            <div className="stats-grid">
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="stat-label">Modules</div>
                  <FileCode size={20} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                </div>
                <div className="stat-value">{index.modules.length}</div>
              </div>
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="stat-label">Generated Files</div>
                  <FileCode size={20} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                </div>
                <div className="stat-value">{index.total_files}</div>
              </div>
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="stat-label">Main Branch</div>
                  <GitBranch size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                </div>
                <div className="stat-value" style={{ fontSize: 16 }}>{settings.main_branch}</div>
              </div>
              <div className="stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="stat-label">Severity Threshold</div>
                  <Shield size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
                </div>
                <div className="stat-value" style={{ fontSize: 16 }}>{settings.severity_threshold}</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: '#60a5fa' }} />
                Generation Metadata
              </h3>
              <div className="row">
                <span>Generated At</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ flexShrink: 0, color: '#64748b' }} />
                  <strong>{new Date(index.generated_at).toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Modules</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {index.modules.map((module) => (
                    <tr key={module.name}>
                      <td>{module.name}</td>
                      <td>{module.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <Link
                className="btn primary"
                href={`/projects/${encodeURIComponent(projectId)}/editor`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Edit size={16} />
                Open Markdown Editor
              </Link>
              <p className="muted" style={{ marginTop: 8 }}>
                Use split-pane editing with live markdown preview and save/version tracking.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
