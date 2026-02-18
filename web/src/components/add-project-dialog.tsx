'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type EventLine = {
    id: number
    type: string
    message: string
}

type Phase = 'idle' | 'running' | 'done' | 'error'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function AddProjectDialog({ onDone }: { onDone?: () => void }) {
    const [open, setOpen] = useState(false)
    const [gitUrl, setGitUrl] = useState('')
    const [phase, setPhase] = useState<Phase>('idle')
    const [lines, setLines] = useState<EventLine[]>([])
    const [doneProjectId, setDoneProjectId] = useState<string | null>(null)
    const logRef = useRef<HTMLDivElement>(null)
    const lineId = useRef(0)

    // Auto-scroll log to bottom
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight
        }
    }, [lines])

    const addLine = (type: string, message: string) => {
        setLines((prev) => [...prev, { id: lineId.current++, type, message }])
    }

    const handleStart = async () => {
        if (!gitUrl.trim()) return
        setPhase('running')
        setLines([])
        setDoneProjectId(null)

        try {
            const response = await fetch(`${API_BASE}/api/projects/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ git_url: gitUrl.trim() }),
            })

            if (!response.ok || !response.body) {
                const err = await response.json().catch(() => ({ error: 'Unknown error' }))
                addLine('error', err.error ?? 'Request failed')
                setPhase('error')
                return
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const parts = buffer.split('\n\n')
                buffer = parts.pop() ?? ''

                for (const part of parts) {
                    const line = part.replace(/^data: /, '').trim()
                    if (!line) continue
                    try {
                        const event = JSON.parse(line)
                        addLine(event.type, event.message ?? '')
                        if (event.type === 'done') {
                            setDoneProjectId(event.project_id ?? null)
                            setPhase('done')
                            onDone?.()
                        } else if (event.type === 'error') {
                            setPhase('error')
                        }
                    } catch {
                        // ignore parse errors
                    }
                }
            }

            if (phase === 'running') setPhase('done')
        } catch (e) {
            addLine('error', (e as Error).message)
            setPhase('error')
        }
    }

    const handleClose = () => {
        setOpen(false)
        setPhase('idle')
        setLines([])
        setGitUrl('')
        setDoneProjectId(null)
    }

    const lineColor = (type: string) => {
        if (type === 'error') return '#ef4444'
        if (type === 'done') return '#22c55e'
        if (type === 'session_event') return '#94a3b8'
        return '#e2e8f0'
    }

    return (
        <>
            <button className="btn primary" onClick={() => setOpen(true)}>
                + Add Project
            </button>

            {open && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 12, padding: 24,
                        width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        display: 'flex', flexDirection: 'column', gap: 16,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: 18 }}>Add Project</h2>
                            <button
                                className="btn"
                                onClick={handleClose}
                                disabled={phase === 'running'}
                                style={{ padding: '4px 10px' }}
                            >✕</button>
                        </div>

                        {phase !== 'done' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    className="input"
                                    placeholder="https://github.com/org/repo.git"
                                    value={gitUrl}
                                    onChange={(e) => setGitUrl(e.target.value)}
                                    disabled={phase === 'running'}
                                    onKeyDown={(e) => e.key === 'Enter' && phase === 'idle' && handleStart()}
                                    style={{ flex: 1 }}
                                />
                                <button
                                    className="btn primary"
                                    onClick={handleStart}
                                    disabled={phase === 'running' || !gitUrl.trim()}
                                >
                                    {phase === 'running' ? 'Running...' : 'Start'}
                                </button>
                            </div>
                        )}

                        {lines.length > 0 && (
                            <div
                                ref={logRef}
                                style={{
                                    background: '#0f172a', borderRadius: 8, padding: 12,
                                    height: 320, overflowY: 'auto', fontFamily: 'monospace',
                                    fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2,
                                }}
                            >
                                {lines.map((l) => (
                                    <div key={l.id} style={{ color: lineColor(l.type), wordBreak: 'break-all' }}>
                                        {l.type === 'session_event' ? (
                                            <span style={{ color: '#64748b' }}>{l.message}</span>
                                        ) : (
                                            <>
                                                <span style={{ color: '#475569', marginRight: 6 }}>
                                                    [{l.type}]
                                                </span>
                                                {l.message}
                                            </>
                                        )}
                                    </div>
                                ))}
                                {phase === 'running' && (
                                    <div style={{ color: '#fbbf24', marginTop: 4 }}>
                                        ⏳ Processing...
                                    </div>
                                )}
                            </div>
                        )}

                        {phase === 'done' && (
                            <div style={{
                                background: '#f0fdf4', border: '1px solid #86efac',
                                borderRadius: 8, padding: 12, display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span style={{ color: '#15803d', fontWeight: 600 }}>
                                    ✅ Project added successfully!
                                </span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {doneProjectId && (
                                        <Link
                                            href={`/projects/${encodeURIComponent(doneProjectId)}`}
                                            className="btn primary"
                                            onClick={handleClose}
                                        >
                                            Open Project →
                                        </Link>
                                    )}
                                    <button className="btn" onClick={handleClose}>Close</button>
                                </div>
                            </div>
                        )}

                        {phase === 'error' && (
                            <div style={{
                                background: '#fef2f2', border: '1px solid #fca5a5',
                                borderRadius: 8, padding: 12, display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span style={{ color: '#dc2626' }}>
                                    ❌ An error occurred. Check the log above.
                                </span>
                                <button className="btn" onClick={() => setPhase('idle')}>Try Again</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
