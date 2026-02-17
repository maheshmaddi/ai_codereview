/**
 * Client for interacting with the centralized code review store
 * via the backend API server.
 */

import type {
  CodeReviewIndex,
  ProjectSettings,
  ProjectSummary,
  ReviewDocument,
  ReviewHistoryEntry,
  ReviewOutput,
  DocumentVersion,
} from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`API error ${res.status}: ${error}`)
  }

  return res.json() as Promise<T>
}

// ---- Project APIs ----

export async function listProjects(): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>('/api/projects')
}

export async function getProjectIndex(projectId: string): Promise<CodeReviewIndex> {
  return apiFetch<CodeReviewIndex>(`/api/projects/${encodeURIComponent(projectId)}/index`)
}

export async function getProjectSettings(projectId: string): Promise<ProjectSettings> {
  return apiFetch<ProjectSettings>(`/api/projects/${encodeURIComponent(projectId)}/settings`)
}

export async function updateProjectSettings(
  projectId: string,
  settings: Partial<ProjectSettings>
): Promise<ProjectSettings> {
  return apiFetch<ProjectSettings>(`/api/projects/${encodeURIComponent(projectId)}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}

export async function triggerInitialization(projectId: string): Promise<{ session_id: string }> {
  return apiFetch<{ session_id: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/initialize`,
    { method: 'POST' }
  )
}

// ---- Document APIs ----

export async function getDocument(
  projectId: string,
  moduleNameOrRoot: string | null
): Promise<ReviewDocument> {
  const module = moduleNameOrRoot ? `?module=${encodeURIComponent(moduleNameOrRoot)}` : ''
  return apiFetch<ReviewDocument>(`/api/projects/${encodeURIComponent(projectId)}/document${module}`)
}

export async function updateDocument(
  projectId: string,
  moduleNameOrRoot: string | null,
  content: string
): Promise<ReviewDocument> {
  return apiFetch<ReviewDocument>(
    `/api/projects/${encodeURIComponent(projectId)}/document`,
    {
      method: 'PUT',
      body: JSON.stringify({ module: moduleNameOrRoot, content }),
    }
  )
}

export async function getDocumentVersions(
  projectId: string,
  moduleNameOrRoot: string | null
): Promise<DocumentVersion[]> {
  const module = moduleNameOrRoot ? `?module=${encodeURIComponent(moduleNameOrRoot)}` : ''
  return apiFetch<DocumentVersion[]>(
    `/api/projects/${encodeURIComponent(projectId)}/document/versions${module}`
  )
}

// ---- Review History APIs ----

export async function listReviews(projectId: string): Promise<ReviewHistoryEntry[]> {
  return apiFetch<ReviewHistoryEntry[]>(
    `/api/projects/${encodeURIComponent(projectId)}/reviews`
  )
}

export async function getReview(reviewId: string): Promise<ReviewOutput> {
  return apiFetch<ReviewOutput>(`/api/reviews/${encodeURIComponent(reviewId)}`)
}

// ---- OpenCode Session APIs ----

export async function getSessionStatus(sessionId: string): Promise<{
  status: 'running' | 'completed' | 'error'
  progress?: string
}> {
  return apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/status`)
}
