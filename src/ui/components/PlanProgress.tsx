import './PlanProgress.css'
import type { PlanStatus, PlanStep, ProjectSnapshot } from '../../types'

/* ── Helpers ── */

/** Map PlanStatus to a CSS tone class suffix */
function statusTone(status: PlanStatus): 'complete' | 'progress' | 'idle' {
  if (status === 'complete') return 'complete'
  if (status === 'in progress') return 'progress'
  return 'idle'
}

/** Clamp percentage to [0, 100] for CSS width */
function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n))
}

/** Extract basename from a path (strip directories) */
function basename(path: string): string {
  return path.split('/').pop() ?? path
}

/* ── Constants ── */
const MAX_VISIBLE_STEPS = 10

/* ── Props ── */
export type PlanProgressProps = {
  planProgress: ProjectSnapshot['planProgress']
  mode: 'compact' | 'full'
  className?: string
}

/* ── Component ── */
export function PlanProgress({ planProgress, mode, className }: PlanProgressProps) {
  const { completed, total, status, name, steps } = planProgress
  const tone = statusTone(status)

  if (mode === 'compact') {
    return (
      <span
        className={`plan-progress plan-progress--compact${className ? ` ${className}` : ''}`}
        data-tone={tone}
      >
        {total === 0 ? '—' : `${completed}/${total}`}
      </span>
    )
  }

  // Full mode
  const percent = total === 0 ? 0 : clampPercent((completed / total) * 100)
  const displayName = basename(name)
  const visibleSteps = steps.slice(0, MAX_VISIBLE_STEPS)
  const hiddenCount = steps.length - MAX_VISIBLE_STEPS

  return (
    <div className={`plan-progress plan-progress--full${className ? ` ${className}` : ''}`}>
      {/* Header: plan name + status pill */}
      {(displayName || total > 0) && (
        <div className="plan-progress__header">
          {displayName && (
            <span className="plan-progress__name truncate">{displayName}</span>
          )}
          <span className={`pill pill--${tone}`}>{status}</span>
        </div>
      )}

      {/* Progress bar */}
      {total > 0 ? (
        <div className="progress-track">
          <div
            className="progress-fill"
            data-tone={tone}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <span className="plan-progress__empty">(no plan)</span>
      )}

      {/* Step checklist */}
      {visibleSteps.length > 0 && (
        <div className="plan-progress__steps mono">
          {visibleSteps.map((step: PlanStep, idx: number) => (
            <div
              key={`${idx}-${step.checked ? 'x' : '_'}-${step.text}`}
              className={`plan-progress__step${step.checked ? ' plan-progress__step--checked' : ''}`}
            >
              [{step.checked ? '✓' : '\u00A0'}] {step.text || '(empty)'}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div className="plan-progress__truncation">+ {hiddenCount} more</div>
          )}
        </div>
      )}
    </div>
  )
}
