import { useMemo, useCallback, useRef, useEffect, useState } from "react"
import type { DashboardMultiProjectPayload, ProjectSnapshot, SessionStatus, StripConfigState } from "../types"
import { DashboardHeader } from "./components/DashboardHeader"
import { ProjectStrip } from "./components/ProjectStrip"
import { Sparkline } from "./components/Sparkline"
import { PlanProgress } from "./components/PlanProgress"
import { SessionSwimlane } from "./components/SessionSwimlane"
import { SettingsPanel } from "./components/SettingsPanel"
import { AddProjectForm } from "./components/AddProjectForm"
import { ColumnResizeHandle } from "./components/ColumnResizeHandle"
import { useStripConfig } from "./hooks/useStripConfig"

import "./App.css"
import { useExpandState } from "./hooks/useExpandState"
import { useDensityMode } from "./hooks/useDensityMode"
import { useSoundNotifications } from "./hooks/useSoundNotifications"
import { useProjectOrder } from "./hooks/useProjectOrder"
import { useProjectVisibility } from "./hooks/useProjectVisibility"
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

/** Status priority for sorting: active first, idle second, unknown last */
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  busy: 0,
  running_tool: 1,
  thinking: 2,
  idle: 3,
  question: 4,
  plan_complete: 4,
  error: 5,
  unknown: 6,
}

function compareProjects(a: ProjectSnapshot, b: ProjectSnapshot): number {
  const pa = STATUS_PRIORITY[a.mainSession.status] ?? 5
  const pb = STATUS_PRIORITY[b.mainSession.status] ?? 5
  if (pa !== pb) return pa - pb
  return b.lastUpdatedMs - a.lastUpdatedMs
}

/* ── Props ── */

export type AppProps = {
  data: DashboardMultiProjectPayload | null
  connected: boolean
  lastUpdatedMs: number | null
}

/* ── localStorage helpers ── */

function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* localStorage may be unavailable */ }
}

/* ── Component ── */

