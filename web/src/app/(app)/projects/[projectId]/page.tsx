import { getProjectIndex, getProjectSettings, listReviews } from '@/lib/store-client'
import { PageHeader } from '@/components/ui/page-header'
import { ModuleTree } from '@/components/project/module-tree'
import { ProjectStats } from '@/components/project/project-stats'
import Link from 'next/link'
import { FileText, RefreshCw, Settings } from 'lucide-react'

interface PageProps {
  params: { projectId: string }
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const projectId = decodeURIComponent(params.projectId)

  const [index, settings, reviews] = await Promise.all([
    getProjectIndex(projectId),
    getProjectSettings(projectId),
    listReviews(projectId),
  ])

  const editorBase = `/projects/${params.projectId}/editor`

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

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        <PageHeader
          title={index.project}
          description={index.git_remote.replace('https://', '').replace('.git', '')}
          action={
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${params.projectId}/settings`}
                className="btn-secondary"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
              <form action={`/api/projects/${encodeURIComponent(projectId)}/initialize`} method="POST">
                <button type="submit" className="btn-primary">
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </button>
              </form>
            </div>
          }
        />

        {/* Stats */}
        <ProjectStats index={index} reviews={reviews} settings={settings} />

        {/* Recent Reviews */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent Reviews</h2>
            <Link
              href={`/projects/${params.projectId}/history`}
              className="text-xs text-brand-600 hover:underline"
            >
              View all
            </Link>
          </div>

          {reviews.length === 0 ? (
            <p className="text-sm text-gray-500">No reviews run yet for this project.</p>
          ) : (
            <div className="space-y-2">
              {reviews.slice(0, 5).map((review) => (
                <Link
                  key={review.id}
                  href={review.pr_url}
                  target="_blank"
                  className="card p-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
                >
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      PR #{review.pr_number}: {review.pr_title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(review.reviewed_at).toLocaleDateString()} ·{' '}
                      {review.comment_count} comments · {review.verdict}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      review.verdict === 'approve'
                        ? 'bg-green-100 text-green-700'
                        : review.verdict === 'request_changes'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {review.verdict.replace('_', ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
