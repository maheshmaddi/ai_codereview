import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { GitBranch, Layers, Clock, AlertCircle, CheckCircle2, FileText } from 'lucide-react'
import type { ProjectSummary, ProjectStatus } from '@/lib/types'
import { clsx } from 'clsx'

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  up_to_date: {
    label: 'Up to Date',
    icon: CheckCircle2,
    className: 'bg-green-100 text-green-700',
  },
  needs_regeneration: {
    label: 'Needs Regeneration',
    icon: AlertCircle,
    className: 'bg-yellow-100 text-yellow-700',
  },
  draft: {
    label: 'Draft',
    icon: FileText,
    className: 'bg-blue-100 text-blue-700',
  },
  not_initialized: {
    label: 'Not Initialized',
    icon: AlertCircle,
    className: 'bg-gray-100 text-gray-600',
  },
}

interface ProjectCardProps {
  project: ProjectSummary
}

export function ProjectCard({ project }: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status]
  const StatusIcon = statusConfig.icon

  const encodedId = encodeURIComponent(project.project_id)

  return (
    <Link href={`/projects/${encodedId}`}>
      <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight">
            {project.display_name}
          </h3>
          <span
            className={clsx(
              'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0',
              statusConfig.className
            )}
          >
            <StatusIcon className="w-3 h-3" />
            {statusConfig.label}
          </span>
        </div>

        {/* Git remote */}
        <p className="text-xs text-gray-500 truncate mb-4 flex items-center gap-1.5">
          <GitBranch className="w-3 h-3 flex-shrink-0" />
          {project.git_remote.replace('https://', '').replace('.git', '')}
        </p>

        {/* Stats */}
        <div className="mt-auto grid grid-cols-2 gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Layers className="w-3.5 h-3.5 text-gray-400" />
            <span>{project.total_modules} modules</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span>
              {project.last_review_date
                ? formatDistanceToNow(new Date(project.last_review_date), { addSuffix: true })
                : 'Never reviewed'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
