'use client'

import { CheckCircle, Loader, Circle, XCircle } from 'lucide-react'
import type { DevelopmentStep } from '@/lib/api'

interface Props {
  steps: DevelopmentStep[]
}

const stepLabels: Record<string, string> = {
  branch_created: 'Branch created',
  code_changes: 'Code changes applied',
  build: 'Build',
  verify: 'Architecture verification',
  push: 'Pushed to remote',
  summary: 'Change summary generated',
}

export function DevelopmentProgress({ steps }: Props) {
  return (
    <div className="dev-progress">
      {steps.map((step) => {
        const icon =
          step.status === 'completed' ? <CheckCircle size={16} style={{ color: '#16a34a' }} /> :
          step.status === 'running' ? <Loader size={16} className="spin" style={{ color: '#2563eb' }} /> :
          step.status === 'error' ? <XCircle size={16} style={{ color: '#dc2626' }} /> :
          <Circle size={16} style={{ color: '#94a3b8' }} />

        return (
          <div key={step.id} className={`dev-progress__step dev-progress__step--${step.status}`}>
            {icon}
            <span className="dev-progress__label">
              {stepLabels[step.step_name] || step.step_name}
            </span>
            {step.detail && (
              <span className="dev-progress__detail muted">{step.detail}</span>
            )}
          </div>
        )
      })}
      {steps.length === 0 && (
        <p className="muted">Development not started yet.</p>
      )}
    </div>
  )
}
