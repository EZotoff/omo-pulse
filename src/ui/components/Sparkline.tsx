import type {
  TimeSeriesPayload,
  TimeSeriesSeries,
  } from "../../types"
import type { AgentTone } from "../types"
import { memo } from "react"
import "./Sparkline.css"

/* ── Types ── */


interface StackedSegment {
  tone: AgentTone
  y: number
  height: number
}

interface AgentCounts {
  sisyphus: number
  prometheus: number
  atlas: number
  other: number
}

export interface SparklineProps {
  mode: "mini" | "full"
  timeSeries: TimeSeriesPayload
  width?: number
  height?: number
  className?: string
}

/* ── Helpers ── */

/** Clamp value to a non-negative finite number */
function toSafe(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0
  return Math.max(0, v)
}

/**
 * Compute stacked bar segments for a single bucket.
 *
 * Segment order (bottom → top):
 *   1. Sisyphus (teal)
 *   2. Prometheus (red)
 *   3. Atlas (green)
 *   4. Other (sand)
 *
 * Adapted from reference `timeseries-stacked.ts`.
 */
function computeStackedSegments(
  counts: AgentCounts,
  scaleMax: number,
  chartHeight: number,
): StackedSegment[] {
  if (chartHeight <= 0 || scaleMax <= 0) return []

  const sanitized = {
    sisyphus: Math.max(0, Number.isFinite(counts.sisyphus) ? counts.sisyphus : 0),
    prometheus: Math.max(0, Number.isFinite(counts.prometheus) ? counts.prometheus : 0),
    atlas: Math.max(0, Number.isFinite(counts.atlas) ? counts.atlas : 0),
    other: Math.max(0, Number.isFinite(counts.other) ? counts.other : 0),
  }

  const total =
    sanitized.sisyphus + sanitized.prometheus + sanitized.atlas + sanitized.other
  if (total === 0) return []

  /* Raw heights proportional to scaleMax */
  const rawHeights = {
    sisyphus: (sanitized.sisyphus / scaleMax) * chartHeight,
    prometheus: (sanitized.prometheus / scaleMax) * chartHeight,
    atlas: (sanitized.atlas / scaleMax) * chartHeight,
    other: (sanitized.other / scaleMax) * chartHeight,
  }

  /* Round to pixels, ensuring non-zero values remain visible (≥1px) */
  const roundedHeights = {
    sisyphus: sanitized.sisyphus > 0 ? Math.max(1, Math.round(rawHeights.sisyphus)) : 0,
    prometheus: sanitized.prometheus > 0 ? Math.max(1, Math.round(rawHeights.prometheus)) : 0,
    atlas: sanitized.atlas > 0 ? Math.max(1, Math.round(rawHeights.atlas)) : 0,
    other: sanitized.other > 0 ? Math.max(1, Math.round(rawHeights.other)) : 0,
  }

  /* Clamp so sum ≤ chartHeight */
  let totalRounded =
    roundedHeights.sisyphus +
    roundedHeights.prometheus +
    roundedHeights.atlas +
    roundedHeights.other

  if (totalRounded > chartHeight) {
    const keys: (keyof typeof roundedHeights)[] = [
      "sisyphus",
      "prometheus",
      "atlas",
      "other",
    ]
    const weights = keys
      .filter((k) => roundedHeights[k] > 0)
      .map((k) => ({ key: k, height: roundedHeights[k] }))

    if (weights.length > 0) {
      const excess = totalRounded - chartHeight
      const totalWeight = weights.reduce((s, w) => s + w.height, 0)
      let remaining = excess

      for (const w of weights) {
        if (remaining <= 0) break
        const reduction = Math.min(
          Math.max(1, w.height - 1),
          Math.round((w.height / totalWeight) * excess),
        )
        roundedHeights[w.key] -= reduction
        remaining -= reduction
      }

      /* Final trim from largest if still over */
      totalRounded =
        roundedHeights.sisyphus +
        roundedHeights.prometheus +
        roundedHeights.atlas +
        roundedHeights.other
      while (totalRounded > chartHeight) {
        const sorted = keys
          .filter((k) => roundedHeights[k] > 1)
          .sort((a, b) => roundedHeights[b] - roundedHeights[a])
        if (sorted.length === 0) break
        roundedHeights[sorted[0]]--
        totalRounded--
      }
    }
  }

  /* Build segments bottom → top */
  const segments: StackedSegment[] = []
  let currentY = chartHeight

  const order: { key: keyof typeof roundedHeights; tone: AgentTone }[] = [
    { key: "sisyphus", tone: "teal" },
    { key: "prometheus", tone: "red" },
    { key: "atlas", tone: "green" },
    { key: "other", tone: "sand" },
  ]

  for (const { key, tone } of order) {
    if (roundedHeights[key] > 0) {
      currentY -= roundedHeights[key]
      segments.push({ tone, y: currentY, height: roundedHeights[key] })
    }
  }

  return segments
}

/* ── Lookup helpers ── */

