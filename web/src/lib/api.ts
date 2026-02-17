export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type ProjectSummary = {
  project_id: string
  display_name: string
  git_remote: string
  total_modules: number
  last_review_date: string | null
  last_generated_date: string | null
  status: 'up_to_date' | 'needs_regeneration' | 'draft' | 'not_initialized'
}

export type ProjectIndex = {
  project: string
  git_remote: string
  generated_at: string
  root_codereview: string
  modules: Array<{ name: string; path: string; codereview_file: string }>
  total_files: number
}

export type ProjectSettings = {
  project_id: string
  display_name: string
  git_remote: string
  main_branch: string
  review_model: string
  review_trigger_label: string
  severity_threshold: 'HIGH' | 'MEDIUM' | 'LOW'
  auto_review_enabled: boolean
}

export type ReviewRow = {
  id: string
  pr_number: number
  pr_title: string
  pr_url: string
  reviewed_at: string
  verdict: 'approve' | 'request_changes' | 'comment'
  comment_count: number
}

export type ReviewDocument = {
  project_id: string
  module_name: string | null
  file_path: string
  content: string
  last_modified: string
  version: number
}

export type DocumentVersion = {
  version: number
  modified_at: string
  modified_by: string
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function listProjects() {
  return apiFetch<ProjectSummary[]>('/api/projects')
}

export function getProjectIndex(projectId: string) {
  return apiFetch<ProjectIndex>(`/api/projects/${encodeURIComponent(projectId)}/index`)
}

export function getProjectSettings(projectId: string) {
  return apiFetch<ProjectSettings>(`/api/projects/${encodeURIComponent(projectId)}/settings`)
}

export function listProjectReviews(projectId: string) {
  return apiFetch<ReviewRow[]>(`/api/projects/${encodeURIComponent(projectId)}/reviews`)
}

export function getDocument(projectId: string, moduleName: string | null) {
  const query = moduleName ? `?module=${encodeURIComponent(moduleName)}` : ''
  return apiFetch<ReviewDocument>(`/api/projects/${encodeURIComponent(projectId)}/document${query}`)
}

export function getDocumentVersions(projectId: string, moduleName: string | null) {
  const query = moduleName ? `?module=${encodeURIComponent(moduleName)}` : ''
  return apiFetch<DocumentVersion[]>(
    `/api/projects/${encodeURIComponent(projectId)}/document/versions${query}`
  )
}

export function updateDocument(projectId: string, moduleName: string | null, content: string) {
  return apiFetch<{ success: boolean; file_path: string; version: number }>(
    `/api/projects/${encodeURIComponent(projectId)}/document`,
    {
      method: 'PUT',
      body: JSON.stringify({ module: moduleName, content }),
    }
  )
}

export function updateProjectSettings(
  projectId: string,
  payload: Partial<Pick<ProjectSettings, 'display_name' | 'main_branch' | 'review_model' | 'review_trigger_label' | 'severity_threshold' | 'auto_review_enabled'>>
) {
  return apiFetch<ProjectSettings>(`/api/projects/${encodeURIComponent(projectId)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
