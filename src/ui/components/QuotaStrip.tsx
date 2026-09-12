import { memo } from "react"
import type { ProviderQuota, ProviderQuotasPayload, QuotaWindow } from "../../types"
import "./QuotaStrip.css"

/* ── Helpers ── */

function formatReset(ms: number | null): string {
  if (ms === null) return ""
  const deltaMs = ms - Date.now()
  if (deltaMs <= 0) return "resetting"
  const minutes = Math.round(deltaMs / 60_000)
  if (minutes < 60) return `resets in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 48) return `resets in ${hours}h${restMinutes > 0 ? ` ${restMinutes}m` : ""}`
  return `resets in ${Math.floor(hours / 24)}d`
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
    (w: QuotaWindow) =>
      `${w.label}: ${Math.round(w.usedPercent)}% used${w.resetsAtMs !== null ? `, ${formatReset(w.resetsAtMs)}` : ""}`,
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
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
})
