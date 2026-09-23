import { useMemo, useCallback, useRef, useEffect, useState } from "react"
import type {
  DashboardMultiProjectPayload,
  PlanStatus,
  ProjectSnapshot,
  SoundConfig,
  StripConfigState,
} from "../types"
import { DashboardHeader } from "./components/DashboardHeader"
import { ProjectStrip } from "./components/ProjectStrip"
import { Sparkline } from "./components/Sparkline"
import { PlanProgress } from "./components/PlanProgress"
import { SessionSwimlane } from "./components/SessionSwimlane"
import { SettingsPanel } from "./components/SettingsPanel"
import { ColumnResizeHandle } from "./components/ColumnResizeHandle"
import { ProjectManagementPanel } from "./components/ProjectManagementPanel"
import { QuotaStrip } from "./components/QuotaStrip"
import { useStripConfig } from "./hooks/useStripConfig"
import { PreviewNav } from "./components/PreviewNav"
import type { PreviewMode } from "./types"

import "./App.css"
import { useDensityMode } from "./hooks/useDensityMode"
import { useSoundNotifications } from "./hooks/useSoundNotifications"
import { useQuotas } from "./hooks/useQuotas"
import { useProjectOrder } from "./hooks/useProjectOrder"
import { useProjectVisibility } from "./hooks/useProjectVisibility"
import { selectRecentProjects } from "./utils/recent-projects"
import {
  buildSessionStatusMap,
  diffSessionStatuses,
  shouldPlaySound,
} from "../ingest/session-diff"
import type {
  SessionStatusDiff,
  SessionStatusMap,
  SoundPlaybackDecision,
} from "../ingest/session-diff"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type React from "react"

/* ── Helpers ── */

type ProjectSessionStatusMaps = Map<string, SessionStatusMap>
type ProjectPlanStatuses = Map<string, PlanStatus>

export type ProjectSoundDecision = {
  sourceId: string
  diff: SessionStatusDiff
  playback: SoundPlaybackDecision
}


export function resolveProjectOrderIds(
  sortedProjects: ProjectSnapshot[],
  orderedIds: string[],
  isManualOrder: boolean,
): string[] {
  const currentIds = sortedProjects.map((project) => project.sourceId)
  if (!isManualOrder) return currentIds

  const retained = orderedIds.filter((id) => currentIds.includes(id))
  const added = currentIds.filter((id) => !orderedIds.includes(id))
  return [...retained, ...added]
}

function buildProjectSessionMaps(projects: ProjectSnapshot[]): ProjectSessionStatusMaps {
  return new Map(
    projects.map((project) => [project.sourceId, buildSessionStatusMap(project.sessions)]),
  )
}

function buildProjectPlanStatuses(projects: ProjectSnapshot[]): ProjectPlanStatuses {
  return new Map(projects.map((project) => [project.sourceId, project.planProgress.status]))
}

export function computeProjectSoundDecisions(args: {
  previousSessionMaps: ProjectSessionStatusMaps
  previousPlanStatuses: ProjectPlanStatuses
  projects: ProjectSnapshot[]
  soundConfig: SoundConfig
}): {
  decisions: ProjectSoundDecision[]
  nextSessionMaps: ProjectSessionStatusMaps
  nextPlanStatuses: ProjectPlanStatuses
} {
  const { previousSessionMaps, previousPlanStatuses, projects, soundConfig } = args
  const nextSessionMaps = buildProjectSessionMaps(projects)
  const nextPlanStatuses = buildProjectPlanStatuses(projects)
  const decisions: ProjectSoundDecision[] = []

  for (const project of projects) {
    const diff = diffSessionStatuses(
      previousSessionMaps.get(project.sourceId) ?? new Map(),
      nextSessionMaps.get(project.sourceId) ?? new Map(),
      {
        prevPlanStatus: previousPlanStatuses.get(project.sourceId),
        currPlanStatus: project.planProgress.status,
      },
    )

    decisions.push({
      sourceId: project.sourceId,
      diff,
      playback: shouldPlaySound(diff, soundConfig),
    })
  }

  return { decisions, nextSessionMaps, nextPlanStatuses }
}

/* ── Props ── */

export type AppProps = {
  data: DashboardMultiProjectPayload | null
  connected: boolean
  connection?: "live" | "polling"
  lastUpdatedMs: number | null
  previewMode: PreviewMode | null
  refresh: () => Promise<void>
}

export type ActiveOverlay = 'none' | 'settings' | 'projectManagement'

