import { useEffect, useState } from "react"

/* ── Props ── */

export type DashboardHeaderProps = {
  connected: boolean
  lastUpdatedMs: number | null
  projectCount: number
  onExpandAll: () => void
  onCollapseAll: () => void
  columns?: number
  onSetColumns?: (n: number) => void
  onSettingsOpen?: () => void
  zoom?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
}

/* ── Helpers ── */



function formatUpdateTime(ms: number | null): string {
  if (ms === null) return "—"
  const delta = Math.max(0, Date.now() - ms)
  const seconds = Math.floor(delta / 1_000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/* ── Component ── */

export function DashboardHeader({
  connected,
  lastUpdatedMs,
  projectCount,
  onExpandAll,
  onCollapseAll,
  columns,
  onSetColumns,
  onSettingsOpen,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: DashboardHeaderProps) {


  /* Re-render update time every second */
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="dashboard-header">
      <div className="dashboard-header__left">
        <h1 className="dashboard-header__title">ez-omo-dash</h1>
        <span className="dashboard-header__count">{projectCount} projects</span>
      </div>

      <div className="dashboard-header__right">
        <div className="dashboard-header__actions">
          <button className="header-btn" onClick={onExpandAll} type="button" title="Expand all" aria-label="Expand all">
            +
          </button>
          <button className="header-btn" onClick={onCollapseAll} type="button" title="Collapse all" aria-label="Collapse all">
            −
          </button>

          {onSetColumns && (
            <div className="header-cols">
              <span className="header-cols__label">cols</span>
              <div className="header-cols__toggle">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    className={`header-cols__btn${columns === n ? " header-cols__btn--active" : ""}`}
                    onClick={() => onSetColumns(n)}
                    type="button"
                    title={`${n} column${n > 1 ? "s" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(onZoomIn || onZoomOut || onZoomReset) && (
            <div className="header-zoom">
              {zoom !== undefined && (
                <span className="header-zoom__pct mono">{Math.round(zoom * 100)}%</span>
              )}
              <div className="header-zoom__controls">
                {onZoomOut && (
                  <button className="header-btn header-btn--xs" onClick={onZoomOut} type="button" title="Zoom out" aria-label="Zoom out" disabled={zoom !== undefined && zoom <= 0.5}>
                    −
                  </button>
                )}
                {onZoomIn && (
                  <button className="header-btn header-btn--xs" onClick={onZoomIn} type="button" title="Zoom in" aria-label="Zoom in" disabled={zoom !== undefined && zoom >= 2.0}>
                    +
                  </button>
                )}
                {onZoomReset && (
                  <button className="header-btn header-btn--xs" onClick={onZoomReset} type="button" title="Reset zoom" aria-label="Reset zoom">
                    ⟳
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <span className="dashboard-header__updated mono" aria-live="polite" aria-atomic="true">
          {formatUpdateTime(lastUpdatedMs)}
        </span>

        <span
          className="dashboard-header__connection"
          data-connected={connected}
          title={connected ? "Connected" : "Disconnected"}
          role="status"
          aria-label={connected ? "Connected" : "Disconnected"}
        />

        {onSettingsOpen && (
          <button className="header-btn" onClick={onSettingsOpen} type="button" title="Settings" aria-label="Open settings">
            ⚙
          </button>
        )}


      </div>
    </header>
  )
}
