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

export type ModelOption = {
  id: string
  name: string
  provider: string
}

export type GlobalSettings = {
  review_model: string
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

export function getAvailableModels() {
  return apiFetch<ModelOption[]>('/api/settings/models')
}

export function getGlobalSettings() {
  return apiFetch<GlobalSettings>('/api/settings')
}

export function updateGlobalSettings(payload: Partial<GlobalSettings>) {
  return apiFetch<GlobalSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

// PR Check API
export type PRInfo = {
  number: number
  title: string
  html_url: string
  updated_at: string
  has_trigger_label: boolean
}

export type PRCheckResult = {
  total: number
  with_label: number
  without_label: number
  label: string
  prs: PRInfo[]
  prs_to_review?: PRInfo[]
}

export type PRStatus = {
  pr_number: number
  pr_title: string
  status: 'pending_review' | 'already_reviewed'
  reviewed_at?: string
}

export type ReviewTriggerResult = {
  success: boolean
  session_id: string
  review_id: string
  message: string
}

export function checkProjectPRs(
  projectId: string,
  autoTrigger = false
): Promise<Response> {
  return fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/check-prs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_trigger: autoTrigger }),
  })
}

export function triggerPRReview(
  projectId: string,
  prNumber: number,
  prTitle: string,
  prUrl: string
): Promise<ReviewTriggerResult> {
  return apiFetch<ReviewTriggerResult>(
    `/api/projects/${encodeURIComponent(projectId)}/review-pr`,
    {
      method: 'POST',
      body: JSON.stringify({
        pr_number: prNumber,
        pr_title: prTitle,
        pr_url: prUrl,
      }),
    }
  )
}

export function triggerPRReviewsStream(
  projectId: string,
  prs: PRInfo[]
): Promise<Response> {
  return fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/review-prs-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prs }),
  })
}

// ═══════════════════════════════════════════════════════════════
// Feature Lifecycle Types & API
// ═══════════════════════════════════════════════════════════════

export type FeaturePhase = 'architecture' | 'development' | 'testing' | 'completed'

export type Feature = {
  id: string
  project_id: string
  name: string
  current_phase: FeaturePhase
  requirement_file: string | null
  branch_name: string | null
  created_at: string
  updated_at: string
  unanswered_questions?: number
  current_version?: number | null
  current_revision?: PhaseRevision | null
}

export type PhaseRevision = {
  id: number
  feature_id: string
  phase: 'architecture' | 'testing'
  version: number
  content: string
  diagrams: string | null
  status: 'draft' | 'pending_review' | 'revision_requested' | 'approved'
  architect_comments: string | null
  created_at: string
}

export type PhaseQuestion = {
  id: number
  feature_id: string
  phase: string
  question: string
  answer: string | null
  is_highlighted: number
  created_at: string
  answered_at: string | null
}

export type PhaseComment = {
  id: number
  feature_id: string
  phase: string
  revision_version: number | null
  author: string
  content: string
  created_at: string
}

export type DevelopmentStep = {
  id: number
  feature_id: string
  step_name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  detail: string | null
  change_summary: string | null
  created_at: string
  completed_at: string | null
}

