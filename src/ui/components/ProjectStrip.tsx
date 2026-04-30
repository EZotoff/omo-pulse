import type React from "react"
import { memo, useRef, useEffect, useCallback, useState } from "react"
import type { ProjectSnapshot, StripConfigState } from "../../types"
import { useProjectPaneHeights } from "../hooks/useProjectPaneHeights"
import { getInitials } from "../utils/avatar"
import "./ProjectStrip.css"

/* ── Helpers ── */

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Format millisecond timestamp to relative time string ("2s ago", "1m ago", "3h ago") */
export function formatRelativeTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
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

/** Tool names that indicate a long-running script/command rather than AI tool activity */
const SCRIPT_TOOL_NAMES = new Set(["bash", "interactive_bash", "shell", "terminal", "execute_command"])

export function computeDisplayStatus(
  aggregateStatus: string,
  lastUpdatedTime: number,
  idleTimeoutMs: number = 300_000,
  nowMs: number = Date.now(),
  currentTool?: string,
): string {
  if (aggregateStatus === 'plan_complete') return 'idle'
  
  // Only active execution states demote to idle when stale
  const DEMOTABLE_STATUSES = ['running_tool', 'thinking', 'busy']
  if (!DEMOTABLE_STATUSES.includes(aggregateStatus)) return aggregateStatus
  
  const isClientStale = nowMs - lastUpdatedTime > idleTimeoutMs
  if (isClientStale) return "idle"

  if (aggregateStatus === 'running_tool' && currentTool && SCRIPT_TOOL_NAMES.has(currentTool)) {
    return 'running_script'
  }

  return aggregateStatus
}

function formatDuration(startedAt: string, completedAt: string): string {
  try {
    const startMs = new Date(startedAt).getTime()
    const endMs = new Date(completedAt).getTime()
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return ""
    const ms = Math.max(0, endMs - startMs)

    const totalSeconds = Math.floor(ms / 1000)
    const seconds = totalSeconds % 60
    const totalMinutes = Math.floor(totalSeconds / 60)
    const minutes = totalMinutes % 60
    const totalHours = Math.floor(totalMinutes / 60)
    const hours = totalHours % 24
    const days = Math.floor(totalHours / 24)

    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
    if (totalHours > 0) return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`
    if (totalMinutes > 0) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`
    return `${seconds}s`
  } catch {
    return ""
  }
}

function formatCompletionDate(completedAt: string): string {
  try {
    const d = new Date(completedAt)
    if (Number.isNaN(d.getTime())) return "Unknown"
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return "Unknown"
  }
}


/* ── Props ── */

export type ProjectStripProps = {
  project: ProjectSnapshot
  expanded: boolean
  onToggleExpand: () => void
  stripConfig?: StripConfigState
  idleTimeoutMs?: number
  children?: {
    miniSparkline: React.ReactNode
    fullSparkline?: React.ReactNode
    compactPlan: React.ReactNode
    fullPlan: React.ReactNode
    sessionSwimlane?: React.ReactNode
  }
}

/* ── Component ── */

const MAX_SESSION_DOTS = 5;

function resolveProjectName(project: ProjectSnapshot): string {
  const projectWithOptionalName = project as ProjectSnapshot & { name?: string }
  if (typeof projectWithOptionalName.name === "string" && projectWithOptionalName.name.trim().length > 0) {
    return projectWithOptionalName.name
  }
  return project.label
}

export function getSessionFamily(status: string): 'active' | 'attention' | 'danger' | 'idle' {
  if (['busy', 'thinking', 'running_tool', 'running_script', 'bg_agent'].includes(status)) return 'active'
  if (status === 'question') return 'attention'
  if (status === 'error') return 'danger'
  return 'idle'
}

/* ── Sub-components ── */

type StripHeaderContentProps = {
  project: ProjectSnapshot
  finalDisplayStatus: string
  isStale: boolean
  stripConfig?: StripConfigState
  mainSession: ProjectSnapshot["mainSession"]
  gitUncommittedCount: number | null | undefined
  unintiatedPlans: ProjectSnapshot["unintiatedPlans"]
  children?: ProjectStripProps["children"]
  slots?: ProjectStripProps["children"]
}

