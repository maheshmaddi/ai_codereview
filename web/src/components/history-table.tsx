'use client'

import { GitPullRequest, MessageSquare, Calendar, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface HistoryTableProps {
  reviews: Array<{
    id: string
    pr_number: number
    pr_title: string
    pr_url: string
    reviewed_at: string
    verdict: 'approve' | 'request_changes' | 'comment'
    comment_count: number
    github_review_id: number | null
  }>
  projectId: string
}

export function HistoryTable({ reviews, projectId }: HistoryTableProps) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>PR</th>
          <th>Title</th>
          <th>Verdict</th>
          <th>Comments</th>
          <th>Reviewed At</th>
          <th>Posted</th>
        </tr>
      </thead>
      <tbody>
        {reviews.map((review) => {
          const VerdictIcon = review.verdict === 'approve' ? CheckCircle :
                             review.verdict === 'request_changes' ? XCircle :
                             AlertCircle
          const verdictColor = review.verdict === 'approve' ? '#10b981' :
                             review.verdict === 'request_changes' ? '#ef4444' :
                             '#f59e0b'

          return (
            <tr key={review.id}>
              <td>
                <a
                  href={review.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#60a5fa',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <GitPullRequest size={14} style={{ flexShrink: 0 }} />
                  #{review.pr_number}
                </a>
              </td>
              <td style={{ fontWeight: 500, color: '#374151' }}>{review.pr_title}</td>
              <td>
                <span
                  className={`badge badge-${review.verdict === 'approve' ? 'success' : review.verdict === 'request_changes' ? 'danger' : 'warning'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
                >
                  <VerdictIcon size={12} style={{ flexShrink: 0 }} />
                  {review.verdict}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa' }}>
                  <MessageSquare size={14} style={{ flexShrink: 0 }} />
                  {review.comment_count}
                </div>
              </td>
              <td style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={14} style={{ flexShrink: 0, color: '#94a3b8' }} />
                {new Date(review.reviewed_at).toLocaleString()}
              </td>
              <td>
                {review.github_review_id ? (
                  <Link
                    href={`${review.pr_url}#pullrequestreview-${review.github_review_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="badge badge-success"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      color: '#10b981',
                      textDecoration: 'none',
                    }}
                  >
                    <CheckCircle size={14} />
                    Posted
                  </Link>
                ) : (
                  <Link
                    href={`/reviews/${encodeURIComponent(review.id)}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      backgroundColor: '#60a5fa',
                      color: 'white',
                      borderRadius: 6,
                      textDecoration: 'none',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#60a5fa'}
                  >
                    <ExternalLink size={14} />
                    View
                  </Link>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
