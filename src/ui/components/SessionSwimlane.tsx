import { memo, useMemo } from "react"
import type { SessionTimeSeriesPayload } from "../../types"
import "./SessionSwimlane.css"

/* ── Helpers ── */

const SESSION_COLOR_PALETTE = [
  "hsl(188 92% 60%)",
  "hsl(6 88% 66%)",
  "hsl(126 70% 60%)",
  "hsl(38 94% 62%)",
  "hsl(286 86% 68%)",
  "hsl(218 92% 66%)",
  "hsl(332 82% 66%)",
  "hsl(166 82% 58%)",
  "hsl(52 92% 62%)",
  "hsl(260 88% 70%)",
] as const

function colorForSessionIndex(index: number): string {
  const paletteColor = SESSION_COLOR_PALETTE[index]
  if (paletteColor) return paletteColor
  const hue = Math.round((index * 137.508) % 360)
  return `hsl(${hue} 84% 64%)`
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

function GradientDefs({
  sessionColors,
}: {
  sessionColors: readonly { colorIndex: number; color: string }[]
}) {
  return (
    <defs>
      {sessionColors.map(({ colorIndex, color }) => (
        <linearGradient
          key={colorIndex}
          id={`swim-sparkline-grad-${colorIndex}`}
          x1="0"
          x2="0"
          y1="1"
          y2="0"
        >
          <stop offset="0%" stopColor={color} stopOpacity={0.5} />
          <stop offset="100%" stopColor={color} stopOpacity={0.34} />
        </linearGradient>
      ))}
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

  const sessionColors = useMemo(
    () =>
      sessions.map((session, index) => ({
        ...session,
        colorIndex: index,
        color: colorForSessionIndex(index),
      })),
    [sessions],
  )

  const sorted = useMemo(
    () => [...sessionColors].sort((a, b) => sumValues(b.values) - sumValues(a.values)),
    [sessionColors],
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
          fill: `url(#swim-sparkline-grad-${s.colorIndex})`,
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
        <GradientDefs
          sessionColors={sessionColors.map(s => ({
            colorIndex: s.colorIndex,
            color: s.color,
          }))}
        />
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
              <span className="swimlane-legend-dot" style={{ backgroundColor: s.color }} />
              {s.sessionLabel}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