const StripHeaderContent = memo(function StripHeaderContent({ project, finalDisplayStatus, isStale, stripConfig, mainSession, gitUncommittedCount, unintiatedPlans, children, slots }: StripHeaderContentProps) {
  const slotContent = slots ?? children
  return (
    <>
      {stripConfig?.showStatusDot !== false && (
        <span className="strip-status-dot" data-status={finalDisplayStatus} data-stale={isStale} data-avatar={stripConfig?.showAvatar !== false ? "true" : undefined} aria-hidden="true">
          {stripConfig?.showAvatar !== false ? getInitials(project.label) : null}
        </span>
      )}
      {(finalDisplayStatus === 'running_tool' || finalDisplayStatus === 'running_script') && mainSession.currentTool && (
        <span className="strip-tool-badge" data-script={finalDisplayStatus === 'running_script' ? "true" : undefined}>
          {mainSession.currentTool}
        </span>
      )}
      {stripConfig?.showProjectName !== false && (
        <span className="strip-label truncate">{project.label}</span>
      )}
      {stripConfig?.stripDisplayMode === "session" && project.sessions && project.sessions.length > 0 && (
        <div className="session-indicators">
          {project.sessions.slice(0, MAX_SESSION_DOTS).map((session) => (
            <span
              key={session.sessionId}
              className="session-dot"
              data-family={getSessionFamily(session.status)}
              data-status={session.status}
              title={`${session.sessionLabel || session.agent} - ${session.status}`}
            />
          ))}
          {project.sessions.length > MAX_SESSION_DOTS && (
            <span className="strip-session-overflow">+{project.sessions.length - MAX_SESSION_DOTS}</span>
          )}
        </div>
      )}
      {stripConfig?.showMiniSparkline !== false && <div className="sparkline-slot sparkline-slot--mini">{slotContent?.miniSparkline}</div>}
      {stripConfig?.showAgentBadge !== false && <span className="strip-agent-badge">{mainSession.agent}</span>}
      {gitUncommittedCount != null && gitUncommittedCount > 0 && (
        <span className="strip-git-badge" title={`${gitUncommittedCount} uncommitted change${gitUncommittedCount === 1 ? '' : 's'}`}>
          {gitUncommittedCount > 999 ? '999+' : gitUncommittedCount}
        </span>
      )}
      {stripConfig?.showGitWorktrees !== false && project.worktrees && project.worktrees.activeCount > 0 && (
        <span
          className={`strip-worktree-badge${project.worktrees.hotCount > 0 ? " strip-worktree-badge--hot" : ""}`}
          title={`${project.worktrees.activeCount} active worktree${project.worktrees.activeCount === 1 ? "" : "s"}${project.worktrees.hotCount > 0 ? ` • ${project.worktrees.hotCount} hot` : ""}`}
        >
          <span className={`strip-worktree-badge__value${project.worktrees.hotCount > 0 ? " strip-worktree-badge__value--hot" : ""}`}>
            {project.worktrees.hotCount}
          </span>
          <span className="strip-worktree-badge__divider" aria-hidden="true" />
          <span className="strip-worktree-badge__value">{project.worktrees.activeCount}</span>
        </span>
      )}
      {stripConfig?.showPlanProgress !== false && <div className="plan-slot plan-slot--compact">{slotContent?.compactPlan}</div>}
      {unintiatedPlans && unintiatedPlans.length > 0 && (
        <span className="uninitiated-badge">{unintiatedPlans.length}</span>
      )}
      {stripConfig?.showLastUpdated !== false && <span className="strip-updated">{mainSession.lastUpdated ? formatRelativeTime(new Date(mainSession.lastUpdated).getTime()) : "—"}</span>}
    </>
  )
})

type StripMetricsProps = {
  project: ProjectSnapshot
  mainSession: ProjectSnapshot["mainSession"]
  lastUpdatedMs: number
  stripConfig?: StripConfigState
  backgroundTasks: ProjectSnapshot["backgroundTasks"]
}

