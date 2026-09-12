import { memo } from "react"
import type { ProviderQuota, ProviderQuotasPayload, QuotaWindow } from "../../types"
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

function usageLevel(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 90) return "danger"
  if (percent >= 70) return "warn"
  return "ok"
}

function tooltipFor(provider: ProviderQuota): string {
  if (provider.status === "unconfigured") return `${provider.name} — not configured`
  if (provider.status === "error") return `${provider.name} — ${provider.error ?? "unavailable"}`
  const parts = provider.windows.map(
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

export const QuotaStrip = memo(function QuotaStrip({ quotas }: { quotas: ProviderQuotasPayload | null }) {
  if (quotas === null || quotas.providers.length === 0) return null

  return (
    <div className="quota-strip" role="status" aria-label="Provider quota usage">
      {quotas.providers.map((provider: ProviderQuota) => (
        <div
          key={provider.providerId}
          className="quota-strip__provider"
          data-status={provider.status}
          title={tooltipFor(provider)}
        >
          <span className="quota-strip__symbol" aria-hidden="true">
            {provider.symbol}
          </span>
          <div className="quota-strip__lines">
            {provider.status !== "ok" || provider.windows.length === 0 ? (
              <div className="quota-strip__track" aria-hidden="true" />
            ) : (
              provider.windows.map((w: QuotaWindow) => (
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
            )}
          </div>
        </div>
      ))}
    </div>
  )
})
