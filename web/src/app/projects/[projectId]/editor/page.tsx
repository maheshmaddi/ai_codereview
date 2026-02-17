import Link from 'next/link'
import { DocumentEditor } from '@/components/document-editor'
import { getDocument, getDocumentVersions, getProjectIndex } from '@/lib/api'

interface Props {
  params: { projectId: string }
  searchParams: { module?: string }
}

export default async function EditorPage({ params, searchParams }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const selectedModule = searchParams.module ?? null

  const [index, document, versions] = await Promise.all([
    getProjectIndex(projectId),
    getDocument(projectId, selectedModule),
    getDocumentVersions(projectId, selectedModule),
  ])

  return (
    <div>
      <div className="hero">
        <div>
          <h1 className="page-title">Editor - {index.project}</h1>
          <p className="muted">Edit and preview review documentation for root or module files.</p>
        </div>
        <div className="toolbar" style={{ marginTop: 0 }}>
          <Link className="btn" href={`/projects/${encodeURIComponent(projectId)}`}>Back</Link>
          <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}/history`}>History</Link>
          <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}/settings`}>Settings</Link>
        </div>
      </div>

      <div className="project-layout">
        <aside className="panel project-tree">
          <h3>Documents</h3>
          <Link
            className={selectedModule === null ? 'active' : ''}
            href={`/projects/${encodeURIComponent(projectId)}/editor`}
          >
            Root Document
          </Link>
          {index.modules.map((module) => (
            <Link
              key={module.name}
              className={selectedModule === module.name ? 'active' : ''}
              href={`/projects/${encodeURIComponent(projectId)}/editor?module=${encodeURIComponent(module.name)}`}
            >
              {module.name}
            </Link>
          ))}
        </aside>
        <DocumentEditor
          key={`${selectedModule ?? 'root'}-${document.version}`}
          projectId={projectId}
          selectedModule={selectedModule}
          index={index}
          document={document}
          versions={versions}
        />
      </div>
    </div>
  )
}
