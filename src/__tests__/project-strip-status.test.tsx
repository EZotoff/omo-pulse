import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ProjectStrip } from "../ui/components/ProjectStrip"
import type { ProjectSnapshot, StripConfigState } from "../types"

const baseProject: ProjectSnapshot = {
  sourceId: "test",
  label: "test-project",
  projectRoot: "/test",
  mainSession: {
    agent: "build",
    currentModel: null,
    currentTool: "bash",
    lastUpdated: new Date().toISOString(),
    sessionLabel: "main",
    sessionId: "s1",
    status: "idle"
  },
  planProgress: {
    name: "active-plan",
    completed: 0,
    total: 0,
    path: "/plan.md",
    status: "not started",
    steps: [],
    planStale: false,
    planComplete: false
  },
  unintiatedPlans: [],
  timeSeries: { windowMs: 0, bucketMs: 0, buckets: 0, anchorMs: 0, serverNowMs: 0, series: [] },
  backgroundTasks: [],
  sessionTimeSeries: { windowMs: 0, bucketMs: 0, buckets: 0, anchorMs: 0, serverNowMs: 0, sessions: [] },
  lastUpdatedMs: 0
}

const baseConfig: StripConfigState = {
  showMiniSparkline: true,
  showPlanProgress: true,
  showAgentBadge: true,
  showLastUpdated: true,
  showStatusDot: true,
  showTokenUsage: true,
  showBackgroundTasks: true,
  showGitWorktrees: true,
  showAvatar: true,
  showProjectName: true
}

const children = {
  miniSparkline: <div />,
  fullSparkline: <div />,
  compactPlan: <div />,
  fullPlan: <div />,
  sessionSwimlane: <div />,
}

describe("ProjectStrip rendered status", () => {
  it("renders with idle status when project is idle", () => {
    const project = { ...baseProject }
    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )
    expect(html).toContain('data-status="idle"')
  })

  it("renders with error status when project is error", () => {
    const project = {
      ...baseProject,
      mainSession: { ...baseProject.mainSession, status: "error" as const }
    }
    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )
    expect(html).toContain('data-status="error"')
  })

  it("renders with busy status when project is busy", () => {
    const project = {
      ...baseProject,
      mainSession: { ...baseProject.mainSession, status: "busy" as const }
    }
    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )
    expect(html).toContain('data-status="busy"')
  })

  it("renders plan_complete status when source is preview and status is plan_complete", () => {
    const project = {
      ...baseProject,
      sourceId: "preview-123",
      mainSession: {
        ...baseProject.mainSession,
        status: "plan_complete" as const
      }
    }
    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )
    expect(html).toContain('data-status="plan_complete"')
  })

  it("renders with unknown status when project is disconnected or status is unknown", () => {
    const project = {
      ...baseProject,
      mainSession: { ...baseProject.mainSession, status: "unknown" as const }
    }
    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )
    expect(html).toContain('data-status="unknown"')
  })
})

