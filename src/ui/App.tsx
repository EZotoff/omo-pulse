import { useMemo, useCallback, useRef, useEffect } from "react"
import type { DashboardMultiProjectPayload, ProjectSnapshot, SessionStatus } from "../types"
import { DashboardHeader } from "./components/DashboardHeader"
import { ProjectStrip } from "./components/ProjectStrip"
import { Sparkline } from "./components/Sparkline"
import { PlanProgress } from "./components/PlanProgress"
import { SessionSwimlane } from "./components/SessionSwimlane"

import "./App.css"
import { useExpandState } from "./hooks/useExpandState"
import { useDensityMode } from "./hooks/useDensityMode"
import { useSoundNotifications } from "./hooks/useSoundNotifications"

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
  const { playSessionIdle, playPlanComplete, playSessionError } = useSoundNotifications()
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

  const projectCount = sortedProjects.length
  const density = useDensityMode(projectCount)

  return (
    <div className="page" data-density={density}>
      <DashboardHeader
        connected={connected}
        lastUpdatedMs={lastUpdatedMs}
        projectCount={projectCount}
        onExpandAll={handleExpandAll}
        onCollapseAll={collapseAll}
      />

      <div className="container">
        {data === null ? (
          <div className="dashboard-loading">Loading…</div>
        ) : projectCount === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty__icon">⊘</span>
            <span>No registered projects found</span>
          </div>
        ) : (
          <div className="project-stack">
            {sortedProjects.map((project) => {
              const expanded = expandedIds.has(project.sourceId)
              return (
                <ProjectStripWithChildren
                  key={project.sourceId}
                  project={project}
                  expanded={expanded}
                  onToggleExpand={() => toggle(project.sourceId)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Wired ProjectStrip with embedded Sparkline + PlanProgress ── */

type ProjectStripWithChildrenProps = {
  project: ProjectSnapshot
  expanded: boolean
  onToggleExpand: () => void
}

function ProjectStripWithChildren({ project, expanded, onToggleExpand }: ProjectStripWithChildrenProps) {
  return (
    <ProjectStrip
      project={project}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
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
