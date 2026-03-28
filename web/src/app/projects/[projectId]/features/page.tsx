import Link from 'next/link'
import { listFeatures, getProjectSettings } from '@/lib/api'
import { FeatureList } from '@/components/feature-list'
import { CreateFeatureDialog } from '@/components/create-feature-dialog'

interface Props {
  params: { projectId: string }
}

export default async function FeaturesPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const [settings, features] = await Promise.all([
    getProjectSettings(projectId),
    listFeatures(projectId),
  ])

  return (
    <div>
      <div className="hero">
        <div>
          <h1 className="page-title">Features</h1>
          <p className="muted">{settings.display_name}</p>
        </div>
        <div className="toolbar" style={{ marginTop: 0 }}>
          <CreateFeatureDialog projectId={projectId} />
          <Link className="btn ghost" href={`/projects/${encodeURIComponent(projectId)}`}>
            ← Back to Project
          </Link>
        </div>
      </div>

      <FeatureList features={features} projectId={projectId} />
    </div>
  )
}
