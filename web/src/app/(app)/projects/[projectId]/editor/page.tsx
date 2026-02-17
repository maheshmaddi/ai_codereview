import { getDocument, getProjectIndex } from '@/lib/store-client'
import { MarkdownEditor } from '@/components/editor/markdown-editor'
import { PageHeader } from '@/components/ui/page-header'
import { ModuleTree } from '@/components/project/module-tree'

interface PageProps {
  params: { projectId: string }
  searchParams: { module?: string }
}

export default async function EditorPage({ params, searchParams }: PageProps) {
  const projectId = decodeURIComponent(params.projectId)
  const moduleName = searchParams.module ?? null

  const [index, document] = await Promise.all([
    getProjectIndex(projectId),
    getDocument(projectId, moduleName),
  ])

  const editorBase = `/projects/${params.projectId}/editor`
  const title = moduleName ? `${moduleName} (module)` : `${index.project} (root)`

  return (
    <div className="flex h-full">
      {/* Sidebar: Module tree */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Review Guidelines
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <ModuleTree
            projectId={params.projectId}
            index={index}
            editorBase={editorBase}
          />
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <PageHeader
            title={title}
            description={document.file_path}
          />
        </div>

        <MarkdownEditor
          projectId={projectId}
          moduleName={moduleName}
          initialContent={document.content}
          lastModified={document.last_modified}
          version={document.version}
        />
      </div>
    </div>
  )
}
