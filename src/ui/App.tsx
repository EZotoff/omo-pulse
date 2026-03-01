import { useMemo, useCallback, useRef, useEffect, useState } from "react"
import type { DashboardMultiProjectPayload, ProjectSnapshot, SessionStatus, StripConfigState } from "../types"
import { DashboardHeader } from "./components/DashboardHeader"
import { ProjectStrip } from "./components/ProjectStrip"
import { Sparkline } from "./components/Sparkline"
import { PlanProgress } from "./components/PlanProgress"
import { SessionSwimlane } from "./components/SessionSwimlane"
import { SettingsPanel } from "./components/SettingsPanel"
import { AddProjectForm } from "./components/AddProjectForm"
import { useStripConfig } from "./hooks/useStripConfig"

import "./App.css"
import { useExpandState } from "./hooks/useExpandState"
import { useDensityMode } from "./hooks/useDensityMode"
import { useSoundNotifications } from "./hooks/useSoundNotifications"
import { useProjectOrder } from "./hooks/useProjectOrder"
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
  unknown: 4,
}

function compareProjects(a: ProjectSnapshot, b: ProjectSnapshot): number {
  const pa = STATUS_PRIORITY[a.mainSession.status] ?? 4
  const pb = STATUS_PRIORITY[b.mainSession.status] ?? 4
  if (pa !== pb) return pa - pb
  return b.lastUpdatedMs - a.lastUpdatedMs
}

/* ── Props ── */

export type AppProps = {
  data: DashboardMultiProjectPayload | null
  connected: boolean
  lastUpdatedMs: number | null
}

/* ── Component ── */

export function App({ data, connected, lastUpdatedMs }: AppProps) {
  const { expandedIds, toggle, expandAll, collapseAll } = useExpandState()
  const { config: soundConfig, setConfig: setSoundConfig, playSessionIdle, playPlanComplete, playSessionError } = useSoundNotifications()
  const { orderedIds, columns, reorder, setColumns, syncIds } = useProjectOrder()
  const { config: stripConfig, toggle: toggleStripConfig } = useStripConfig()
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    if (prev) {
      for (const project of data.projects) {
        const prevProject = prev.projects.find(p => p.sourceId === project.sourceId)
        if (!prevProject) continue

        const prevStatus = prevProject.mainSession.status
        const currStatus = project.mainSession.status
        const activeStates: SessionStatus[] = ['busy', 'running_tool', 'thinking']

        // Session idle: active → idle
        if (activeStates.includes(prevStatus) && currStatus === 'idle') {
          playSessionIdle()
        }

        // Session error: active/idle → unknown
        if (prevStatus !== 'unknown' && currStatus === 'unknown') {
          playSessionError()
        }

        // Plan complete: in progress → complete
        const prevPlanStatus = prevProject.planProgress.status
        const currPlanStatus = project.planProgress.status
        if (prevPlanStatus === 'in progress' && currPlanStatus === 'complete') {
          playPlanComplete()
        }
      }
    }

    prevDataRef.current = data
  }, [data, connected, playSessionIdle, playPlanComplete, playSessionError])

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

  /* Display projects in DnD order when available, else status sort */
  const displayProjects = useMemo(() => {
    if (orderedIds.length === 0) return sortedProjects
    const map = new Map(sortedProjects.map((p) => [p.sourceId, p]))
    return orderedIds
      .map((id) => map.get(id))
      .filter((p): p is ProjectSnapshot => p !== undefined)
  }, [sortedProjects, orderedIds])

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
      />

      <div className="container">
        {data === null ? (
          <div className="dashboard-loading">Loading…</div>
        ) : projectCount === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty__icon">⊘</span>
            <span>No registered projects found</span>
            <AddProjectForm onProjectAdded={() => { /* data will refresh on next poll */ }} />
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
                style={{ "--grid-cols": columns } as React.CSSProperties}
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
          if (event === 'idle') playSessionIdle()
          if (event === 'complete') playPlanComplete()
          if (event === 'error') playSessionError()
        }}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
}

function SortableProjectStrip({ id, project, expanded, onToggleExpand, stripConfig }: SortableProjectStripProps) {
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
}

function ProjectStripWithChildren({ project, expanded, onToggleExpand, stripConfig }: ProjectStripWithChildrenProps) {
  return (
    <ProjectStrip
      project={project}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      stripConfig={stripConfig}
    >
      {{
        miniSparkline: (
          <Sparkline
            mode="mini"
            timeSeries={project.timeSeries}
            sessionTimeSeries={project.sessionTimeSeries}
          />
        ),
        fullSparkline: (
          <Sparkline
            mode="full"
            timeSeries={project.timeSeries}
            sessionTimeSeries={project.sessionTimeSeries}
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
