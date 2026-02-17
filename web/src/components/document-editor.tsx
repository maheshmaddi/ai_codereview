'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DocumentVersion, ProjectIndex, ReviewDocument } from '@/lib/api'
import { API_BASE } from '@/lib/api'

type Props = {
  projectId: string
  selectedModule: string | null
  index: ProjectIndex
  document: ReviewDocument
  versions: DocumentVersion[]
}

export function DocumentEditor({ projectId, selectedModule, index, document, versions }: Props) {
  const [content, setContent] = useState(document.content)
  const [viewMode, setViewMode] = useState<'split' | 'write' | 'preview'>('split')
  const [isPending, startTransition] = useTransition()
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const syncingSourceRef = useRef<'editor' | 'preview' | null>(null)
  const releaseTimerRef = useRef<number | null>(null)

  const title = selectedModule ? `${selectedModule}_codereview.md` : index.root_codereview
  const isDirty = content !== document.content

  const save = useCallback(() => {
    if (isPending) return
    startTransition(async () => {
      const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/document`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: selectedModule, content }),
      })
      if (!response.ok) {
        // Keep this minimal; save button state communicates dirty/saved state.
        console.error(`Save failed: ${response.status}`)
      }
    })
  }, [content, isPending, projectId, selectedModule, startTransition])

  useEffect(() => {
    // Ensure editor reflects the newly selected document/module.
    setContent(document.content)
  }, [document.content, document.version, document.last_modified, selectedModule])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const savePressed = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
      if (!savePressed) return
      event.preventDefault()
      save()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  const lineCount = useMemo(() => content.split('\n').length, [content])
  const wordCount = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean)
    return words.length
  }, [content])

  const showEditor = viewMode === 'split' || viewMode === 'write'
  const showPreview = viewMode === 'split' || viewMode === 'preview'

  const releaseSyncLock = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current)
    }
    releaseTimerRef.current = window.setTimeout(() => {
      syncingSourceRef.current = null
      releaseTimerRef.current = null
    }, 60)
  }, [])

  const syncEditorToPreview = useCallback(() => {
    const editorEl = editorRef.current
    const previewEl = previewRef.current
    if (!editorEl || !previewEl) return

    const maxEditor = Math.max(editorEl.scrollHeight - editorEl.clientHeight, 1)
    const ratio = editorEl.scrollTop / maxEditor
    const maxPreview = Math.max(previewEl.scrollHeight - previewEl.clientHeight, 1)
    previewEl.scrollTop = ratio * maxPreview
  }, [])

  const syncPreviewToEditor = useCallback(() => {
    const editorEl = editorRef.current
    const previewEl = previewRef.current
    if (!editorEl || !previewEl) return

    const maxPreview = Math.max(previewEl.scrollHeight - previewEl.clientHeight, 1)
    const ratio = previewEl.scrollTop / maxPreview
    const maxEditor = Math.max(editorEl.scrollHeight - editorEl.clientHeight, 1)
    editorEl.scrollTop = ratio * maxEditor
  }, [])

  const onEditorScroll = useCallback(() => {
    if (viewMode !== 'split') return
    if (syncingSourceRef.current === 'preview') return
    syncingSourceRef.current = 'editor'
    syncEditorToPreview()
    releaseSyncLock()
  }, [releaseSyncLock, syncEditorToPreview, viewMode])

  const onPreviewScroll = useCallback(() => {
    if (viewMode !== 'split') return
    if (syncingSourceRef.current === 'editor') return
    syncingSourceRef.current = 'preview'
    syncPreviewToEditor()
    releaseSyncLock()
  }, [releaseSyncLock, syncPreviewToEditor, viewMode])

  useEffect(() => {
    if (viewMode === 'split') {
      syncEditorToPreview()
    }
  }, [content, syncEditorToPreview, viewMode])

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <div>
          <h2 className="page-title" style={{ fontSize: 18 }}>{title}</h2>
          <p className="muted">{lineCount} lines · {wordCount} words</p>
        </div>
        <div className="editor-controls">
          <select
            className="select"
            style={{ width: 120 }}
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as typeof viewMode)}
          >
            <option value="split">Split View</option>
            <option value="write">Editor Only</option>
            <option value="preview">Preview Only</option>
          </select>
          <button
            className={`btn ${isDirty ? 'primary' : ''}`}
            onClick={save}
            disabled={isPending || !isDirty}
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="split">
        {showEditor ? (
          <div className="panel">
            <strong>Editor</strong>
            <textarea
              ref={editorRef}
              className="textarea"
              style={{ marginTop: 8, fontFamily: 'Consolas, monospace', fontSize: 13 }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={onEditorScroll}
            />
          </div>
        ) : <div />}
        {showPreview ? (
          <div className="panel">
            <strong>Preview</strong>
            <div
              ref={previewRef}
              className="preview markdown-body"
              style={{ marginTop: 8, maxHeight: 520, overflowY: 'auto' }}
              onScroll={onPreviewScroll}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        ) : <div />}
        <div className="panel">
          <strong>Save Hints</strong>
          <p className="muted" style={{ marginTop: 8 }}>Use Ctrl/Cmd + S to save quickly.</p>
          <p className="muted">Switch view mode from the top-right dropdown.</p>
        </div>
      </div>

      <details className="meta-collapsible panel">
        <summary>Metadata & Version History</summary>
        <div className="meta-list">
          <div className="meta-item"><strong>Project:</strong> {index.project}</div>
          <div className="meta-item"><strong>Module:</strong> {selectedModule ?? 'root'}</div>
          <div className="meta-item"><strong>Version:</strong> {document.version}</div>
          <div className="meta-item"><strong>Last Modified:</strong> {new Date(document.last_modified).toLocaleString()}</div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Version History</p>
        <div className="version-list">
          {versions.length === 0 ? (
            <div className="version-item">No version history yet</div>
          ) : (
            versions.map((version) => (
              <div key={`${version.version}-${version.modified_at}`} className="version-item">
                <div><strong>v{version.version}</strong></div>
                <div>{version.modified_by}</div>
                <div>{new Date(version.modified_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  )
}
