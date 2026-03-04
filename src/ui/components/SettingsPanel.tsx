import { useEffect, useCallback, useState } from "react"
import type { StripConfigState, SoundConfig } from "../../types"
import "./SettingsPanel.css"

/* ── Theme helpers ── */

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

/* ── Formatting helpers ── */

function formatTimeout(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return "<1 min"
  if (minutes === 1) return "1 min"
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes} min`
}

/* ── Props ── */

export type SettingsPanelProps = {
  stripConfig: StripConfigState
  onToggleStrip: (key: keyof StripConfigState) => void
  soundConfig: SoundConfig
  onSoundConfigChange: (config: SoundConfig) => void
  onTestSound: (event: "idle" | "complete" | "error" | "question") => void
  open: boolean
  onClose: () => void
  projects: Array<{ sourceId: string; label: string; mainSession: { status: string } }>
  visibility: Record<string, boolean>
  onToggleVisibility: (sourceId: string) => void
  collapsedHeight: number
  onCollapsedHeightChange: (height: number) => void
  gridGap: number
  onGridGapChange: (gap: number) => void
  idleTimeoutMs: number
  onIdleTimeoutMsChange: (ms: number) => void
}

/* ── Display toggle metadata ── */

const COLLAPSED_TOGGLES: { key: keyof StripConfigState; label: string }[] = [
  { key: "showProjectName", label: "Project Name" },
  { key: "showStatusDot", label: "Status Dot" },
  { key: "showMiniSparkline", label: "Mini Sparkline" },
  { key: "showPlanProgress", label: "Plan Progress" },
  { key: "showAgentBadge", label: "Agent Badge" },
  { key: "showLastUpdated", label: "Last Updated" },
  { key: "showAvatar", label: "Show Avatar" },
]

const EXPANDED_TOGGLES: { key: keyof StripConfigState; label: string }[] = [
  { key: "showTokenUsage", label: "Token Usage" },
  { key: "showBackgroundTasks", label: "Background Tasks" },
  { key: "showGitWorktrees", label: "Git Worktrees" },
]

/* ── Sound event metadata ── */

const SOUND_EVENTS: {
  key: "onSessionIdle" | "onPlanComplete" | "onSessionError" | "onQuestion"
  label: string
  event: "idle" | "complete" | "error" | "question"
}[] = [
  { key: "onSessionIdle", label: "Session Idle", event: "idle" },
  { key: "onPlanComplete", label: "Plan Complete", event: "complete" },
  { key: "onSessionError", label: "Session Error", event: "error" },
  { key: "onQuestion", label: "Question", event: "question" },
]

/* ── Component ── */

export function SettingsPanel({
  stripConfig,
  onToggleStrip,
  soundConfig,
  onSoundConfigChange,
  onTestSound,
  open,
  onClose,
  projects,
  visibility,
  onToggleVisibility,
  collapsedHeight,
  onCollapsedHeightChange,
  gridGap,
  onGridGapChange,
  idleTimeoutMs,
  onIdleTimeoutMsChange,
}: SettingsPanelProps) {
  const [theme, setThemeState] = useState<"dark" | "light">(getTheme)
  const [serviceStatus, setServiceStatus] = useState<{ installed: boolean; enabled: boolean; active: boolean } | null>(null)
  const [serviceLoading, setServiceLoading] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    setThemeState(next)
  }, [theme])

  const fetchServiceStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/service/status")
      const data = await res.json()
      if (data.ok) setServiceStatus(data)
    } catch { /* ignore */ }
  }, [])

  const handleServiceToggle = useCallback(async () => {
    if (!serviceStatus) return
    setServiceLoading(true)
    setServiceError(null)
    try {
      const endpoint = serviceStatus.enabled ? "/api/service/disable" : "/api/service/enable"
      const res = await fetch(endpoint, { method: "POST" })
      const data = await res.json()
      if (!data.ok) setServiceError(data.error ?? "Unknown error")
      await fetchServiceStatus()
    } catch (err) {
      setServiceError(String(err))
    } finally {
      setServiceLoading(false)
    }
  }, [serviceStatus, fetchServiceStatus])

  useEffect(() => {
    if (open) fetchServiceStatus()
  }, [open, fetchServiceStatus])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  /* Sound config helpers */
  const handleMasterToggle = useCallback(() => {
    onSoundConfigChange({ ...soundConfig, enabled: !soundConfig.enabled })
  }, [soundConfig, onSoundConfigChange])

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSoundConfigChange({ ...soundConfig, volume: Number(e.target.value) })
    },
    [soundConfig, onSoundConfigChange],
  )

  const handleSoundEventToggle = useCallback(
    (key: "onSessionIdle" | "onPlanComplete" | "onSessionError" | "onQuestion") => {
      onSoundConfigChange({ ...soundConfig, [key]: !soundConfig[key] })
    },
    [soundConfig, onSoundConfigChange],
  )

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="settings-backdrop"
        data-open={open}
        onMouseDown={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="settings-panel"
        data-open={open}
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        {/* Header */}
        <div className="settings-panel__header">
          <h2 className="settings-panel__title">Settings</h2>
          <button
            className="settings-panel__close"
            onClick={onClose}
            type="button"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>


        {/* Project Visibility */}
        <div className="settings-section">
          <h3 className="settings-section__title">Project Visibility</h3>
          {projects.map((project) => (
            <div className="settings-toggle-row" key={project.sourceId}>
              <span className="strip-status-dot" data-status={project.mainSession.status} aria-hidden="true" />
              <span className="settings-toggle-label">{project.label}</span>
              <button
                className="settings-switch"
                data-checked={visibility[project.sourceId] !== false}
                onClick={() => onToggleVisibility(project.sourceId)}
                type="button"
                role="switch"
                aria-checked={visibility[project.sourceId] !== false}
                aria-label={`Show ${project.label}`}
              />
            </div>
          ))}
        </div>
        {/* Display Options */}
        <div className="settings-section">
          <h3 className="settings-section__title">Display Options</h3>
          <h4 className="settings-section__subtitle">Collapsed View</h4>
          {COLLAPSED_TOGGLES.map(({ key, label }) => (
            <div className="settings-toggle-row" key={key}>
              <span className="settings-toggle-label">{label}</span>
              <button
                className="settings-switch"
                data-checked={stripConfig[key]}
                onClick={() => onToggleStrip(key)}
                type="button"
                role="switch"
                aria-checked={stripConfig[key]}
                aria-label={label}
              />
            </div>
          ))}
          <h4 className="settings-section__subtitle">Expanded View</h4>
          {EXPANDED_TOGGLES.map(({ key, label }) => (
            <div className="settings-toggle-row" key={key}>
              <span className="settings-toggle-label">{label}</span>
              <button
                className="settings-switch"
                data-checked={stripConfig[key]}
                onClick={() => onToggleStrip(key)}
                type="button"
                role="switch"
                aria-checked={stripConfig[key]}
                aria-label={label}
              />
            </div>
          ))}

          {/* Collapsed Pane Height */}
          <div className="settings-slider-row">
            <span className="settings-slider-label">Collapsed Height</span>
            <input
              className="settings-slider"
              type="range"
              min={80}
              max={300}
              step={1}
              value={collapsedHeight}
              onChange={(e) => onCollapsedHeightChange(Number(e.target.value))}
              aria-label="Collapsed pane height"
            />
            <span className="settings-slider-value">{collapsedHeight}px</span>
          </div>

          {/* Grid Gap */}
          <div className="settings-slider-row">
            <span className="settings-slider-label">Column Gap</span>
            <input
              className="settings-slider"
              type="range"
              min={4}
              max={24}
              step={1}
              value={gridGap}
              onChange={(e) => onGridGapChange(Number(e.target.value))}
              aria-label="Grid gap between columns"
            />
            <span className="settings-slider-value">{gridGap}px</span>
          </div>

          {/* Idle Timeout */}
          <div className="settings-slider-row">
            <span className="settings-slider-label">Idle Timeout</span>
            <input
              className="settings-slider"
              type="range"
              min={30_000}
              max={3_600_000}
              step={30_000}
              value={idleTimeoutMs}
              onChange={(e) => onIdleTimeoutMsChange(Number(e.target.value))}
              aria-label="Idle timeout duration"
            />
            <span className="settings-slider-value">{formatTimeout(idleTimeoutMs)}</span>
          </div>
        </div>
        {/* Sound Notifications */}
        <div className={`settings-section${!soundConfig.enabled ? " settings-section--disabled" : ""}`}>
          <h3 className="settings-section__title">Sound Notifications</h3>

          {/* Master toggle */}
          <div className="settings-master-toggle">
            <span className="settings-master-toggle__label">Enable Sounds</span>
            <button
              className="settings-switch"
              data-checked={soundConfig.enabled}
              onClick={handleMasterToggle}
              type="button"
              role="switch"
              aria-checked={soundConfig.enabled}
              aria-label="Enable sound notifications"
            />
          </div>

          {/* Volume */}
          <div className="settings-volume">
            <span className="settings-volume__label">Volume</span>
            <input
              className="settings-volume__slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={soundConfig.volume}
              onChange={handleVolumeChange}
              aria-label="Sound volume"
            />
            <span className="settings-volume__value">{soundConfig.volume}</span>
          </div>

          {/* Per-event toggles */}
          {SOUND_EVENTS.map(({ key, label, event }) => (
            <div className="settings-sound-event" key={key}>
              <span className="settings-sound-event__label">{label}</span>
              <button
                className="settings-sound-event__test"
                onClick={() => onTestSound(event)}
                type="button"
                aria-label={`Test ${label} sound`}
              >
                Test
              </button>
              <button
                className="settings-switch"
                data-checked={soundConfig[key]}
                onClick={() => handleSoundEventToggle(key)}
                type="button"
                role="switch"
                aria-checked={soundConfig[key]}
                aria-label={label}
              />
            </div>
          ))}
        </div>

        {/* System Service */}
        <div className={`settings-section${!serviceStatus?.installed ? " settings-section--disabled" : ""}`}>
          <h3 className="settings-section__title">System Service</h3>
          {serviceStatus ? (
            <>
              <div className="settings-toggle-row">
                <span className="settings-toggle-label">
                  Auto-start on login
                </span>
                 <button
                   className="settings-switch"
                   data-checked={serviceStatus.enabled}
                   onClick={handleServiceToggle}
                   disabled={!serviceStatus.installed || serviceLoading}
                   type="button"
                   role="switch"
                   aria-checked={serviceStatus.enabled}
                   aria-label="Toggle system service"
                 />
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
                Status: {serviceStatus.active ? "Running" : serviceStatus.enabled ? "Enabled (stopped)" : "Disabled"}
              </p>
              {!serviceStatus.installed && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.25rem 0 0 0" }}>
                  Run <code>scripts/install-service.sh</code> to install
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Loading…</p>
          )}
          {serviceError && (
            <p style={{ fontSize: "0.8rem", color: "var(--accent-error)", margin: "0.25rem 0 0 0" }}>{serviceError}</p>
          )}
        </div>

        {/* Theme Toggle */}
        <div className="settings-section">
          <div className="settings-toggle-row">
            <span className="settings-toggle-label">Theme</span>
            <button
              className="theme-toggle settings-switch"
              data-checked={theme === "light"}
              onClick={toggleTheme}
              type="button"
              role="switch"
              aria-checked={theme === "light"}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

