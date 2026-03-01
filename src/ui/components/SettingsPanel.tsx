import { useEffect, useCallback } from "react"
import type { StripConfigState, SoundConfig } from "../../types"
import "./SettingsPanel.css"

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
}

/* ── Display toggle metadata ── */

const COLLAPSED_TOGGLES: { key: keyof StripConfigState; label: string }[] = [
  { key: "showStatusDot", label: "Status Dot" },
  { key: "showMiniSparkline", label: "Mini Sparkline" },
  { key: "showPlanProgress", label: "Plan Progress" },
  { key: "showAgentBadge", label: "Agent Badge" },
  { key: "showLastUpdated", label: "Last Updated" },
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
}: SettingsPanelProps) {
  /* Escape key handler */
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
      </aside>
    </>
  )
}
