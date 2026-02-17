'use client'

export function DeleteProjectForm({ projectId }: { projectId: string }) {
  return (
    <form
      action={`/api/projects/${encodeURIComponent(projectId)}/delete`}
      method="POST"
      style={{ marginTop: 10 }}
      onSubmit={(e) => {
        const ok = window.confirm(
          'Delete this project and clear its store data? This cannot be undone.'
        )
        if (!ok) e.preventDefault()
      }}
    >
      <button className="btn danger" type="submit">
        Delete Project
      </button>
    </form>
  )
}
