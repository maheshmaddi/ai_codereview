'use client'

import type { DevelopmentStep } from '@/lib/api'

const STEP_LABELS: Record<string, string> = {
  branch_created: 'Create Git Branch',
  code_changes: 'Implement Code Changes',
  build_check: 'Build & Compile Check',
  arch_verify: 'Verify Against Architecture',
  push: 'Push to Remote Branch',
  summary: 'Generate Change Summary',
}

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '⟳',
  completed: '✓',
  error: '✗',
}

interface DevelopmentProgressProps {
  steps: DevelopmentStep[]
  branchName: string | null
}

export function DevelopmentProgress({ steps, branchName }: DevelopmentProgressProps) {
  if (steps.length === 0) {
    return (
      <div className="card">
        <p className="muted">Development has not started yet.</p>
      </div>
    )
  }

  return (
    <div>
      {branchName && (
        <div className="card" style={{ marginBottom: 12 }}>
          <span className="muted">Branch: </span>
          <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>
            {branchName}
          </code>
        </div>
      )}
      <div className="dev-steps">
        {steps.map((step) => (
          <div key={step.id} className={`dev-step dev-step--${step.status}`}>
            <span className="dev-step__icon">{STATUS_ICONS[step.status] ?? '○'}</span>
            <span className="dev-step__name">{STEP_LABELS[step.step_name] ?? step.step_name}</span>
            {step.detail && <span className="dev-step__detail">{step.detail}</span>}
            {step.status === 'running' && (
              <span className="dev-step__detail" style={{ color: '#2563eb' }}>Running…</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