export function App({ data, connected, lastUpdatedMs }: AppProps) {
  const { expandedIds, toggle, expandAll, collapseAll } = useExpandState()
  const { config: soundConfig, setConfig: setSoundConfig, playWaiting, playAllClear, playAttention, playQuestion } = useSoundNotifications()
  const { orderedIds, columns, reorder, setColumns, syncIds } = useProjectOrder()
  const { visibility, isVisible, toggleVisibility } = useProjectVisibility()
  const { config: stripConfig, toggle: toggleStripConfig } = useStripConfig()
  const [settingsOpen, setSettingsOpen] = useState(false)

  /* ── Zoom ── */
  const [zoom, setZoom] = useState<number>(() => {
    const saved = safeGetItem('dashboard-zoom')
    return saved ? parseFloat(saved) : 1
  })

  useEffect(() => {
    safeSetItem('dashboard-zoom', String(zoom))
    document.documentElement.style.setProperty('--zoom', String(zoom))
  }, [zoom])

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
  }, [])

  /* ── Collapsed pane height & grid gap ── */
  const [collapsedHeight, setCollapsedHeight] = useState<number>(() => {
    const saved = safeGetItem('dashboard-collapsed-height')
    return saved ? parseInt(saved, 10) : 40
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
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [])
  const prevDataRef = useRef<DashboardMultiProjectPayload | null>(null)
  const firstLoadRef = useRef(true)

  const handleExpandAll = useCallback(() => {
    if (!data) return
    expandAll(data.projects.map((p) => p.sourceId))
  }, [data, expandAll])

  /* Sound notifications on status transitions */
  useEffect(() => {
    if (!data || !connected) return

    // Skip sound on first successful load
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      prevDataRef.current = data
      return
    }

    const prev = prevDataRef.current
    const soundDebug = safeGetItem('dashboard-sound-debug') === 'true'
    if (prev) {
      for (const project of data.projects) {
        const prevProject = prev.projects.find(p => p.sourceId === project.sourceId)
        if (!prevProject) continue

        const prevSessionId = prevProject.mainSession.sessionId
        const currSessionId = project.mainSession.sessionId
        if (prevSessionId !== currSessionId) continue

        const prevStatus = prevProject.mainSession.status
        const currStatus = project.mainSession.status
        const activeStates: SessionStatus[] = ['busy', 'running_tool', 'thinking']

         // Session idle: active → idle
         if (activeStates.includes(prevStatus) && currStatus === 'idle') {
           playWaiting()
           if (soundDebug) console.debug('[sound] idle', project.sourceId, prevStatus, '→', currStatus)
         }

         // Session error: active/idle → error
         if (prevStatus !== 'error' && currStatus === 'error') {
           playAttention()
           if (soundDebug) console.debug('[sound] error', project.sourceId, prevStatus, '→', currStatus)
         }

         // Plan complete: in progress → complete
         const prevPlanStatus = prevProject.planProgress.status
         const currPlanStatus = project.planProgress.status
         if (prevPlanStatus === 'in progress' && currPlanStatus === 'complete') {
           playAllClear()
           if (soundDebug) console.debug('[sound] complete', project.sourceId, prevPlanStatus, '→', currPlanStatus)
         }

         // Question: any → question
         if (prevStatus !== 'question' && currStatus === 'question') {
           playQuestion()
           if (soundDebug) console.debug('[sound] question', project.sourceId, prevStatus, '→', currStatus)
         }
      }
    }

    prevDataRef.current = data
  }, [data, connected, playWaiting, playAllClear, playAttention, playQuestion])

  /* Sort projects: active first */
  const sortedProjects = useMemo(() => {
    if (!data) return []
    return [...data.projects].sort(compareProjects)
  }, [data])

  /* Sync orderedIds when project list changes */
  useEffect(() => {
    if (sortedProjects.length > 0) {
      syncIds(sortedProjects.map((p) => p.sourceId))
    }
  }, [sortedProjects, syncIds])

  /* Display projects in DnD order when available, else status sort; then filter by visibility */
  const displayProjects = useMemo(() => {
    const map = new Map(sortedProjects.map((p) => [p.sourceId, p]))
    const ordered = orderedIds.length === 0 ? sortedProjects :
      orderedIds.map((id) => map.get(id)).filter((p): p is ProjectSnapshot => p !== undefined)
    return ordered.filter((p) => isVisible(p.sourceId))
  }, [sortedProjects, orderedIds, isVisible])

  const projectCount = displayProjects.length
  const density = useDensityMode(projectCount)

  /* DnD sensors — 8px activation distance to avoid conflicts with click-to-expand */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = orderedIds.indexOf(String(active.id))
      const newIndex = orderedIds.indexOf(String(over.id))

      if (oldIndex !== -1 && newIndex !== -1) {
        reorder(oldIndex, newIndex)
      }
    },
    [orderedIds, reorder]
  )

  return (
    <div className="page" data-density={density}>
      <DashboardHeader
        connected={connected}
        lastUpdatedMs={lastUpdatedMs}
        projectCount={projectCount}
        onExpandAll={handleExpandAll}
        onCollapseAll={collapseAll}
        columns={columns}
        onSetColumns={setColumns}
        onSettingsOpen={() => setSettingsOpen(true)}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />
      <div className="container">
        {data === null ? (
          <div className="dashboard-loading">Loading…</div>
        ) : projectCount === 0 && data.projects.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty__icon">⊘</span>
            <span>No registered projects found</span>
            <AddProjectForm onProjectAdded={() => { /* data will refresh on next poll */ }} />
          </div>
        ) : projectCount === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty__icon">⊘</span>
            <span>All projects hidden — adjust visibility in Settings</span>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedIds}
              strategy={verticalListSortingStrategy}
            >
              <div
                className="project-stack"
                style={{ gridTemplateColumns: currentWidths.map((w: number) => `${w}fr`).join(' ') }}
              >
                {displayProjects.map((project) => {
                  const expanded = expandedIds.has(project.sourceId)
                  return (
                    <SortableProjectStrip
                      key={project.sourceId}
                      id={project.sourceId}
                      project={project}
                      expanded={expanded}
                      onToggleExpand={() => toggle(project.sourceId)}
                      stripConfig={stripConfig}
                      idleTimeoutMs={idleTimeoutMs}
                    />
                  )
                })}
                {columns > 1 && currentWidths.slice(0, -1).map((_: number, i: number) => {
                  const totalFr = currentWidths.reduce((a: number, b: number) => a + b, 0)
                  const precedingFr = currentWidths.slice(0, i + 1).reduce((a: number, b: number) => a + b, 0)
                  const leftPercent = (precedingFr / totalFr) * 100
                  return (
                    <ColumnResizeHandle
                      key={`resize-${i}`}
                      columnIndex={i}
                      onResize={(delta) => handleColumnResize(i, delta)}
                      style={{ left: `${leftPercent}%` }}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <SettingsPanel
        stripConfig={stripConfig}
        onToggleStrip={toggleStripConfig}
        soundConfig={soundConfig}
        onSoundConfigChange={setSoundConfig}
        onTestSound={(event) => {
          if (event === 'idle') playWaiting()
          if (event === 'complete') playAllClear()
          if (event === 'error') playAttention()
          if (event === 'question') playQuestion()
        }}
        open={settingsOpen}
        onClose={handleCloseSettings}
        projects={data?.projects ?? []}
        visibility={visibility}
        onToggleVisibility={toggleVisibility}
        collapsedHeight={collapsedHeight}
        onCollapsedHeightChange={setCollapsedHeight}
        gridGap={gridGap}
        onGridGapChange={setGridGap}
        idleTimeoutMs={idleTimeoutMs}
        onIdleTimeoutMsChange={setIdleTimeoutMs}
      />
    </div>
  )
}

/* ── Sortable wrapper ── */

type SortableProjectStripProps = {
  id: string
  project: ProjectSnapshot
  expanded: boolean
  onToggleExpand: () => void
  stripConfig?: StripConfigState
  idleTimeoutMs: number
}

function SortableProjectStrip({ id, project, expanded, onToggleExpand, stripConfig, idleTimeoutMs }: SortableProjectStripProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectStripWithChildren
        project={project}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        stripConfig={stripConfig}
        idleTimeoutMs={idleTimeoutMs}
      />
    </div>
  )
}

/* ── Wired ProjectStrip with embedded Sparkline + PlanProgress ── */

type ProjectStripWithChildrenProps = {
  project: ProjectSnapshot
  expanded: boolean
  onToggleExpand: () => void
  stripConfig?: StripConfigState
  idleTimeoutMs: number
}

function ProjectStripWithChildren({ project, expanded, onToggleExpand, stripConfig, idleTimeoutMs }: ProjectStripWithChildrenProps) {
  return (
    <ProjectStrip
      project={project}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      stripConfig={stripConfig}
      idleTimeoutMs={idleTimeoutMs}
    >
      {{
        miniSparkline: (
          <Sparkline
            mode="mini"
            timeSeries={project.timeSeries}
          />
        ),
        fullSparkline: (
          <Sparkline
            mode="full"
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
          <SessionSwimlane sessionTimeSeries={project.sessionTimeSeries} />
        ),

      }}
    </ProjectStrip>
  )
}