/* ── localStorage helpers ── */

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* localStorage may be unavailable */ }
}

/* ── Escalation deep-link params (?project=<sourceId>&session=<sessionId>) ── */

type DeepLinkParams = {
  project: string | null
  session: string | null
}

/** Parsed ONCE on mount — no history integration, unknown values resolve to null */
function readDeepLinkParams(search: string): DeepLinkParams {
  const params = new URLSearchParams(search)
  const project = params.get("project")
  const session = params.get("session")
  return {
    project: project && project.trim() !== "" ? project : null,
    session: session && session.trim() !== "" ? session : null,
  }
}

/* ── Component ── */

export function App({ data, connected, connection = "polling", lastUpdatedMs, previewMode, refresh }: AppProps) {
  const { config: soundConfig, setConfig: setSoundConfig, playWaiting, playAllClear, playAttention, playQuestion } = useSoundNotifications()
  const { orderedIds, columns, reorder, setColumns, syncIds } = useProjectOrder()
  const { visibility, isVisible, toggleVisibility } = useProjectVisibility()
  const { config: stripConfig, toggle: toggleStripConfig, setMode: setStripMode, setMiniSparklineMode, setQuotaIconMode, setRecentProjectsLimit, setProjectListMode } = useStripConfig()
  const { quotas } = useQuotas()
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>('none')

  /* ── Deep-link selection from escalation cards (parsed once on mount) ── */
  const deepLink = useMemo<DeepLinkParams>(() => readDeepLinkParams(typeof window !== "undefined" ? window.location.search : ""), [])
  /* Only applies once data confirms the target project exists — unknown ids are ignored */
  const deeplinkProjectId = useMemo(() => {
    if (!data || !deepLink.project) return null
    return data.projects.some((p) => p.sourceId === deepLink.project) ? deepLink.project : null
  }, [data, deepLink.project])
  /* Session deep-links are ignored unless the target project actually has that session */
  const deeplinkSessionId = useMemo((): string | null => {
    if (!deeplinkProjectId || !deepLink.session) return null
    const project = data?.projects.find((p) => p.sourceId === deeplinkProjectId)
    return project?.sessionTimeSeries?.sessions?.some((s) => s.sessionId === deepLink.session) ? deepLink.session : null
  }, [data, deeplinkProjectId, deepLink.session])
  /* Scroll the deep-linked strip (and session, when known) into view once it has rendered.
     Highlight alone can land off-screen in multi-column layouts. */
  useEffect(() => {
    if (!deeplinkProjectId) return
    const target = deeplinkSessionId
      ? document.querySelector('[data-deeplink-session-target="true"]')
      : null
    ;(target ?? document.querySelector('[data-deeplink-selected="true"]'))?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [deeplinkProjectId, deeplinkSessionId])


  /* ── Collapsible header ── */
  const [headerCollapsed, setHeaderCollapsed] = useState<boolean>(() => safeGetItem('dashboard-header-collapsed') === 'true')

  useEffect(() => {
    safeSetItem('dashboard-header-collapsed', String(headerCollapsed))
  }, [headerCollapsed])

  const handleToggleHeader = useCallback(() => setHeaderCollapsed((c) => !c), [])

  /* ── Zoom ── */
  const [zoom, setZoom] = useState<number>(() => {
    const saved = safeGetItem('dashboard-zoom')
    return saved ? parseFloat(saved) : 1.8
  })

  useEffect(() => {
    safeSetItem('dashboard-zoom', String(zoom))
    document.documentElement.style.setProperty('--zoom', String(zoom))
  }, [zoom])

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.1, Math.round((z - 0.1) * 10) / 10))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1.8)
  }, [])

  /* ── Collapsed pane height & grid gap ── */
  const [collapsedHeight, setCollapsedHeight] = useState<number>(() => {
    const saved = safeGetItem('dashboard-collapsed-height')
    const parsed = saved ? parseInt(saved, 10) : 40
    /* Clamp persisted values to the 30–100px slider range */
    return Number.isFinite(parsed) ? Math.min(100, Math.max(30, parsed)) : 40
  })

  const [gridGap, setGridGap] = useState<number>(() => {
    const saved = safeGetItem('dashboard-grid-gap')
    return saved ? parseInt(saved, 10) : 10
  })

  useEffect(() => {
    safeSetItem('dashboard-collapsed-height', String(collapsedHeight))
    document.documentElement.style.setProperty('--collapsed-pane-height', `${collapsedHeight}px`)
  }, [collapsedHeight])

  useEffect(() => {
    safeSetItem('dashboard-grid-gap', String(gridGap))
    document.documentElement.style.setProperty('--grid-gap', `${gridGap}px`)
  }, [gridGap])

  /* ── Idle timeout ── */
  const [idleTimeoutMs, setIdleTimeoutMs] = useState<number>(() => {
    const stored = safeGetItem('idle-timeout-ms')
    return stored ? Number(stored) : 300_000 // 5 min default
  })

  useEffect(() => {
    safeSetItem('idle-timeout-ms', String(idleTimeoutMs))
  }, [idleTimeoutMs])

  /* ── Column widths ── */
  const [columnWidths, setColumnWidths] = useState<Record<string, number[]>>(() => {
    try {
      const raw = safeGetItem('dashboard-column-widths')
      if (!raw) return {}
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, number[]>
      }
      return {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    safeSetItem('dashboard-column-widths', JSON.stringify(columnWidths))
  }, [columnWidths])

  const currentWidths = useMemo(() => {
    return columnWidths[String(columns)] ?? Array(columns).fill(1)
  }, [columnWidths, columns])

  const handleColumnResize = useCallback(
    (columnIndex: number, deltaFraction: number) => {
      setColumnWidths((prev) => {
        const key = String(columns)
        const widths = [...(prev[key] ?? Array(columns).fill(1))]
        const totalFr = widths.reduce((a, b) => a + b, 0)
        const delta = deltaFraction * totalFr

        const minFr = 200 / (window.innerWidth / columns)

        let left = widths[columnIndex] + delta
        let right = widths[columnIndex + 1] - delta

        if (left < minFr) {
          right -= minFr - left
          left = minFr
        }
        if (right < minFr) {
          left -= minFr - right
          right = minFr
        }

        widths[columnIndex] = Math.round(left * 100) / 100
        widths[columnIndex + 1] = Math.round(right * 100) / 100

        return { ...prev, [key]: widths }
      })
    },
    [columns],
  )
  const handleCloseOverlay = useCallback(() => setActiveOverlay('none'), [])
  const firstLoadRef = useRef(true)
  const prevSessionMapsRef = useRef<ProjectSessionStatusMaps>(new Map())
  const prevPlanStatusesRef = useRef<ProjectPlanStatuses>(new Map())

  /* Sound notifications on status transitions */
  useEffect(() => {
    if (!data || !connected) return

    const {
      decisions,
      nextSessionMaps,
      nextPlanStatuses,
    } = computeProjectSoundDecisions({
      previousSessionMaps: prevSessionMapsRef.current,
      previousPlanStatuses: prevPlanStatusesRef.current,
      projects: data.projects,
      soundConfig,
    })

    // Skip sound on first successful load
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      prevSessionMapsRef.current = nextSessionMaps
      prevPlanStatusesRef.current = nextPlanStatuses
      return
    }

    for (const decision of decisions) {
      if (decision.playback.playWaiting) {
        playWaiting()
      }

      if (decision.playback.playAttention) {
        playAttention()
      }

      if (decision.playback.playAllClear) {
        playAllClear()
      }

      if (decision.playback.playQuestion) {
        playQuestion()
      }
    }

    prevSessionMapsRef.current = nextSessionMaps
    prevPlanStatusesRef.current = nextPlanStatuses
  }, [data, connected, soundConfig, playWaiting, playAllClear, playAttention, playQuestion])

  /* Hidden projects are excluded before the recently-active selection, so they
     never consume one of the X dashboard slots */
  const visibleProjects = useMemo(() => {
    if (!data) return []
    return data.projects.filter((p) => isVisible(p.sourceId))
  }, [data, isVisible])

  const sortedProjects = useMemo(() => {
    if (stripConfig.projectListMode === "manual") {
      /* Manual pins: every visible project, ordered by the user's drag order */
      return visibleProjects
    }
    return selectRecentProjects(visibleProjects, stripConfig.recentProjectsLimit)
  }, [visibleProjects, stripConfig.recentProjectsLimit, stripConfig.projectListMode])

  /* Sync orderedIds when project list changes */
  useEffect(() => {
    if (sortedProjects.length > 0) {
      syncIds(sortedProjects.map((p) => p.sourceId))
    }
  }, [sortedProjects, syncIds])

  const currentOrderIds = useMemo(
    () => resolveProjectOrderIds(sortedProjects, orderedIds, orderedIds.length > 0),
    [sortedProjects, orderedIds],
  )

  /* Display projects in DnD order when available, else status sort; then filter by visibility */
  /* Projects menu list: full snapshot set + all discovered projects (uncapped) */
  const managementProjects = useMemo(() => {
    if (!data) return []
    const byId = new Map<string, ProjectSnapshot>()
    for (const stub of data.discoveredProjects ?? []) byId.set(stub.sourceId, stub)
    for (const project of data.projects) byId.set(project.sourceId, project)
    return [...byId.values()]
  }, [data])

  const displayProjects = useMemo(() => {
    const map = new Map(sortedProjects.map((p) => [p.sourceId, p]))
    const ordered = currentOrderIds
      .map((id) => map.get(id))
      .filter((p): p is ProjectSnapshot => p !== undefined)
    const visible = ordered.filter((p) => isVisible(p.sourceId))
    /* Deep-linked project is always rendered, even when ordering/visibility/
       recent-limit would otherwise exclude it — otherwise nothing can be selected */
    if (deeplinkProjectId && !visible.some((p) => p.sourceId === deeplinkProjectId)) {
      const deeplinked = data?.projects.find((p) => p.sourceId === deeplinkProjectId)
      if (deeplinked) return [deeplinked, ...visible]
    }
    return visible
  }, [sortedProjects, currentOrderIds, isVisible, deeplinkProjectId, data])

  const resizeHandleIds = useMemo(
    () => Array.from({ length: Math.max(columns - 1, 0) }, (_, handleIndex) => `column-resize-handle-${handleIndex + 1}`),
    [columns],
  )

  const effectiveStripConfig = useMemo(() => {
    if (!previewMode) return stripConfig
    return {
      ...stripConfig,
      showProjectName: true,
      showStatusDot: true,
      showAvatar: true,
    }
  }, [previewMode, stripConfig])

  const isPreviewMode = previewMode !== null


  const projectCount = displayProjects.length
  const density = useDensityMode(projectCount)

  /* DnD sensors - 8px activation distance so drags do not fire on plain clicks */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = currentOrderIds.indexOf(String(active.id))
      const newIndex = currentOrderIds.indexOf(String(over.id))

      if (oldIndex !== -1 && newIndex !== -1) {
        reorder(oldIndex, newIndex)
      }
    },
    [currentOrderIds, reorder]
  )

  const handleSettingsOpen = useCallback(() => setActiveOverlay('settings'), [])
  const handleManageProjectsOpen = useCallback(() => setActiveOverlay('projectManagement'), [])
  const handleEmptyManageProjects = useCallback(() => setActiveOverlay('projectManagement'), [])
  const handleTestSound = useCallback((event: "idle" | "complete" | "error" | "question") => {
    if (event === 'idle') playWaiting()
    if (event === 'complete') playAllClear()
    if (event === 'error') playAttention()
    if (event === 'question') playQuestion()
  }, [playWaiting, playAllClear, playAttention, playQuestion])

  return (
    <div className="page" data-density={density} data-header-collapsed={headerCollapsed}>
      {headerCollapsed ? (
        <button
          className="header-restore"
          onClick={handleToggleHeader}
          type="button"
          title="Show header"
          aria-label="Show header"
        >
          ⌄
        </button>
      ) : (
        <DashboardHeader
          connected={connected}
          connection={connection}
          lastUpdatedMs={lastUpdatedMs}
          columns={columns}
          onSetColumns={setColumns}
          onSettingsOpen={handleSettingsOpen}
          onManageProjectsOpen={handleManageProjectsOpen}
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onCollapse={handleToggleHeader}
        />
      )}
      {stripConfig.showQuotas && <QuotaStrip quotas={quotas} iconMode={stripConfig.quotaIconMode} />}
      <div className="container">
        {data === null ? (
          <div className="dashboard-loading">Loading…</div>
        ) : projectCount === 0 && data.projects.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty__icon">⊘</span>
            <span>No registered projects found</span>
            <button type="button" className="dashboard-empty__action" onClick={handleEmptyManageProjects}>
              Manage Projects
            </button>
          </div>
        ) : projectCount === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty__icon">⊘</span>
            <span>All projects hidden — adjust visibility in Manage Projects</span>
            <button type="button" className="dashboard-empty__action" onClick={handleEmptyManageProjects}>
              Manage Projects
            </button>
          </div>
        ) : (
          <>
            {previewMode && (
              <PreviewNav previewMode={previewMode} />
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayProjects.map((project) => project.sourceId)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className="project-stack"
                  style={{ gridTemplateColumns: currentWidths.map((w: number) => `${w}fr`).join(' ') }}
                >
                  {displayProjects.map((project) => (
                    <SortableProjectStrip
                      key={project.sourceId}
                      id={project.sourceId}
                      project={project}
                      stripConfig={effectiveStripConfig}
                      idleTimeoutMs={idleTimeoutMs}
                      deeplinkSelected={project.sourceId === deeplinkProjectId}
                      deeplinkSessionId={project.sourceId === deeplinkProjectId ? deeplinkSessionId : null}
                    />
                  ))}
                  {columns > 1 && resizeHandleIds.map((handleId, i: number) => {
                    const totalFr = currentWidths.reduce((a: number, b: number) => a + b, 0)
                    const precedingFr = currentWidths.slice(0, i + 1).reduce((a: number, b: number) => a + b, 0)
                    const leftPercent = (precedingFr / totalFr) * 100
                    return (
                      <ColumnResizeHandle
                        key={handleId}
                        columnIndex={i}
                        onResize={(delta) => handleColumnResize(i, delta)}
                        style={{ left: `${leftPercent}%` }}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>

      <SettingsPanel
        stripConfig={stripConfig}
        onToggleStrip={toggleStripConfig}
        onSetStripMode={setStripMode}
        onSetMiniSparklineMode={setMiniSparklineMode}
        onSetQuotaIconMode={setQuotaIconMode}
        onSetRecentProjectsLimit={setRecentProjectsLimit}
        onSetProjectListMode={setProjectListMode}
        soundConfig={soundConfig}
        onSoundConfigChange={setSoundConfig}
        onTestSound={handleTestSound}
        open={activeOverlay === 'settings'}
        onClose={handleCloseOverlay}
        onOpenProjectManagement={handleManageProjectsOpen}
        collapsedHeight={collapsedHeight}
        onCollapsedHeightChange={setCollapsedHeight}
        gridGap={gridGap}
        onGridGapChange={setGridGap}
        idleTimeoutMs={idleTimeoutMs}
        onIdleTimeoutMsChange={setIdleTimeoutMs}
      />

      <ProjectManagementPanel
        open={activeOverlay === 'projectManagement'}
        onClose={handleCloseOverlay}
        projects={managementProjects}
        orderedIds={orderedIds}
        visibility={visibility}
        onToggleVisibility={toggleVisibility}
        onReorder={reorder}
        onProjectAdded={refresh}
        onRefresh={refresh}
        onOpenSettings={handleSettingsOpen}
      />
    </div>
  )
}

/* ── Sortable wrapper ── */

type SortableProjectStripProps = {
  id: string
  project: ProjectSnapshot
  stripConfig?: StripConfigState
  idleTimeoutMs: number
  deeplinkSelected?: boolean
  deeplinkSessionId?: string | null
}

function SortableProjectStrip({ id, project, stripConfig, idleTimeoutMs, deeplinkSelected, deeplinkSessionId }: SortableProjectStripProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectStripWithChildren
        project={project}
        stripConfig={stripConfig}
        idleTimeoutMs={idleTimeoutMs}
        deeplinkSelected={deeplinkSelected}
        deeplinkSessionId={deeplinkSessionId}
      />
    </div>
  )
}

/* ── Wired ProjectStrip with embedded Sparkline + PlanProgress ── */

type ProjectStripWithChildrenProps = {
  project: ProjectSnapshot
  stripConfig?: StripConfigState
  idleTimeoutMs: number
  deeplinkSelected?: boolean
  deeplinkSessionId?: string | null
}

function ProjectStripWithChildren({ project, stripConfig, idleTimeoutMs, deeplinkSelected, deeplinkSessionId }: ProjectStripWithChildrenProps) {
  return (
    <ProjectStrip
      project={project}
      stripConfig={stripConfig}
      idleTimeoutMs={idleTimeoutMs}
      deeplinkSelected={deeplinkSelected}
      deeplinkSessionId={deeplinkSessionId}
    >
      {{
        miniSparkline: (
          <Sparkline
            mode={stripConfig?.miniSparklineMode === "ambient" ? "bg" : "mini"}
            timeSeries={project.timeSeries}
          />
        ),
        compactPlan: (
          <PlanProgress
            planProgress={project.planProgress}
            mode="compact"
          />
        ),
        fullPlan: (
          <PlanProgress
            planProgress={project.planProgress}
            mode="full"
          />
        ),
        sessionSwimlane: (
          <SessionSwimlane sessionTimeSeries={project.sessionTimeSeries} deeplinkSessionId={deeplinkSessionId} />
        ),

      }}
    </ProjectStrip>
  )
}
