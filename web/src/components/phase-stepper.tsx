'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Feature } from '@/lib/api'

interface PhaseStepperProps {
  projectId: string
  featureId: string
  feature: Feature
}

const PHASES = [
  { key: 'architecture', label: 'Architecture', num: 1 },
  { key: 'development', label: 'Development', num: 2 },
  { key: 'testing', label: 'Testing', num: 3 },
] as const

type PhaseKey = 'architecture' | 'development' | 'testing' | 'completed'

function phaseIndex(p: PhaseKey): number {
  return { architecture: 0, development: 1, testing: 2, completed: 3 }[p] ?? 0
}

export function PhaseStepper({ projectId, featureId, feature }: PhaseStepperProps) {
  const pathname = usePathname()
  const currentIdx = phaseIndex(feature.current_phase)

  return (
    <div className="phase-stepper">
      {PHASES.map((phase, i) => {
        const pIdx = i
        const isActive = pathname.includes(`/${phase.key}`)
        const isCompleted = pIdx < currentIdx || feature.current_phase === 'completed'
        const isLocked = pIdx > currentIdx
        const href = `/projects/${encodeURIComponent(projectId)}/features/${featureId}/${phase.key}`

        let cls = 'phase-step'
        if (isActive) cls += ' phase-step--active'
        else if (isCompleted) cls += ' phase-step--completed'
        else if (isLocked) cls += ' phase-step--locked'

        const numEl = (
          <span className="phase-step__num">
            {isCompleted && !isActive ? '✓' : phase.num}
          </span>
        )

        return (
          <span key={phase.key} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span className="phase-arrow">›</span>}
            {isLocked ? (
              <span className={cls}>
                {numEl}
                {phase.label}
              </span>
            ) : (
              <Link className={cls} href={href}>
                {numEl}
                {phase.label}
              </Link>
            )}
          </span>
        )
      })}
      {feature.current_phase === 'completed' && (
        <>
          <span className="phase-arrow">›</span>
          <span className="phase-step phase-step--completed">
            <span className="phase-step__num">✓</span>
            Completed
          </span>
        </>
      )}
    </div>
  )
}
