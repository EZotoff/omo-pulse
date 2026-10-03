import { memo } from "react"
import type { ProviderQuota, ProviderQuotasPayload, QuotaWindow, StripConfigState } from "../../types"
import "./QuotaStrip.css"

/* ── Helpers ── */

function formatRemaining(ms: number | null): string {
  if (ms === null) return ""
  const deltaMs = ms - Date.now()
  if (deltaMs <= 60_000) return "now"
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  /* ≥24h always renders as d+h (26h3m → 1d2h) — two units, no mixed h/m beyond a day */
  if (hours < 24) return restMinutes > 0 ? `${hours}h${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}d${restHours}h` : `${days}d`
}

/**
 * Two-row countdown for ring text: days over hours (≥24h) or hours over
 * minutes (<24h). Returns null when no reset is known.
 */
export function countdownRows(ms: number | null, nowMs: number = Date.now()): { top: string; bottom: string } | null {
  if (ms === null) return null
  const deltaMs = ms - nowMs
  if (deltaMs <= 60_000) return { top: "now", bottom: "" }
  const minutes = Math.floor(deltaMs / 60_000)
  const hours = Math.floor(minutes / 60)
  if (hours >= 24) {
    return { top: `${Math.floor(hours / 24)}d`, bottom: `${hours % 24}h` }
  }
  return { top: `${hours}h`, bottom: `${minutes % 60}m` }
}

/**
 * Usage level thresholds are pinned to the cut-corner ring geometry: with
 * chamfer c = 0.2533·S and corner radius r = 0.2094·S, the 75% perimeter
 * point falls exactly on the bottom-right corner (amber starts there) and
 * the 90% point exactly on the chamfer's lower corner (red starts there,
 * the red zone fills the chamfer). See cutCornerPath.
 */
function usageLevel(percent: number): "ok" | "warn" | "danger" | "exhausted" {
  if (percent >= 100) return "exhausted"
  if (percent >= 90) return "danger"
  if (percent >= 75) return "warn"
  return "ok"
}

/* Display priority per window duration (shortest → longest, left to right) */
const WINDOW_RANK: Record<string, number> = { window: 0, "5h": 0, weekly: 1, monthly: 2 }

export type WindowState = QuotaWindow & { suppressed: boolean }

/**
 * Sorts windows shortest → longest and marks suppression: when a longer
 * window is exhausted (locked out), shorter windows stay visible but render
 * heavily dimmed + decolorized — the layout stays static and readable
 * instead of collapsing.
 */
export function windowStates(windows: QuotaWindow[]): WindowState[] {
  const rankOf = (w: QuotaWindow): number => WINDOW_RANK[w.id] ?? 0
  const sorted = [...windows].sort((a, b) => rankOf(a) - rankOf(b))
  const firstExhaustedIdx = sorted.findIndex((w) => w.usedPercent >= 100)
  return sorted.map((w, i) => ({
    ...w,
    suppressed: firstExhaustedIdx !== -1 && i < firstExhaustedIdx,
  }))
}

/* ── Cut-corner ring geometry ──
 *
 * Counter-clockwise path starting at the chamfer's upper corner A=(S-c, 0):
 * 0% begins there; the arc grows along the top edge, down the left side,
 * across the bottom, up the right edge, and fills the chamfer last — so the
 * amber zone (≥75%) starts exactly at the bottom-right corner and the red
 * zone (≥90%) starts exactly at the chamfer's lower corner B=(S, c).
 * Solved numerically: c=0.253284, r=0.209419 (side-relative, scale-free). */
export const CUT_CORNER = { c: 0.253284, r: 0.209419 } as const

