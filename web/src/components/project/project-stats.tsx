import { Layers, FileText, Clock, Settings as SettingsIcon } from 'lucide-react'
import type { CodeReviewIndex, ProjectSettings, ReviewHistoryEntry } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

interface ProjectStatsProps {
  index: CodeReviewIndex
  reviews: ReviewHistoryEntry[]
  settings: ProjectSettings
}

export function ProjectStats({ index, reviews, settings }: ProjectStatsProps) {
  const lastReview = reviews[0]

  const stats = [
    {
      label: 'Total Modules',
      value: index.modules.length,
      icon: Layers,
    },
    {
      label: 'Total Documents',
      value: index.total_files,
      icon: FileText,
    },
    {
      label: 'Last Review',
      value: lastReview
        ? formatDistanceToNow(new Date(lastReview.reviewed_at), { addSuffix: true })
        : 'Never',
      icon: Clock,
    },
    {
      label: 'Review Model',
      value: settings.review_model.split('/').pop() ?? settings.review_model,
      icon: SettingsIcon,
    },
  ]

  return (
    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-500 font-medium">{label}</p>
          </div>
          <p className="text-lg font-semibold text-gray-900 truncate" title={String(value)}>
            {value}
          </p>
        </div>
      ))}
    </div>
  )
}
