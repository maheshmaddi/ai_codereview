'use client'

import { useState } from 'react'
import type { ProjectSettings } from '@/lib/api'
import { updateProjectSettings } from '@/lib/api'

export function ProjectSettingsForm({
  projectId,
  initial,
}: {
  projectId: string
  initial: ProjectSettings
}) {
  const [displayName, setDisplayName] = useState(initial.display_name)
  const [mainBranch, setMainBranch] = useState(initial.main_branch)
  const [severity, setSeverity] = useState(initial.severity_threshold)
  const [autoReview, setAutoReview] = useState(initial.auto_review_enabled)
  const [status, setStatus] = useState('Idle')

  const save = async () => {
    setStatus('Saving...')
    try {
      await updateProjectSettings(projectId, {
        display_name: displayName,
        main_branch: mainBranch,
        severity_threshold: severity,
        auto_review_enabled: autoReview,
      })
      setStatus('Saved')
    } catch (error) {
      setStatus(`Save failed: ${(error as Error).message}`)
    }
  }

  return (
    <div className="card">
      <div className="list">
        <label>
          <div className="muted">Display Name</div>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          <div className="muted">Main Branch</div>
          <input className="input" value={mainBranch} onChange={(e) => setMainBranch(e.target.value)} />
        </label>
        <label>
          <div className="muted">Severity Threshold</div>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as ProjectSettings['severity_threshold'])}>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </label>
        <label className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <input type="checkbox" checked={autoReview} onChange={(e) => setAutoReview(e.target.checked)} />
          <span>Auto review enabled</span>
        </label>
      </div>
      <div className="toolbar">
        <button className="btn primary" onClick={save}>Save Settings</button>
        <span className="muted">{status}</span>
      </div>
    </div>
  )
}
