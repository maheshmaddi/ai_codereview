import Link from 'next/link'
import { ExternalLink, MessageSquare, CheckCircle2, XCircle, MessageCircle } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { ReviewHistoryEntry, ReviewVerdict } from '@/lib/types'
import { clsx } from 'clsx'

const VERDICT_CONFIG: Record<
  ReviewVerdict,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  approve: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'text-green-600 bg-green-50 border-green-200',
  },
  request_changes: {
    label: 'Changes Requested',
    icon: XCircle,
    className: 'text-red-600 bg-red-50 border-red-200',
  },
  comment: {
    label: 'Commented',
    icon: MessageCircle,
    className: 'text-blue-600 bg-blue-50 border-blue-200',
  },
}

interface ReviewTimelineProps {
  reviews: ReviewHistoryEntry[]
}

export function ReviewTimeline({ reviews }: ReviewTimelineProps) {
  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200" />

      <div className="space-y-4">
        {reviews.map((review) => {
          const config = VERDICT_CONFIG[review.verdict]
          const VerdictIcon = config.icon

          return (
            <div key={review.id} className="relative flex gap-4 pl-14">
              {/* Timeline dot */}
              <div className="absolute left-4 -translate-x-1/2 mt-3">
                <VerdictIcon
                  className={clsx('w-5 h-5 ring-4 ring-white rounded-full', {
                    'text-green-500': review.verdict === 'approve',
                    'text-red-500': review.verdict === 'request_changes',
                    'text-blue-500': review.verdict === 'comment',
                  })}
                />
              </div>

              {/* Card */}
              <div className="card flex-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-500">
                        PR #{review.pr_number}
                      </span>
                      <span
                        className={clsx(
                          'text-xs font-medium px-2 py-0.5 rounded-full border',
                          config.className
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {review.pr_title}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <MessageSquare className="w-3 h-3" />
                        {review.comment_count} comments
                      </span>
                      <span className="text-xs text-gray-400" title={review.reviewed_at}>
                        {format(new Date(review.reviewed_at), 'MMM d, yyyy')} ·{' '}
                        {formatDistanceToNow(new Date(review.reviewed_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={review.pr_url}
                    target="_blank"
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View PR
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
