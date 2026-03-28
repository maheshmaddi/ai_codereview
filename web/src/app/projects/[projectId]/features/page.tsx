import { listFeatures } from '@/lib/api'
import { FeatureListPage } from './features-client'

interface Props {
  params: { projectId: string }
}

export default async function FeaturesPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const features = await listFeatures(projectId).catch(() => [])

  return <FeatureListPage projectId={projectId} initialFeatures={features} />
}