const StripMetrics = memo(function StripMetrics({ project, mainSession, lastUpdatedMs, stripConfig, backgroundTasks }: StripMetricsProps) {
  return (
    <>
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

      <div className="strip-section">
        <span className="strip-section-label">Last Polled</span>
        <span className="strip-session-field-value">{formatRelativeTime(lastUpdatedMs)}</span>
      </div>

      {stripConfig?.showGitWorktrees !== false && project.worktrees && project.worktrees.worktrees.length > 1 && (() => {
        const filteredWorktrees = project.worktrees.worktrees.filter((wt) => !wt.isMainWorktree)
        if (filteredWorktrees.length === 0) return null
        return (
          <div className="strip-section">
            <span className="strip-section-label">Worktrees ({filteredWorktrees.length})</span>
            <div className="strip-worktrees-list">
              {filteredWorktrees
                .sort((a, b) => {
                  const aHot = a.commitsAhead > 0 && Boolean(a.diffStat && a.diffStat.filesChanged > 0)
                  const bHot = b.commitsAhead > 0 && Boolean(b.diffStat && b.diffStat.filesChanged > 0)
                  if (aHot !== bHot) return aHot ? -1 : 1
                  const aBranch = a.branch || a.commitHash.substring(0, 7)
                  const bBranch = b.branch || b.commitHash.substring(0, 7)
                  return aBranch.localeCompare(bBranch)
                })
                .map((wt) => {
                  const isHot = wt.commitsAhead > 0 && Boolean(wt.diffStat && wt.diffStat.filesChanged > 0)
                  const branchName = wt.branch || wt.commitHash.substring(0, 7)
                  return (
                    <div key={wt.path} className={`strip-worktree-row ${isHot ? "strip-worktree-row--hot" : ""}`}>
                      <span className="strip-worktree-branch" title={branchName}>
                        {isHot && <span className="strip-worktree-hot-dot" title="Hot Worktree" />}
                        {wt.isLocked && <span className="strip-worktree-indicator strip-worktree-indicator--locked" title="Locked">locked</span>}
                        {wt.isPrunable && <span className="strip-worktree-indicator strip-worktree-indicator--prunable" title="Prunable">prunable</span>}
                        <span className="strip-worktree-branch-name">{branchName.length > 30 ? `${branchName.substring(0, 30)}…` : branchName}</span>
                      </span>
                      {wt.commitsAhead > 0 && <span className="strip-worktree-commits"> +{wt.commitsAhead} commits</span>}
                      {wt.diffStat && wt.diffStat.filesChanged > 0 && (
                        <span className="strip-worktree-diff"> {wt.diffStat.filesChanged} files, +{wt.diffStat.insertions} -{wt.diffStat.deletions}</span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )
      })()}

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
    </>
  )
})

type StripTopRowProps = {
  stripConfig?: StripConfigState
  tokenUsage: ProjectSnapshot["tokenUsage"]
  slots?: ProjectStripProps["children"]
}

const StripTopRow = memo(function StripTopRow({ stripConfig, tokenUsage, slots }: StripTopRowProps) {
  return (
    <div className="strip-top-row">
      <div className="strip-top-row-activity">
        <div className="strip-section">
          <span className="strip-section-label">Activity</span>
          <div className="swimlane-slot">{slots?.sessionSwimlane}</div>
        </div>
      </div>

      {stripConfig?.showTokenUsage !== false && tokenUsage && (
        <div className="strip-section strip-section--token-usage">
          <span className="strip-section-label">Token Usage</span>
          <div className="strip-tokens">
            <div className="strip-token-item">
              <span className="strip-token-label">Input</span>
              <span className="strip-token-value">{formatTokenCount(tokenUsage.inputTokens)}</span>
            </div>
            <div className="strip-token-item">
              <span className="strip-token-label">Output</span>
              <span className="strip-token-value">{formatTokenCount(tokenUsage.outputTokens)}</span>
            </div>
            <div className="strip-token-item">
              <span className="strip-token-label">Total</span>
              <span className="strip-token-value">{formatTokenCount(tokenUsage.totalTokens)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

type StripPlansProps = {
  project: ProjectSnapshot
  planProgress: ProjectSnapshot["planProgress"]
  unintiatedPlans: ProjectSnapshot["unintiatedPlans"]
  expandedUninitiatedPlans: Set<string>
  onToggleUninitiatedPlan: (planPath: string, e: React.MouseEvent) => void
  slots?: ProjectStripProps["children"]
}

const StripPlans = memo(function StripPlans({ project, planProgress, unintiatedPlans, expandedUninitiatedPlans, onToggleUninitiatedPlan, slots }: StripPlansProps) {
  return (
    <>
      <div className="strip-section">
        <span className="strip-section-label">Plan — {planProgress.name || "unnamed"}</span>
        <div className="plan-slot plan-slot--full">{slots?.fullPlan}</div>
      </div>

      {project.planHistory && project.planHistory.entries.length > 0 && (
        <div className="strip-section plan-history-section">
          <span className="strip-section-label">Plan History</span>
          <div className="plan-history-list">
            {project.planHistory.entries.map((entry) => {
              const duration = formatDuration(entry.started_at, entry.completed_at)
              return (
                <div key={`${entry.archived_path}-${entry.started_at}-${entry.completed_at}-${entry.completed_tasks}-${entry.total_tasks}`} className="plan-history-item">
                  <div className="plan-history-header">
                    <span className="plan-history-name truncate">{entry.plan_name || entry.plan_path}</span>
                    <span className="plan-history-date">{formatCompletionDate(entry.completed_at)}</span>
                  </div>
                  <div className="plan-history-stats">
                    <span className="plan-history-tasks">{entry.completed_tasks}/{entry.total_tasks} tasks</span>
                    {duration && <span className="plan-history-duration">({duration})</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {unintiatedPlans && unintiatedPlans.length > 0 && (
        <div className="strip-section">
          <span className="strip-section-label">Uninitiated Plans ({unintiatedPlans.length})</span>
          <div className="uninitiated-plans-section">
            {unintiatedPlans.map((plan) => {
              const isExpanded = expandedUninitiatedPlans.has(plan.path)
              const visibleSteps = plan.steps.slice(0, 10)
              const hiddenCount = plan.steps.length - 10

              return (
                <button
                  type="button"
                  key={plan.path}
                  className={`uninitiated-plan-item${isExpanded ? ' uninitiated-plan-item--expanded' : ''}`}
                  onClick={(e) => onToggleUninitiatedPlan(plan.path, e)}
                  aria-expanded={isExpanded}
                >
                  <div className="truncate">
                    <strong>{plan.name}</strong> ({plan.total} task{plan.total === 1 ? '' : 's'})
                  </div>
                  
                  {isExpanded && plan.steps.length > 0 && (
                    <div className="uninitiated-plan-steps">
                      {visibleSteps.map((step) => (
                        <div key={`${plan.path}-${step.checked ? 'done' : 'todo'}-${step.text}`} className="truncate">
                          [{'\u00A0'}] {step.text || '(empty)'}
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <div className="uninitiated-plan-hidden-count">
                          + {hiddenCount} more
                        </div>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
})

function ProjectStripInner({ project, expanded, onToggleExpand, stripConfig, idleTimeoutMs, children }: ProjectStripProps) {
  const { mainSession, planProgress, backgroundTasks, tokenUsage, lastUpdatedMs, gitUncommittedCount, unintiatedPlans } = project
  const sourceId = project.sourceId
  const projectName = resolveProjectName(project)
  const aggregateStatus = project.aggregateStatus ?? mainSession.status
  const displayStatus = computeDisplayStatus(
    aggregateStatus,
    mainSession.lastUpdated ? new Date(mainSession.lastUpdated).getTime() : 0,
    idleTimeoutMs,
    undefined,
    mainSession.currentTool || undefined,
  )

  const finalDisplayStatus = sourceId.startsWith('preview-') && mainSession.status === 'plan_complete'
    ? 'plan_complete'
    : displayStatus

  const isStale = (() => {
    const activeStates = ['busy', 'thinking', 'running_tool', 'running_script', 'question', 'error']
    if (activeStates.includes(finalDisplayStatus)) return false
    if (planProgress?.planStale) return true
    if (!mainSession?.lastUpdated) return true
    const lastUpdatedTime = new Date(mainSession.lastUpdated).getTime()
    return Date.now() - lastUpdatedTime > STALE_THRESHOLD_MS
  })()

  const previewPublicNameMatch = sourceId.startsWith('preview-all-') ? sourceId.match(/^preview-all-(.+)-\d+$/) : null
  const previewPublicName = previewPublicNameMatch?.[1] ?? null

  /* ── Pane height management ── */
  const { setHeight, releaseHeight, isReleased, getHeight } = useProjectPaneHeights()
  const released = isReleased(sourceId)
  const currentHeight = getHeight(sourceId)

  /* ── Uninitiated plans state ── */
  const [expandedUninitiatedPlans, setExpandedUninitiatedPlans] = useState<Set<string>>(new Set())

  const toggleUninitiatedPlan = useCallback((planPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedUninitiatedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(planPath)) {
        next.delete(planPath)
      } else {
        next.add(planPath)
      }
      return next
    })
  }, [])

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
    <div className="project-strip" data-project-id={sourceId} data-expanded={expanded} data-stale={isStale} data-status={finalDisplayStatus}>
      {previewPublicName ? (
        <a
          className="strip-header"
          href={`?preview=status:${previewPublicName}`}
          aria-label={`View variants for ${previewPublicName}`}
          style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}
        >
          <StripHeaderContent
            project={project}
            finalDisplayStatus={finalDisplayStatus}
            isStale={isStale}
            stripConfig={stripConfig}
            mainSession={mainSession}
            gitUncommittedCount={gitUncommittedCount}
            unintiatedPlans={unintiatedPlans}
            slots={children}
          />
        </a>
      ) : (
        <div className="strip-header-row">
          <button
            type="button"
            className="strip-header strip-header-button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`${project.label} — ${finalDisplayStatus}`}
          >
            <StripHeaderContent
              project={project}
              finalDisplayStatus={finalDisplayStatus}
              isStale={isStale}
              stripConfig={stripConfig}
              mainSession={mainSession}
              gitUncommittedCount={gitUncommittedCount}
              unintiatedPlans={unintiatedPlans}
              slots={children}
            />
            <span className="strip-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </button>
          {expanded && (
            <button
              type="button"
              className="release-btn"
              onClick={handleReleaseToggle}
              title={released ? "Constrain height" : "Release height"}
              aria-label={released ? "Constrain pane height" : "Release pane height"}
            >
              {released ? "⊟" : "⤢"}
            </button>
          )}
        </div>
      )}
      <div
        className={`strip-body${expanded && !released ? " strip-body--constrained" : ""}`}
        ref={bodyRef}
        style={bodyStyle}
      >
        <div className="strip-body-inner">
          <div className="strip-project-header">
            <span className="strip-project-name">{projectName}</span>
            <span className="strip-project-path" title={project.projectRoot}>{project.projectRoot}</span>
          </div>

          <StripTopRow
            stripConfig={stripConfig}
            tokenUsage={tokenUsage}
            slots={children}
          />

          <StripMetrics
            project={project}
            mainSession={mainSession}
            lastUpdatedMs={lastUpdatedMs}
            stripConfig={stripConfig}
            backgroundTasks={backgroundTasks}
          />

          <StripPlans
            project={project}
            planProgress={planProgress}
            unintiatedPlans={unintiatedPlans}
            expandedUninitiatedPlans={expandedUninitiatedPlans}
            onToggleUninitiatedPlan={toggleUninitiatedPlan}
            slots={children}
          />
        </div>
        {expanded && !released && (
          <button type="button" className="resize-handle" onMouseDown={handleResizeMouseDown} aria-label="Resize project pane" />
        )}
      </div>
    </div>
  )
}

export const ProjectStrip = memo(ProjectStripInner)
