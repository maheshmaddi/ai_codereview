'use client'

import Link from 'next/link'
import { CheckCircle, Lock, CircleDot, Clock } from 'lucide-react'
import type { FeaturePhase } from '@/lib/api'

const phases: { key: FeaturePhase; label: string; step: number }[] = [
  { key: 'architecture', label: 'Architecture', step: 1 },
  { key: 'development', label: 'Development', step: 2 },
  { key: 'testing', label: 'Testing', step: 3 },
]

function getPhaseState(phase: FeaturePhase, currentPhase: FeaturePhase): 'completed' | 'active' | 'locked' | 'future' {
  const order: FeaturePhase[] = ['architecture', 'development', 'testing', 'completed']
  const phaseIndex = order.indexOf(phase)
  const currentIndex = order.indexOf(currentPhase)

  if (currentIndex === 3) return 'completed' // completed
  if (phaseIndex < currentIndex) return 'completed'
  if (phaseIndex === currentIndex) return 'active'
  if (phaseIndex === currentIndex + 1) return 'future'
  return 'locked'
}

interface Props {
  projectId: string
  featureId: string
  currentPhase: FeaturePhase
}

export function PhaseStepper({ projectId, featureId, currentPhase }: Props) {
  return (
    <div className="phase-stepper">
      {phases.map((phase, i) => {
        const state = getPhaseState(phase.key, currentPhase)
        const href = `/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/${phase.key}`
        const isLast = i === phases.length - 1

        return (
          <div key={phase.key} style={{ display: 'contents' }}>
            <Link
              href={state === 'locked' ? '#' : href}
              className={`phase-step phase-step--${state}`}
              onClick={(e) => state === 'locked' && e.preventDefault()}
            >
              <span className="phase-step__number">
                {state === 'completed' ? <CheckCircle size={18} /> :
                 state === 'active' ? <CircleDot size={18} /> :
                 state === 'locked' ? <Lock size={16} /> :
                 <Clock size={16} />}
              </span>
              <span className="phase-step__label">
                {i + 1}. {phase.label}
              </span>
              {state === 'active' && <span className="phase-step__badge">In Progress</span>}
              {state === 'completed' && <span className="phase-step__badge phase-step__badge--done">Done</span>}
            </Link>
            {!isLast && <div className="phase-step__connector" />}
          </div>
        )
      })}
    </div>
  )
}
