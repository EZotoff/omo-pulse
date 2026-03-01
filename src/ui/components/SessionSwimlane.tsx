import type { SessionTimeSeriesPayload } from "../../types"
import type { AgentTone } from "../types"
import { memo, useState, useMemo, useCallback } from "react"
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
const BAR_H = 12 /* 14px minus 1px top/bottom padding */
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

export const SessionSwimlane = memo(function SessionSwimlane({
  sessionTimeSeries,
}: SessionSwimlaneProps) {
  const { buckets, sessions } = sessionTimeSeries
  const [pinned, setPinned] = useState<Set<string>>(() => new Set())

  const togglePin = useCallback((sessionId: string) => {
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  /* Sort: pinned first, then by total activity descending */
  const sorted = useMemo(() => {
    const withSum = sessions.map((s) => ({ entry: s, total: sumValues(s.values) }))
    withSum.sort((a, b) => {
      const aPinned = pinned.has(a.entry.sessionId) ? 1 : 0
      const bPinned = pinned.has(b.entry.sessionId) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return b.total - a.total
    })
    return withSum
  }, [sessions, pinned])

  /* Scale: max single-bucket value across all sessions */
  const scaleMax = useMemo(() => {
    let mx = 1
    for (const s of sessions) {
      for (const v of s.values) {
        if (v > mx) mx = v
      }
    }
    return mx
  }, [sessions])

  if (sessions.length === 0) {
    return <div className="swimlane-empty">No active sessions</div>
  }

  return (
    <div className="session-swimlane">
      {sorted.map(({ entry }) => {
        const isPinned = pinned.has(entry.sessionId)
        const tone = detectTone(entry.sessionLabel, entry.isBackground)
        const rowCls = `swimlane-row${isPinned ? " swimlane-row--pinned" : ""}`

        return (
          <div key={entry.sessionId} className={rowCls}>
            <button
              className="swimlane-pin"
              onClick={() => togglePin(entry.sessionId)}
              aria-label={isPinned ? "Unpin session" : "Pin session"}
              type="button"
            >
              {isPinned ? "◆" : "◇"}
            </button>

            <span className="swimlane-label" title={entry.sessionLabel}>
              {entry.sessionLabel}
            </span>

            <svg
              className="swimlane-bars"
              viewBox={`0 0 ${buckets} ${SVG_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <GradientDefs />

              {entry.values.map((val, i) => {
                if (val <= 0) return null
                const h = (val / scaleMax) * BAR_H
                return (
                  <rect
                    key={i}
                    fill={`url(#swim-sparkline-grad-${tone})`}
                    x={i + BAR_INSET}
                    y={PAD_TOP + BAR_H - h}
                    width={BAR_W}
                    height={h}
                    rx={1}
                  />
                )
              })}
            </svg>
          </div>
        )
      })}
    </div>
  )
})
