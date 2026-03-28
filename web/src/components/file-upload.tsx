'use client'

import { useState, useRef, useCallback } from 'react'
import type { UploadedFile } from '@/lib/api'
import { API_BASE } from '@/lib/api'

interface FileUploadProps {
  projectId: string
  featureId: string
  uploadedFiles: UploadedFile[]
  onUploadComplete: (files: UploadedFile[]) => void
}

const MAX_SIZE_MB = 5
const ALLOWED_EXTS = ['.pdf', '.docx', '.md', '.txt']

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUpload({ projectId, featureId, uploadedFiles, onUploadComplete }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`Only ${ALLOWED_EXTS.join(', ')} files allowed`)
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_SIZE_MB}MB (got ${formatBytes(file.size)})`)
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(
        `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/upload-requirement`,
        { method: 'POST', body: formData }
      )
      if (!res.ok) throw new Error(await res.text())

      // Re-fetch files list
      const filesRes = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/features/${featureId}/uploaded-files`)
      if (filesRes.ok) onUploadComplete(await filesRes.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [projectId, featureId, onUploadComplete])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div>
      <div
        className={`upload-zone${dragOver ? ' upload-zone--dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="upload-zone__icon">📄</div>
        <p className="upload-zone__text">
          {uploading ? 'Uploading…' : 'Drag & drop or click to upload requirement document'}
        </p>
        <p className="upload-zone__limit">PDF, DOCX, MD, TXT · max {MAX_SIZE_MB}MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.md,.txt"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>{error}</p>}

      {uploadedFiles.map((f) => (
        <div key={f.id} className="uploaded-file">
          <span style={{ fontSize: 16 }}>📎</span>
          <span className="uploaded-file__name">{f.original_name}</span>
          <span className="uploaded-file__size">{formatBytes(f.file_size)}</span>
        </div>
      ))}
    </div>
  )
}
