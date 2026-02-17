import { listProjectReviews } from '@/lib/api'

interface Props {
  params: { projectId: string }
}

export default async function ProjectHistoryPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const reviews = await listProjectReviews(projectId)

  return (
    <div>
      <h1 className="page-title">Project History</h1>
      <p className="muted">{projectId}</p>
      {reviews.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>No reviews executed yet for this project.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>PR</th>
              <th>Title</th>
              <th>Verdict</th>
              <th>Comments</th>
              <th>Reviewed At</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review.id}>
                <td>
                  <a href={review.pr_url} target="_blank" rel="noreferrer">
                    #{review.pr_number}
                  </a>
                </td>
                <td>{review.pr_title}</td>
                <td>{review.verdict}</td>
                <td>{review.comment_count}</td>
                <td>{new Date(review.reviewed_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
