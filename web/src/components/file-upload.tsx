'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X } from 'lucide-react'
import { uploadRequirement } from '@/lib/api'

interface Props {
  featureId: string
  onUploaded?: (filename: string) => void
}

export function FileUpload({ featureId, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    const allowed = ['.pdf', '.docx', '.md', '.txt']
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowed.includes(ext)) {
      setError(`Invalid file type. Allowed: ${allowed.join(', ')}`)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const res = await uploadRequirement(featureId, file)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }
      const data = await res.json()
      setUploadedFile(data.original_name)
      onUploaded?.(data.original_name)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [featureId, onUploaded])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="file-upload">
      <h4 style={{ marginBottom: 8 }}>Upload Requirements</h4>
      {uploadedFile ? (
        <div className="file-upload__success">
          <FileText size={16} />
          <span>{uploadedFile}</span>
          <button className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => setUploadedFile(null)}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          className={`file-upload__dropzone ${dragging ? 'file-upload__dropzone--active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={24} />
          <p>Drag & drop or click to upload</p>
          <p className="muted" style={{ fontSize: 12 }}>PDF, DOCX, MD, TXT (max 5MB)</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.md,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      {uploading && <p className="muted" style={{ marginTop: 4 }}>Uploading...</p>}
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</p>}
    </div>
  )
}
