import type { SessionTimeSeriesPayload } from "../../types"
import type { AgentTone } from "../types"
import { memo, useMemo } from "react"
import "./SessionSwimlane.css"

/* ── Helpers ── */

function detectTone(label: string, isBackground: boolean): AgentTone | "muted" {
  if (isBackground) return "muted"
  const lower = label.toLowerCase()
  if (lower.includes("sisyphus")) return "teal"
  if (lower.includes("prometheus")) return "red"
  if (lower.includes("atlas")) return "green"
  return "sand"
}

function sumValues(values: number[]): number {
  let s = 0
  for (let i = 0; i < values.length; i++) s += values[i]
  return s
}

/* ── Constants (match Sparkline conventions) ── */

const BAR_W = 0.85
const BAR_INSET = (1 - BAR_W) / 2
const SVG_H = 14
const BAR_H = 12
const PAD_TOP = 1

/* ── Gradient defs (replicated from Sparkline) ── */

function GradientDefs() {
  return (
    <defs>
      <linearGradient id="swim-sparkline-grad-teal" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0%" stopColor="rgba(0,212,170,0.4)" />
        <stop offset="100%" stopColor="rgba(0,212,170,0.3)" />
      </linearGradient>
      <linearGradient id="swim-sparkline-grad-red" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0%" stopColor="rgba(255,107,107,0.4)" />
        <stop offset="100%" stopColor="rgba(255,107,107,0.3)" />
      </linearGradient>
      <linearGradient id="swim-sparkline-grad-green" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0%" stopColor="rgba(78,205,196,0.4)" />
        <stop offset="100%" stopColor="rgba(78,205,196,0.3)" />
      </linearGradient>
      <linearGradient id="swim-sparkline-grad-sand" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0%" stopColor="rgba(255,165,2,0.4)" />
        <stop offset="100%" stopColor="rgba(255,165,2,0.3)" />
      </linearGradient>
      <linearGradient id="swim-sparkline-grad-muted" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0%" stopColor="rgba(102,102,128,0.3)" />
        <stop offset="100%" stopColor="rgba(102,102,128,0.2)" />
      </linearGradient>
    </defs>
  )
}

/* ── Component ── */

export interface SessionSwimlaneProps {
  sessionTimeSeries: SessionTimeSeriesPayload
}

type StackRect = {
  key: string
  fill: string
  x: number
  y: number
  w: number
  h: number
}

export const SessionSwimlane = memo(function SessionSwimlane({
  sessionTimeSeries,
}: SessionSwimlaneProps) {
  const { buckets, sessions } = sessionTimeSeries

  const sessionTones = useMemo(
    () => sessions.map(s => ({ ...s, tone: detectTone(s.sessionLabel, s.isBackground) })),
    [sessions],
  )

  const sorted = useMemo(
    () => [...sessionTones].sort((a, b) => sumValues(b.values) - sumValues(a.values)),
    [sessionTones],
  )

  const scaleMax = useMemo(() => {
    let mx = 1
    for (let i = 0; i < buckets; i++) {
      let total = 0
      for (const s of sessions) total += s.values[i] ?? 0
      if (total > mx) mx = total
    }
    return mx
  }, [sessions, buckets])

  const rects = useMemo(() => {
    const out: StackRect[] = []
    for (let i = 0; i < buckets; i++) {
      let yOffset = 0
      for (const s of sorted) {
        const val = s.values[i] ?? 0
        if (val <= 0) continue
        const h = (val / scaleMax) * BAR_H
        yOffset += h
        out.push({
          key: `${s.sessionId}-${i}`,
          fill: `url(#swim-sparkline-grad-${s.tone})`,
          x: i + BAR_INSET,
          y: PAD_TOP + BAR_H - yOffset,
          w: BAR_W,
          h,
        })
      }
    }
    return out
  }, [buckets, sorted, scaleMax])

  if (sessions.length === 0) {
    return <div className="swimlane-empty">No active sessions</div>
  }

  return (
    <div className="session-swimlane">
      <svg
        className="swimlane-bars swimlane-bars--aggregated"
        viewBox={`0 0 ${buckets} ${SVG_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <GradientDefs />
        {rects.map(r => (
          <rect
            key={r.key}
            fill={r.fill}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={1}
          />
        ))}
      </svg>

      {sessions.length > 1 && (
        <div className="swimlane-legend">
          {sorted.map(s => (
            <span key={s.sessionId} className="swimlane-legend-item">
              <span className={`swimlane-legend-dot swimlane-legend-dot--${s.tone}`} />
              {s.sessionLabel}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
