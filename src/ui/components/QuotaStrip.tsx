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
  if (hours < 48) return restMinutes > 0 ? `${hours}h${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}d${restHours}h` : `${days}d`
}

function usageLevel(percent: number): "ok" | "warn" | "danger" | "exhausted" {
  if (percent >= 100) return "exhausted"
  if (percent >= 90) return "danger"
  if (percent >= 70) return "warn"
  return "ok"
}

/**
 * Display priority per window duration. When a longer window is exhausted
 * (100% used), every shorter window collapses: a 5h reset is irrelevant while
 * the provider is locked out for another week by the monthly quota.
 */
const WINDOW_RANK: Record<string, number> = { window: 0, "5h": 0, weekly: 1, monthly: 2 }

export function visibleWindows(windows: QuotaWindow[]): QuotaWindow[] {
  if (windows.length <= 1) return windows
  const rankOf = (w: QuotaWindow): number => WINDOW_RANK[w.id] ?? 0
  /* Always display shortest → longest left-to-right, regardless of payload order */
  const sorted = [...windows].sort((a, b) => rankOf(a) - rankOf(b))
  const firstExhausted = sorted.find((w) => w.usedPercent >= 100)
  if (!firstExhausted) return sorted
  const cutoff = rankOf(firstExhausted)
  return sorted.filter((w) => rankOf(w) >= cutoff)
}

function tooltipFor(provider: ProviderQuota, windows: QuotaWindow[]): string {
  if (provider.status === "unconfigured") return `${provider.name} — not configured`
  if (provider.status === "error") return `${provider.name} — ${provider.error ?? "unavailable"}`
  const parts = windows.map(
    (w: QuotaWindow) => {
      const remaining = formatRemaining(w.resetsAtMs)
      const resetText =
        w.resetsAtMs === null ? "" : remaining === "now" ? "resetting" : `, resets in ${remaining}`
      return `${w.label}: ${Math.round(w.usedPercent)}% used${resetText}`
    },
  )
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

  const renderWindows = (provider: ProviderQuota, windows: QuotaWindow[]) => {
    if (provider.status !== "ok" || windows.length === 0) {
      return <div className="quota-strip__track" aria-hidden="true" />
    }
    switch (style) {
      case "rings":
        return windows.map((w) => {
          const pct = Math.min(Math.round(w.usedPercent), 100)
          const inset = 2
          const side = ringSize - 2 * inset
          const label = w.resetsAtMs !== null ? formatRemaining(w.resetsAtMs) : `${pct}%`
          return (
            <div
              key={w.id}
              className="quota-ring"
              data-level={usageLevel(w.usedPercent)}
              style={{ width: ringSize, height: ringSize }}
              title={`${w.shortLabel}: ${Math.round(w.usedPercent)}% used${w.resetsAtMs !== null ? `, resets ${label}` : ""}`}
            >
              <svg width={ringSize} height={ringSize}>
                <g transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}>
                  <rect
                    className="quota-ring__bg"
                    x={inset}
                    y={inset}
                    width={side}
                    height={side}
                    rx={side * 0.3}
                    pathLength={100}
                  />
                  <rect
                    className="quota-ring__val"
                    x={inset}
                    y={inset}
                    width={side}
                    height={side}
                    rx={side * 0.3}
                    pathLength={100}
                    style={{ strokeDasharray: 100, strokeDashoffset: 100 - pct }}
                  />
                </g>
              </svg>
              <span className="quota-ring__text" style={{ fontSize: Math.max(6, Math.round(ringSize * 0.24)) }} aria-hidden="true">
                {label}
              </span>
            </div>
          )
        })
      case "leds":
        return windows.map((w) => {
          const level = usageLevel(w.usedPercent)
          const on = Math.round((Math.min(w.usedPercent, 100) / 100) * 10)
          return (
            <div key={w.id} className="quota-leds" data-level={level}>
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
        return windows.map((w) => (
          <span key={w.id} className="quota-chip" data-level={usageLevel(w.usedPercent)}>
            {w.shortLabel} {Math.round(w.usedPercent)}%
          </span>
        ))
      case "type":
        return windows.map((w) => (
          <span key={w.id} className="quota-type">
            <span className="quota-type__label" aria-hidden="true">
              {w.shortLabel}
            </span>
            <span className="quota-type__pct" data-level={usageLevel(w.usedPercent)}>
              {Math.round(w.usedPercent)}%
            </span>
          </span>
        ))
      default:
        return windows.map((w) => (
          <div key={w.id} className="quota-strip__line">
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
        const windows = visibleWindows(provider.windows)
        return (
          <div
            key={provider.providerId}
            className="quota-strip__provider"
            data-status={provider.status}
            title={tooltipFor(provider, windows)}
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
            <div className="quota-strip__lines">
              {renderWindows(provider, windows)}
            </div>
          </div>
        )
      })}
    </div>
  )
})
