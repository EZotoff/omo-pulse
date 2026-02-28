import { useMemo, useCallback } from "react"
import type { DashboardMultiProjectPayload, ProjectSnapshot, SessionStatus } from "../types"
import { DashboardHeader } from "./components/DashboardHeader"
import { ProjectStrip } from "./components/ProjectStrip"
import { Sparkline } from "./components/Sparkline"
import { PlanProgress } from "./components/PlanProgress"
import "./App.css"
import { useExpandState } from "./hooks/useExpandState"

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

  const handleExpandAll = useCallback(() => {
    if (!data) return
    expandAll(data.projects.map((p) => p.sourceId))
  }, [data, expandAll])


  /* Sort projects: active first */
  const sortedProjects = useMemo(() => {
    if (!data) return []
    return [...data.projects].sort(compareProjects)
  }, [data])

  const projectCount = sortedProjects.length

  return (
    <div className="page">
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
      }}
    </ProjectStrip>
  )
}
