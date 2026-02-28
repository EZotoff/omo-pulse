import { useCallback, useEffect, useState } from "react"

/* ── Props ── */

export type DashboardHeaderProps = {
  connected: boolean
  lastUpdatedMs: number | null
  projectCount: number
  onExpandAll: () => void
  onCollapseAll: () => void
}

/* ── Helpers ── */

function getTheme(): "dark" | "light" {
  return (document.documentElement.getAttribute("data-theme") as "dark" | "light") ?? "dark"
}

function setTheme(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme)
  try {
    localStorage.setItem("ezOmoDashTheme", theme)
  } catch {
    /* localStorage unavailable */
  }
}

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
}: DashboardHeaderProps) {
  const [theme, setThemeState] = useState<"dark" | "light">(getTheme)

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    setThemeState(next)
  }, [theme])

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
          <button className="header-btn" onClick={onExpandAll} type="button">
            Expand All
          </button>
          <button className="header-btn" onClick={onCollapseAll} type="button">
            Collapse All
          </button>
        </div>

        <span className="dashboard-header__updated mono">
          {formatUpdateTime(lastUpdatedMs)}
        </span>

        <span
          className="dashboard-header__connection"
          data-connected={connected}
          title={connected ? "Connected" : "Disconnected"}
        />

        <button
          className="theme-toggle header-btn"
          onClick={toggleTheme}
          type="button"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  )
}