function seriesById(
  series: TimeSeriesSeries[],
): Map<string, TimeSeriesSeries> {
  const map = new Map<string, TimeSeriesSeries>()
  for (const s of series) {
    if (s && typeof s.id === "string") map.set(s.id, s)
  }
  return map
}

/** Compute max value used for scaling in stacked full mode */
function computeScaleMax(
  buckets: number,
  sisV: number[],
  proV: number[],
  atlV: number[],
  bgV: number[],
  overallV: number[],
): number {
  let max = 0
  for (let i = 0; i < buckets; i++) {
    /* Per-bucket sum of stacked agents */
    const stacked =
      toSafe(sisV[i]) + toSafe(proV[i]) + toSafe(atlV[i])
    /* Also consider overall - background as potential ceiling */
    const mainFromOverall = toSafe(overallV[i]) - toSafe(bgV[i])
    /* Background is rendered separately, so account for it independently */
    const bgVal = toSafe(bgV[i])
    const candidate = Math.max(stacked, mainFromOverall, bgVal)
    if (candidate > max) max = candidate
  }
  return Math.max(1, max)
}

/* ── Component ── */

function SparklineInner({
  mode,
  timeSeries,
  width,
  height,
  className,
}: SparklineProps) {
  const buckets = Math.max(1, timeSeries.buckets)
  const lookup = seriesById(timeSeries.series)
  const barW = 0.85
  const barInset = (1 - barW) / 2

  if (mode === "mini") {
    return renderMini(buckets, lookup, barW, barInset, width, height, className)
  }

  return renderFull(buckets, lookup, barW, barInset, width, height, className)
}

export const Sparkline = memo(SparklineInner)

/* ── Mini mode ── */

