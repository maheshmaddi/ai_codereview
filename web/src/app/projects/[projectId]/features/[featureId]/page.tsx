import { redirect } from 'next/navigation'
import { getFeature } from '@/lib/api'

interface Props {
  params: { projectId: string; featureId: string }
}

export default async function FeaturePage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const featureId = params.featureId

  const feature = await getFeature(projectId, featureId).catch(() => null)

  if (!feature) {
    return <div className="card" style={{ marginTop: 12 }}><p>Feature not found.</p></div>
  }

  const phase = feature.current_phase === 'completed' ? 'testing' : feature.current_phase
  redirect(`/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/${phase}`)
}
