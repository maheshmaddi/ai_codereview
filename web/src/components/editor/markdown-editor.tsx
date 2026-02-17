'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Save, Eye, Code, History, RotateCcw } from 'lucide-react'
import { updateDocument } from '@/lib/store-client'
import { formatDistanceToNow } from 'date-fns'

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false }
)

type ViewMode = 'editor' | 'preview' | 'split'

interface MarkdownEditorProps {
  projectId: string
  moduleName: string | null
  initialContent: string
  lastModified: string
  version: number
}

export function MarkdownEditor({
  projectId,
  moduleName,
  initialContent,
  lastModified,
  version,
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const handleChange = useCallback((value: string | undefined) => {
    setContent(value ?? '')
    setIsDirty(true)
    setError(null)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateDocument(projectId, moduleName, content)
      setSavedAt(new Date())
      setIsDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setContent(initialContent)
    setIsDirty(false)
    setError(null)
  }

  const VIEW_BUTTONS: { mode: ViewMode; icon: typeof Code; label: string }[] = [
    { mode: 'editor', icon: Code, label: 'Editor' },
    { mode: 'preview', icon: Eye, label: 'Preview' },
    { mode: 'split', icon: History, label: 'Split' },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
        {/* View mode toggle */}
        <div className="flex items-center bg-white border border-gray-200 rounded-md overflow-hidden">
          {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Status */}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {savedAt && !isDirty && (
          <p className="text-xs text-gray-400">
            Saved {formatDistanceToNow(savedAt, { addSuffix: true })}
          </p>
        )}
        {!isDirty && !savedAt && (
          <p className="text-xs text-gray-400">
            v{version} · Modified{' '}
            {formatDistanceToNow(new Date(lastModified), { addSuffix: true })}
          </p>
        )}

        {/* Actions */}
        {isDirty && (
          <button
            onClick={handleReset}
            className="btn-secondary text-xs py-1 px-2"
            title="Discard changes"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Monaco editor pane */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div className={viewMode === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'}>
            <MonacoEditor
              height="100%"
              language="markdown"
              value={content}
              onChange={handleChange}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
                tabSize: 2,
              }}
              theme="vs"
            />
          </div>
        )}

        {/* Preview pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className={`overflow-y-auto p-6 ${
              viewMode === 'split' ? 'w-1/2' : 'w-full'
            }`}
          >
            <article className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          </div>
        )}
      </div>
    </div>
  )
}
