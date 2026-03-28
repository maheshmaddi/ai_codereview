'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Feature } from '@/lib/api'
import { createFeature, listFeatures } from '@/lib/api'
import { FeatureList } from '@/components/feature-list'
import { CreateFeatureDialog } from '@/components/create-feature-dialog'

interface Props {
  projectId: string
  initialFeatures: Feature[]
}

export function FeatureListPage({ projectId, initialFeatures }: Props) {
  const [features, setFeatures] = useState(initialFeatures)
  const [dialogOpen, setDialogOpen] = useState(false)

  const refresh = async () => {
    const data = await listFeatures(projectId)
    setFeatures(data)
  }

  const handleCreate = async (name: string) => {
    await createFeature(projectId, name)
    await refresh()
  }

  return (
    <div>
      <div className="hero">
        <div>
          <Link className="muted" href={`/projects/${encodeURIComponent(projectId)}`} style={{ fontSize: 13 }}>
            &larr; Back to project
          </Link>
          <h1 className="page-title">Features</h1>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <FeatureList projectId={projectId} features={features} onCreateClick={() => setDialogOpen(true)} />
      </div>
      <CreateFeatureDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmit={handleCreate} />
    </div>
  )
}
