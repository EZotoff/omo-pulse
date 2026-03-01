import type React from "react"
import { memo, useRef, useEffect, useCallback } from "react"
import type { ProjectSnapshot, StripConfigState } from "../../types"
import { useProjectPaneHeights } from "../hooks/useProjectPaneHeights"
import "./ProjectStrip.css"

/* ── Helpers ── */

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Format millisecond timestamp to relative time string ("2s ago", "1m ago", "3h ago") */
export function formatRelativeTime(ms: number): string {
  const now = Date.now()
  const delta = Math.max(0, now - ms)
  const seconds = Math.floor(delta / 1_000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Format a token count to a compact string (e.g., 1234 → "1.2k") */
function formatTokenCount(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

/* ── Props ── */

export type ProjectStripProps = {
  project: ProjectSnapshot
  expanded: boolean
  onToggleExpand: () => void
  stripConfig?: StripConfigState
  children?: {
    miniSparkline: React.ReactNode
    fullSparkline: React.ReactNode
    compactPlan: React.ReactNode
    fullPlan: React.ReactNode
    sessionSwimlane?: React.ReactNode
  }
}

/* ── Component ── */

function ProjectStripInner({ project, expanded, onToggleExpand, stripConfig, children }: ProjectStripProps) {
  const { mainSession, planProgress, backgroundTasks, tokenUsage, lastUpdatedMs } = project
  const sourceId = project.sourceId
  const isStale = (() => {
    if (!mainSession?.lastUpdated) return false
    const lastUpdatedTime = new Date(mainSession.lastUpdated).getTime()
    return Date.now() - lastUpdatedTime > STALE_THRESHOLD_MS
  })()

  /* ── Pane height management ── */
  const { setHeight, releaseHeight, isReleased, getHeight } = useProjectPaneHeights()
  const released = isReleased(sourceId)
  const currentHeight = getHeight(sourceId)

  /* ── Drag-to-resize refs ── */
  const bodyRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!bodyRef.current) return
      draggingRef.current = true
      startYRef.current = e.clientY
      startHeightRef.current = bodyRef.current.getBoundingClientRect().height
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
    },
    [],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const delta = e.clientY - startYRef.current
      const next = Math.max(150, startHeightRef.current + delta)
      if (bodyRef.current) {
        bodyRef.current.style.maxHeight = `${next}px`
      }
    }
    const handleMouseUp = (e: MouseEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      const delta = e.clientY - startYRef.current
      const finalHeight = Math.max(150, startHeightRef.current + delta)
      setHeight(sourceId, finalHeight)
    }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [sourceId, setHeight])

  const handleReleaseToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (released) {
        setHeight(sourceId, 400)
      } else {
        releaseHeight(sourceId)
      }
    },
    [released, sourceId, setHeight, releaseHeight],
  )

  /* ── Body style ── */
  const bodyStyle: React.CSSProperties = expanded
    ? { maxHeight: released ? "none" : `${currentHeight}px` }
    : {}

  return (
    <div className="project-strip" data-expanded={expanded} data-stale={isStale}>
      {/* Collapsed header — always visible */}
      <div className="strip-header" onClick={onToggleExpand} role="button" tabIndex={0} aria-expanded={expanded} aria-label={`${project.label} — ${mainSession.status}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand() } }}>
        {stripConfig?.showStatusDot !== false && <span className="strip-status-dot" data-status={mainSession.status} data-stale={isStale} aria-hidden="true" />}
        <span className="strip-label truncate">{project.label}</span>
        {stripConfig?.showMiniSparkline !== false && <div className="sparkline-slot sparkline-slot--mini">{children?.miniSparkline}</div>}
        {stripConfig?.showAgentBadge !== false && <span className="strip-agent-badge">{mainSession.agent}</span>}
        {stripConfig?.showPlanProgress !== false && <div className="plan-slot plan-slot--compact">{children?.compactPlan}</div>}
        {stripConfig?.showLastUpdated !== false && <span className="strip-updated">{mainSession.lastUpdated ? formatRelativeTime(new Date(mainSession.lastUpdated).getTime()) : "—"}</span>}
        {expanded && (
          <button
            className="release-btn"
            onClick={handleReleaseToggle}
            title={released ? "Constrain height" : "Release height"}
            aria-label={released ? "Constrain pane height" : "Release pane height"}
          >
            {released ? "⊟" : "⤢"}
          </button>
        )}
        <span className="strip-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </div>

      {/* Expanded body */}
      <div
        className={`strip-body${expanded && !released ? " strip-body--constrained" : ""}`}
        ref={bodyRef}
        style={bodyStyle}
      >
        <div className="strip-body-inner">
          {/* Sparkline — full width */}
          <div className="strip-section">
            <span className="strip-section-label">Activity</span>
            <div className="sparkline-slot sparkline-slot--full">{children?.fullSparkline}</div>
          </div>

          {/* Session swimlane */}
          <div className="strip-section">
            <span className="strip-section-label">Session Activity</span>
            <div className="swimlane-slot">{children?.sessionSwimlane}</div>
          </div>

          {/* Plan progress — full width */}
          <div className="strip-section">
            <span className="strip-section-label">Plan — {planProgress.name || "unnamed"}</span>
            <div className="plan-slot plan-slot--full">{children?.fullPlan}</div>
          </div>

          {/* Main session detail */}
          <div className="strip-section">
            <span className="strip-section-label">Main Session</span>
            <div className="strip-session-detail">
              <span className="strip-session-field">
                <span className="strip-session-field-label">agent</span>
                <span className="strip-session-field-value">{mainSession.agent}</span>
              </span>
              <span className="strip-session-field">
                <span className="strip-session-field-label">model</span>
                <span className="strip-session-field-value">{mainSession.currentModel ?? "—"}</span>
              </span>
              <span className="strip-session-field">
                <span className="strip-session-field-label">tool</span>
                <span className="strip-session-field-value">{mainSession.currentTool || "—"}</span>
              </span>
              <span className="strip-session-field">
                <span className="strip-session-field-label">session</span>
                <span className="strip-session-field-value">{mainSession.sessionLabel || "—"}</span>
              </span>
            </div>
          </div>

          {/* Last polled */}
          <div className="strip-section">
            <span className="strip-section-label">Last Polled</span>
            <span className="strip-session-field-value">{formatRelativeTime(lastUpdatedMs)}</span>
          </div>

          {/* Background tasks */}
          {stripConfig?.showBackgroundTasks !== false && (
            <div className="strip-section">
              <span className="strip-section-label">Background Tasks ({backgroundTasks.length})</span>
              {backgroundTasks.length > 0 ? (
                <div className="strip-bg-tasks">
                  {backgroundTasks.map((task) => (
                    <div key={task.taskId} className="strip-bg-task-row">
                      <span className="strip-bg-task-status">{task.status}</span>
                      <span className="truncate">{task.agent}</span>
                      <span className="truncate">{task.model ?? "—"}</span>
                      <span className="truncate">{task.currentTool || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="strip-bg-task-empty">No background tasks</span>
              )}
            </div>
          )}

          {/* Token usage */}
          {stripConfig?.showTokenUsage !== false && tokenUsage && (
            <div className="strip-section">
              <span className="strip-section-label">Token Usage</span>
              <div className="strip-tokens">
                <div className="strip-token-item">
                  <span className="strip-token-label">in</span>
                  <span className="strip-token-value">{formatTokenCount(tokenUsage.inputTokens)}</span>
                </div>
                <div className="strip-token-item">
                  <span className="strip-token-label">out</span>
                  <span className="strip-token-value">{formatTokenCount(tokenUsage.outputTokens)}</span>
                </div>
                <div className="strip-token-item">
                  <span className="strip-token-label">total</span>
                  <span className="strip-token-value">{formatTokenCount(tokenUsage.totalTokens)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Git worktrees — reserved for future use via showGitWorktrees config toggle */}
        </div>
        {/* Resize handle — only visible when constrained */}
        {expanded && !released && (
          <div className="resize-handle" onMouseDown={handleResizeMouseDown} />
        )}
      </div>
    </div>
  )
}

export const ProjectStrip = memo(ProjectStripInner)
