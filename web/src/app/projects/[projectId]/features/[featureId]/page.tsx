import { redirect } from 'next/navigation'
import { getFeature } from '@/lib/api'

interface Props {
  params: { projectId: string; featureId: string }
}

export default async function FeatureIndexPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const feature = await getFeature(projectId, params.featureId)
  const phase = feature.current_phase === 'completed' ? 'testing' : feature.current_phase
  redirect(`/projects/${encodeURIComponent(projectId)}/features/${params.featureId}/${phase}`)
}