export function cutCornerPath(side: number): string {
  const c = CUT_CORNER.c * side
  const r = CUT_CORNER.r * side
  return [
    `M ${(side - c).toFixed(2)} 0`,
    `L ${r.toFixed(2)} 0`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 0 ${r.toFixed(2)}`,
    `L 0 ${(side - r).toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${r.toFixed(2)} ${side.toFixed(2)}`,
    `L ${(side - r).toFixed(2)} ${side.toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${side.toFixed(2)} ${(side - r).toFixed(2)}`,
    `L ${side.toFixed(2)} ${c.toFixed(2)}`,
    "Z",
  ].join(" ")
}

function tooltipFor(provider: ProviderQuota, states: WindowState[]): string {
  if (provider.status === "unconfigured") return `${provider.name} — not configured`
  if (provider.status === "error") return `${provider.name} — ${provider.error ?? "unavailable"}`
  const parts = states.map((w: WindowState) => {
    const remaining = formatRemaining(w.resetsAtMs)
    const resetText =
      w.resetsAtMs === null ? "" : remaining === "now" ? "resetting" : `, resets in ${remaining}`
    const suffix = w.suppressed ? " (locked out)" : ""
    return `${w.label}: ${Math.round(w.usedPercent)}% used${resetText}${suffix}`
  })
  return parts.length > 0 ? `${provider.name} · ${parts.join(" · ")}` : provider.name
}

/* ── Component ── */

export type QuotaStripProps = {
  quotas: ProviderQuotasPayload | null
  iconMode: "icons" | "codes"
  style: StripConfigState["quotaStyle"]
  ringSize: number
}

export const QuotaStrip = memo(function QuotaStrip({ quotas, iconMode, style, ringSize }: QuotaStripProps) {
  if (quotas === null || quotas.providers.length === 0) return null

  const useIcons = iconMode === "icons"
  /* Rings and type flow as one tidy row; each provider's share grows with its
     window count so positions stay fixed regardless of visibility states. */
  const singleRow = style === "rings" || style === "type"

  const renderWindows = (provider: ProviderQuota, states: WindowState[]) => {
    if (provider.status !== "ok" || states.length === 0) {
      return <div className="quota-strip__track" aria-hidden="true" />
    }
    switch (style) {
      case "rings":
        return states.map((w) => {
          const pct = Math.min(Math.round(w.usedPercent), 100)
          const rows = countdownRows(w.resetsAtMs)
          const inset = 2
          const side = ringSize - 2 * inset
          const path = cutCornerPath(side)
          return (
            <div
              key={w.id}
              className="quota-ring"
              data-level={usageLevel(w.usedPercent)}
              data-suppressed={w.suppressed}
              style={{ width: ringSize, height: ringSize }}
              title={`${w.shortLabel}: ${Math.round(w.usedPercent)}% used${w.suppressed ? " (locked out)" : ""}`}
            >
              <svg width={ringSize} height={ringSize}>
                <path className="quota-ring__bg" d={path} transform={`translate(${inset} ${inset})`} pathLength={100} />
                <path
                  className="quota-ring__val"
                  d={path}
                  transform={`translate(${inset} ${inset})`}
                  pathLength={100}
                  style={{ strokeDasharray: 100, strokeDashoffset: 100 - pct }}
                />
              </svg>
              {rows !== null ? (
                <span
                  className="quota-ring__text"
                  style={{ fontSize: Math.max(6, Math.round(ringSize * 0.27)) }}
                  aria-hidden="true"
                >
                  <span className="quota-ring__row">{rows.top}</span>
                  <span className="quota-ring__row">{rows.bottom}</span>
                </span>
              ) : (
                <span
                  className="quota-ring__text"
                  style={{ fontSize: Math.max(6, Math.round(ringSize * 0.27)) }}
                  aria-hidden="true"
                >
                  <span className="quota-ring__row">{pct}%</span>
                </span>
              )}
            </div>
          )
        })
      case "leds":
        return states.map((w) => {
          const level = usageLevel(w.usedPercent)
          const on = Math.round((Math.min(w.usedPercent, 100) / 100) * 10)
          return (
            <div key={w.id} className="quota-leds" data-level={level} data-suppressed={w.suppressed}>
              <span className="quota-leds__label" aria-hidden="true">
                {w.shortLabel}
              </span>
              <span className="quota-leds__dots" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className="quota-leds__dot" data-on={i < on} data-level={level} />
                ))}
              </span>
              {w.resetsAtMs !== null && (
                <span className="quota-leds__reset" aria-hidden="true">
                  {formatRemaining(w.resetsAtMs)}
                </span>
              )}
            </div>
          )
        })
      case "chips":
        return states.map((w) => (
          <span
            key={w.id}
            className="quota-chip"
            data-level={usageLevel(w.usedPercent)}
            data-suppressed={w.suppressed}
          >
            {w.shortLabel} {Math.round(w.usedPercent)}%
          </span>
        ))
      case "type":
        return states.map((w) => (
          <span key={w.id} className="quota-type" data-suppressed={w.suppressed}>
            <span className="quota-type__label" aria-hidden="true">
              {w.shortLabel}
            </span>
            <span className="quota-type__pct" data-level={usageLevel(w.usedPercent)}>
              {Math.round(w.usedPercent)}%
            </span>
          </span>
        ))
      default:
        return states.map((w) => (
          <div key={w.id} className="quota-strip__line" data-suppressed={w.suppressed}>
            <span className="quota-strip__window" aria-hidden="true">
              {w.shortLabel}
            </span>
            <div className="quota-strip__track">
              <div
                className={`quota-strip__fill quota-strip__fill--${usageLevel(w.usedPercent)}`}
                style={{ width: `${Math.max(2, Math.round(w.usedPercent))}%` }}
              />
            </div>
            {w.resetsAtMs !== null && (
              <span className="quota-strip__reset" aria-hidden="true">
                {formatRemaining(w.resetsAtMs)}
              </span>
            )}
          </div>
        ))
    }
  }

  return (
    <div className="quota-strip" role="status" aria-label="Provider quota usage" data-style={style}>
      {quotas.providers.map((provider: ProviderQuota) => {
        const states = windowStates(provider.windows)
        return (
          <div
            key={provider.providerId}
            className="quota-strip__provider"
            data-status={provider.status}
            title={tooltipFor(provider, states)}
            style={singleRow ? { flexGrow: provider.windows.length || 1 } : undefined}
          >
          {useIcons && provider.icon ? (
            <img
              className="quota-strip__icon"
              src={provider.icon}
              alt=""
              loading="lazy"
              draggable={false}
            />
          ) : (
            <span className="quota-strip__symbol" aria-hidden="true">
              {provider.symbol}
            </span>
          )}
            <div className="quota-strip__lines">{renderWindows(provider, states)}</div>
          </div>
        )
      })}
    </div>
  )
})
