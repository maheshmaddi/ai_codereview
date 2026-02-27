import { getReviewDetails } from '@/lib/api'
import { ArrowLeft, GitPullRequest, AlertTriangle, AlertCircle, CheckCircle, FileText } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: { reviewId: string }
}

export default async function ReviewDetailsPage({ params }: PageProps) {
  const reviewId = decodeURIComponent(params.reviewId)
  let reviewData
  let error = null

  try {
    reviewData = await getReviewDetails(reviewId)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load review'
  }

  if (error) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 24 }}>
          <Link href="/projects" style={{ color: '#60a5fa' }}>
            <ArrowLeft size={24} />
          </Link>
          <h1 className="page-title">Review Not Found</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
          {error}
        </div>
      </div>
    )
  }

  if (!reviewData?.comments && !reviewData?.summary) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 24 }}>
          <Link href="/projects" style={{ color: '#60a5fa' }}>
            <ArrowLeft size={24} />
          </Link>
          <h1 className="page-title">Review Not Found</h1>
        </div>
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
          No review data found. The review files may have been corrupted or deleted.
        </div>
      </div>
    )
  }

  const comments = reviewData.comments
  const summary = reviewData.summary

  const VerdictIcon = comments?.verdict === 'approve' ? CheckCircle :
                     comments?.verdict === 'request_changes' ? AlertTriangle :
                     AlertCircle
  const verdictColor = comments?.verdict === 'approve' ? '#10b981' :
                      comments?.verdict === 'request_changes' ? '#ef4444' :
                      '#f59e0b'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 24 }}>
        <Link href="/projects" style={{ color: '#60a5fa' }}>
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="page-title">Code Review Details</h1>
          <p className="muted">{reviewId}</p>
        </div>
      </div>

      {comments && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <GitPullRequest size={20} style={{ color: '#60a5fa' }} />
                <a
                  href={`https://github.com/${comments.repository}/pull/${comments.pr_number}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}
                >
                  #{comments.pr_number}
                </a>
                <span style={{ color: '#64748b' }}>•</span>
                <span style={{ color: '#374151' }}>{comments.repository}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <VerdictIcon size={20} style={{ color: verdictColor }} />
              <span className="badge" style={{
                padding: '6px 12px',
                backgroundColor: verdictColor + '20',
                color: verdictColor,
                fontWeight: 600
              }}>
                {comments.verdict}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8, color: '#1f2937' }}>Overall Summary</h3>
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 16
            }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#374151' }}>
                {comments.overall_summary}
              </div>
            </div>
          </div>

          {comments.comments && comments.comments.length > 0 ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <FileText size={20} style={{ color: '#60a5fa' }} />
                <h3 style={{ color: '#1f2937', margin: 0 }}>
                  Comments ({comments.comments.length})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {comments.comments.map((comment, idx) => {
                  const severityColor = comment.severity === 'HIGH' ? '#ef4444' :
                                      comment.severity === 'MEDIUM' ? '#f59e0b' :
                                      '#10b981'

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: 16
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: 4 }}>
                            {comment.file}
                            {comment.start_line && comment.end_line && (
                              <span>
                                {` (lines ${comment.start_line}-${comment.end_line})`}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span className="badge" style={{
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              backgroundColor: severityColor + '20',
                              color: severityColor,
                              fontWeight: 600
                            }}>
                              {comment.severity}
                            </span>
                            <span className="badge" style={{
                              padding: '2px 8px',
                              fontSize: '0.75rem',
                              backgroundColor: '#e0e7ff',
                              color: '#4f46e5'
                            }}>
                              {comment.category}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ lineHeight: 1.6, color: '#374151' }}>
                        {comment.body}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              No detailed comments available. The review_comments.json file may be empty or missing.
            </div>
          )}
        </div>
      )}

      {summary && !comments && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <FileText size={20} style={{ color: '#60a5fa' }} />
            <h3 style={{ color: '#1f2937', margin: 0 }}>Review Summary</h3>
          </div>
          <div style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 16
          }}>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#374151' }}>
              {summary}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