function renderMini(
  totalBuckets: number,
  lookup: Map<string, TimeSeriesSeries>,
  barW: number,
  barInset: number,
  widthProp: number | undefined,
  heightProp: number | undefined,
  className: string | undefined,
) {
  const w = widthProp ?? 48
  const h = heightProp ?? 20
  const windowSize = 30
  const padTop = 1
  const padBottom = 1
  const chartH = h - padTop - padBottom

  /* Sum all agent series per bucket, take last 30 */
  const sisV = lookup.get("agent:sisyphus")?.values ?? []
  const proV = lookup.get("agent:prometheus")?.values ?? []
  const atlV = lookup.get("agent:atlas")?.values ?? []
  const bgV = lookup.get("background-total")?.values ?? []

  const startIdx = Math.max(0, totalBuckets - windowSize)
  const count = Math.min(windowSize, totalBuckets)

  /* Compute summed values + max, and track dominant agent tone */
  const sums: number[] = []
  const dominantTones: AgentTone[] = []
  let maxVal = 0
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i
    const sisVal = toSafe(sisV[idx])
    const proVal = toSafe(proV[idx])
    const atlVal = toSafe(atlV[idx])
    const sum = sisVal + proVal + atlVal
    sums.push(sum)
    if (sum > maxVal) maxVal = sum
    
    /* Determine dominant agent tone for this bucket */
    let dominantTone: AgentTone = "teal" /* default */
    const maxVal_bucket = Math.max(sisVal, proVal, atlVal)
    if (maxVal_bucket > 0) {
      if (sisVal === maxVal_bucket) {
        dominantTone = "teal"
      } else if (proVal === maxVal_bucket) {
        dominantTone = "red"
      } else if (atlVal === maxVal_bucket) {
        dominantTone = "green"
      }
    }
    dominantTones.push(dominantTone)
  }
  /* Update scaleMax to account for background bars */
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i
    const bgVal = toSafe(bgV[idx])
    const candidate = Math.max(sums[i], bgVal)
    if (candidate > maxVal) maxVal = candidate
  }
  const scaleMax = Math.max(1, maxVal)

  const viewBox = `0 0 ${count} ${h}`
  const cls = ["sparkline", "sparkline--mini", className].filter(Boolean).join(" ")

  return (
    <svg
      className={cls}
      width={w}
      height={h}
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mini-sparkline-grad-teal" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,212,170,0.4)" />
          <stop offset="100%" stopColor="rgba(0,212,170,0.3)" />
        </linearGradient>
        <linearGradient id="mini-sparkline-grad-red" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,107,107,0.4)" />
          <stop offset="100%" stopColor="rgba(255,107,107,0.3)" />
        </linearGradient>
        <linearGradient id="mini-sparkline-grad-green" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(78,205,196,0.4)" />
          <stop offset="100%" stopColor="rgba(78,205,196,0.3)" />
        </linearGradient>
        <linearGradient id="mini-sparkline-grad-sand" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,165,2,0.4)" />
          <stop offset="100%" stopColor="rgba(255,165,2,0.3)" />
        </linearGradient>
        <linearGradient id="mini-sparkline-grad-muted" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(102,102,128,0.3)" />
          <stop offset="100%" stopColor="rgba(102,102,128,0.2)" />
        </linearGradient>
      </defs>
      {sums.map((val, i) => {
        const idx = startIdx + i
        const barH = (val / scaleMax) * chartH
        const bgVal = toSafe(bgV[idx])
        const bgBarH = (bgVal / scaleMax) * chartH
        const dominantTone = dominantTones[i]
        if (barH <= 0 && bgBarH <= 0) return null
        return (
          <g key={i}>
            {bgBarH > 0 && (
              <rect
                className="sparkline-bar sparkline-bar--muted"
                fill="url(#mini-sparkline-grad-muted)"
                x={i + barInset}
                y={padTop + chartH - bgBarH}
                width={barW}
                height={bgBarH}
                rx={1}
              />
            )}
            {barH > 0 && (
              <>
                <rect
                  className={`sparkline-bar sparkline-bar--${dominantTone}`}
                  fill={`url(#mini-sparkline-grad-${dominantTone})`}
                  x={i + barInset}
                  y={padTop + chartH - barH}
                  width={barW}
                  height={barH}
                  rx={1}
                />
                <rect
                  className={`sparkline-glow sparkline-glow--${dominantTone}`}
                  x={i + barInset}
                  y={padTop + chartH - barH}
                  width={barW}
                  height={1}
                  rx={1}
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ── Full mode ── */

function renderFull(
  totalBuckets: number,
  lookup: Map<string, TimeSeriesSeries>,
  barW: number,
  barInset: number,
  widthProp: number | undefined,
  heightProp: number | undefined,
  className: string | undefined,
) {
  const h = heightProp ?? 80
  const padTop = 2
  const padBottom = 2
  const chartH = h - padTop - padBottom

  const sisV = lookup.get("agent:sisyphus")?.values ?? []
  const proV = lookup.get("agent:prometheus")?.values ?? []
  const atlV = lookup.get("agent:atlas")?.values ?? []
  const bgV = lookup.get("background-total")?.values ?? []
  const overallV = lookup.get("overall-main")?.values ?? []

  const scaleMax = computeScaleMax(totalBuckets, sisV, proV, atlV, bgV, overallV)

  const viewBox = `0 0 ${totalBuckets} ${h}`
  const cls = ["sparkline", "sparkline--full", className].filter(Boolean).join(" ")

  const style: React.CSSProperties | undefined = widthProp
    ? { width: widthProp }
    : undefined

  return (
    <svg
      className={cls}
      style={style}
      height={h}
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="full-sparkline-grad-teal" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,212,170,0.4)" />
          <stop offset="100%" stopColor="rgba(0,212,170,0.3)" />
        </linearGradient>
        <linearGradient id="full-sparkline-grad-red" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,107,107,0.4)" />
          <stop offset="100%" stopColor="rgba(255,107,107,0.3)" />
        </linearGradient>
        <linearGradient id="full-sparkline-grad-green" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(78,205,196,0.4)" />
          <stop offset="100%" stopColor="rgba(78,205,196,0.3)" />
        </linearGradient>
        <linearGradient id="full-sparkline-grad-sand" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,165,2,0.4)" />
          <stop offset="100%" stopColor="rgba(255,165,2,0.3)" />
        </linearGradient>
        <linearGradient id="full-sparkline-grad-muted" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="rgba(102,102,128,0.3)" />
          <stop offset="100%" stopColor="rgba(102,102,128,0.2)" />
        </linearGradient>
      </defs>
      {Array.from({ length: totalBuckets }, (_, i) => {
        const sis = toSafe(sisV[i])
        const pro = toSafe(proV[i])
        const atl = toSafe(atlV[i])

        /* "other" = overall − background − known agents */
        const overallMain = toSafe(overallV[i]) - toSafe(bgV[i])
        const knownSum = sis + pro + atl
        const other = Math.max(0, overallMain - knownSum)

        const segments = computeStackedSegments(
          { sisyphus: sis, prometheus: pro, atlas: atl, other },
          scaleMax,
          chartH,
        )
        
        const bgVal = toSafe(bgV[i])
        const bgBarH = (bgVal / scaleMax) * chartH
        
        if (segments.length === 0 && bgBarH <= 0) return null
        
        return (
          <g key={`bucket-${i}`}>
            {bgBarH > 0 && (
              <rect
                className="sparkline-bar sparkline-bar--muted"
                fill="url(#full-sparkline-grad-muted)"
                x={i + barInset}
                y={padTop + chartH - bgBarH}
                width={barW}
                height={bgBarH}
                rx={1}
              />
            )}
            {segments.map((seg) => (
              <g key={`${i}-${seg.tone}`}>
                <rect
                  className={`sparkline-bar sparkline-bar--${seg.tone}`}
                  fill={`url(#full-sparkline-grad-${seg.tone})`}
                  x={i + barInset}
                  y={padTop + seg.y}
                  width={barW}
                  height={seg.height}
                  rx={1}
                />
                <rect
                  className={`sparkline-glow sparkline-glow--${seg.tone}`}
                  x={i + barInset}
                  y={padTop + seg.y}
                  width={barW}
                  height={1}
                  rx={1}
                />
              </g>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