export type UploadedFile = {
  id: number
  filename: string
  original_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

// Feature CRUD
export function listFeatures(projectId: string) {
  return apiFetch<Feature[]>(`/api/projects/${encodeURIComponent(projectId)}/features`)
}

export function getFeature(projectId: string, featureId: string) {
  return apiFetch<Feature>(`/api/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}`)
}

export function createFeature(projectId: string, name: string) {
  return apiFetch<Feature>(`/api/projects/${encodeURIComponent(projectId)}/features`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

// Upload requirement
export function uploadRequirement(featureId: string, file: File): Promise<Response> {
  const formData = new FormData()
  formData.append('file', file)
  return fetch(`${API_BASE}/api/features/${encodeURIComponent(featureId)}/upload-requirement`, {
    method: 'POST',
    body: formData,
  })
}

// SSE streaming helper
function createSSEConnection(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Architecture
export function analyzeArchitecture(featureId: string): Promise<Response> {
  return createSSEConnection(`/api/features/${encodeURIComponent(featureId)}/architecture/analyze`, {})
}

export function getArchitectureQuestions(featureId: string) {
  return apiFetch<PhaseQuestion[]>(`/api/features/${encodeURIComponent(featureId)}/architecture/questions`)
}

export function answerQuestion(featureId: string, questionId: number, answer: string) {
  return apiFetch<PhaseQuestion>(`/api/features/${encodeURIComponent(featureId)}/architecture/questions/${questionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
}

export function generateArchitecturePlan(featureId: string): Promise<Response> {
  return createSSEConnection(`/api/features/${encodeURIComponent(featureId)}/architecture/generate-plan`, {})
}

export function getArchitectureRevisions(featureId: string) {
  return apiFetch<PhaseRevision[]>(`/api/features/${encodeURIComponent(featureId)}/architecture/revisions`)
}

export function getArchitectureRevision(featureId: string, version: number) {
  return apiFetch<PhaseRevision>(`/api/features/${encodeURIComponent(featureId)}/architecture/revisions/${version}`)
}

export function reviseArchitecture(featureId: string, comments: string) {
  return apiFetch<PhaseRevision>(`/api/features/${encodeURIComponent(featureId)}/architecture/revise`, {
    method: 'POST',
    body: JSON.stringify({ comments }),
  })
}

export function approveArchitecture(featureId: string) {
  return apiFetch<Feature>(`/api/features/${encodeURIComponent(featureId)}/architecture/approve`, {
    method: 'POST',
  })
}

// Development
export function startDevelopment(featureId: string): Promise<Response> {
  return createSSEConnection(`/api/features/${encodeURIComponent(featureId)}/development/start`, {})
}

export function getDevelopmentStatus(featureId: string) {
  return apiFetch<DevelopmentStep[]>(`/api/features/${encodeURIComponent(featureId)}/development/status`)
}

export function getDevelopmentSummary(featureId: string) {
  return apiFetch<{ summary: string }>(`/api/features/${encodeURIComponent(featureId)}/development/summary`)
}

export function requestDevelopmentChanges(featureId: string, comments: string) {
  return apiFetch<{ message: string }>(`/api/features/${encodeURIComponent(featureId)}/development/request-changes`, {
    method: 'POST',
    body: JSON.stringify({ comments }),
  })
}

export function approveDevelopment(featureId: string) {
  return apiFetch<Feature>(`/api/features/${encodeURIComponent(featureId)}/development/approve`, {
    method: 'POST',
  })
}

// Testing
export function generateTestPlan(featureId: string): Promise<Response> {
  return createSSEConnection(`/api/features/${encodeURIComponent(featureId)}/testing/generate-plan`, {})
}

export function getTestRevisions(featureId: string) {
  return apiFetch<PhaseRevision[]>(`/api/features/${encodeURIComponent(featureId)}/testing/revisions`)
}

export function reviseTestPlan(featureId: string, comments: string) {
  return apiFetch<PhaseRevision>(`/api/features/${encodeURIComponent(featureId)}/testing/revise`, {
    method: 'POST',
    body: JSON.stringify({ comments }),
  })
}

export function approveTesting(featureId: string): Promise<Response> {
  return createSSEConnection(`/api/features/${encodeURIComponent(featureId)}/testing/approve`, {})
}

// Comments
export function getComments(featureId: string, phase?: string) {
  const query = phase ? `?phase=${phase}` : ''
  return apiFetch<PhaseComment[]>(`/api/features/${encodeURIComponent(featureId)}/comments${query}`)
}

export function addComment(featureId: string, phase: string, content: string, revision_version?: number) {
  return apiFetch<PhaseComment>(`/api/features/${encodeURIComponent(featureId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ phase, content, revision_version }),
  })
}

// SSE event reader utility
export function readSSE(response: Response, onEvent: (data: { type: string; [key: string]: unknown }) => void): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return Promise.resolve()

  const decoder = new TextDecoder()
  let buffer = ''

  return reader.read().then(function process({ done, value }): Promise<void> {
    if (done) return Promise.resolve()
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)))
        } catch { /* skip malformed */ }
      }
    }
    return reader.read().then(process)
  })
}
