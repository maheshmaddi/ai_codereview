import { listReviews, getProjectIndex } from '@/lib/store-client'
import { PageHeader } from '@/components/ui/page-header'
import { ReviewTimeline } from '@/components/history/review-timeline'

interface PageProps {
  params: { projectId: string }
}

export default async function ReviewHistoryPage({ params }: PageProps) {
  const projectId = decodeURIComponent(params.projectId)

  const [reviews, index] = await Promise.all([
    listReviews(projectId),
    getProjectIndex(projectId),
  ])

  return (
    <div className="p-6">
      <PageHeader
        title="Review History"
        description={`All code reviews for ${index.project}`}
      />

      <div className="mt-6">
        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              No reviews have been run for this project yet.
            </p>
          </div>
        ) : (
          <ReviewTimeline reviews={reviews} />
        )}
      </div>
    </div>
  )
}
