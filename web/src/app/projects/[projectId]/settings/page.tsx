import { getProjectSettings } from '@/lib/api'
import { ProjectSettingsForm } from '@/components/project-settings-form'
import { DeleteProjectForm } from '@/components/delete-project-form'

interface Props {
  params: { projectId: string }
}

export default async function ProjectSettingsPage({ params }: Props) {
  const projectId = decodeURIComponent(params.projectId)
  const settings = await getProjectSettings(projectId)

  return (
    <div>
      <h1 className="page-title">Project Settings</h1>
      <p className="muted">{projectId}</p>
      <ProjectSettingsForm projectId={projectId} initial={settings} />

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Danger Zone</h3>
        <p className="muted">
          Deletes this project from the database and removes its centralized store files.
        </p>
        <DeleteProjectForm projectId={projectId} />
      </div>
    </div>
  )
}
