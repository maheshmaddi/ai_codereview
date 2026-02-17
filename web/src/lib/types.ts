// ---- Project & Store Types ----

export interface CodeReviewModule {
  name: string
  path: string
  codereview_file: string
}

export interface CodeReviewIndex {
  project: string
  git_remote: string
  generated_at: string
  root_codereview: string
  modules: CodeReviewModule[]
  total_files: number
}

export interface ProjectSettings {
  project_id: string
  display_name: string
  git_remote: string
  github_token_ref: string
  main_branch: string
  auto_review_enabled: boolean
  review_trigger_label: string
  post_clone_scripts: string[]
  review_model: string
  excluded_paths: string[]
  max_diff_lines: number
  severity_threshold: 'HIGH' | 'MEDIUM' | 'LOW'
}

export type ProjectStatus = 'up_to_date' | 'needs_regeneration' | 'draft' | 'not_initialized'

export interface ProjectSummary {
  project_id: string
  display_name: string
  git_remote: string
  total_modules: number
  last_review_date: string | null
  last_generated_date: string | null
  status: ProjectStatus
}

// ---- Review Types ----

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW'
export type ReviewCategory =
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'BUG'
  | 'CODE_QUALITY'
  | 'TESTING'
  | 'DOCUMENTATION'
export type ReviewVerdict = 'approve' | 'request_changes' | 'comment'

export interface ReviewComment {
  file: string
  start_line: number
  end_line: number
  severity: Severity
  category: ReviewCategory
  body: string
}

export interface ReviewOutput {
  pr_number: number
  repository: string
  reviewed_at: string
  overall_summary: string
  verdict: ReviewVerdict
  comments: ReviewComment[]
}

export interface ReviewHistoryEntry {
  id: string
  pr_number: number
  pr_title: string
  pr_url: string
  repository: string
  reviewed_at: string
  verdict: ReviewVerdict
  comment_count: number
  review_dir: string
}

// ---- Document Types ----

export interface ReviewDocument {
  project_id: string
  module_name: string | null // null for root
  file_path: string
  content: string
  last_modified: string
  version: number
}

export interface DocumentVersion {
  version: number
  content: string
  modified_at: string
  modified_by: string
}

// ---- API Response Types ----

export interface ApiResponse<T> {
  data: T
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}
