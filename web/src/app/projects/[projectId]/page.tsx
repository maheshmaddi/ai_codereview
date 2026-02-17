import Link from 'next/link'
import { getProjectIndex, getProjectSettings } from '@/lib/api'

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
        <div>
          <h1 className="page-title">{settings.display_name}</h1>
          <p className="muted">{settings.git_remote}</p>
        </div>
        <div className="toolbar" style={{ marginTop: 0 }}>
          <form action={`/api/projects/${encodeURIComponent(projectId)}/initialize`} method="POST">
            <button className="btn primary" type="submit">Regenerate with AI</button>
          </form>
          <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}/history`}>Review History</Link>
          <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}/settings`}>Settings</Link>
        </div>
      </div>

      {index === null ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Project is not initialized yet</h3>
          <p className="muted">
            Run deep initialization to generate root and module review documents in the centralized store.
          </p>
        </div>
      ) : (
      <div className="project-layout" style={{ marginTop: 12 }}>
        <aside className="panel project-tree">
          <h3>Project Explorer</h3>
          <Link href={`/projects/${encodeURIComponent(projectId)}/editor`}>Root Document</Link>
          {index.modules.map((module) => (
            <Link
              key={module.name}
              href={`/projects/${encodeURIComponent(projectId)}/editor?module=${encodeURIComponent(module.name)}`}
            >
              {module.name}
            </Link>
          ))}
        </aside>

        <div className="list">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Modules</div>
              <div className="stat-value">{index.modules.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Generated Files</div>
              <div className="stat-value">{index.total_files}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Main Branch</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{settings.main_branch}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Severity Threshold</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{settings.severity_threshold}</div>
            </div>
          </div>

          <div className="card">
            <h3>Generation Metadata</h3>
            <div className="row">
              <span>Generated At</span>
              <strong>{new Date(index.generated_at).toLocaleString()}</strong>
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
            >
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
