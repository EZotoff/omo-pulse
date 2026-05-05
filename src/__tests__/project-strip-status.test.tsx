import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ProjectStrip, computeDisplayStatus, getSessionFamily } from "../ui/components/ProjectStrip"
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
  sessions: [],
  aggregateStatus: "idle",
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
  showProjectName: true,
  stripDisplayMode: "project",
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
      mainSession: { ...baseProject.mainSession, status: "error" as const },
      aggregateStatus: "error" as const,
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
      mainSession: { ...baseProject.mainSession, status: "busy" as const },
      aggregateStatus: "busy" as const,
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
      },
      aggregateStatus: "plan_complete" as const,
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
      mainSession: { ...baseProject.mainSession, status: "unknown" as const },
      aggregateStatus: "unknown" as const,
    }
    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )
    expect(html).toContain('data-status="unknown"')
  })

  it("marks stale demoted execution strips as stale when display status becomes idle", () => {
    const staleTime = new Date(Date.now() - 6 * 60_000).toISOString()
    const project = {
      ...baseProject,
      mainSession: {
        ...baseProject.mainSession,
        lastUpdated: staleTime,
        status: "running_tool" as const,
      },
      aggregateStatus: "running_tool" as const,
    }

    const html = renderToStaticMarkup(
      <ProjectStrip project={project} expanded={false} onToggleExpand={() => {}} stripConfig={baseConfig}>
        {children}
      </ProjectStrip>
    )

    expect(html).toContain('data-status="idle"')
    expect(html).toContain('data-stale="true"')
  })
})

describe("computeDisplayStatus", () => {
  const DEFAULT_TIMEOUT = 300_000
  const NOW = 1_000_000_000
  const FRESH_TIME = NOW - 100_000
  const STALE_TIME = NOW - 400_000

  it("returns idle if aggregateStatus is plan_complete", () => {
    expect(computeDisplayStatus("plan_complete", FRESH_TIME, DEFAULT_TIMEOUT, NOW)).toBe("idle")
    expect(computeDisplayStatus("plan_complete", STALE_TIME, DEFAULT_TIMEOUT, NOW)).toBe("idle")
  })

  it("demotes active execution states to idle when stale", () => {
    const executionStates = ["running_tool", "thinking", "busy"]

    for (const state of executionStates) {
      expect(computeDisplayStatus(state, FRESH_TIME, DEFAULT_TIMEOUT, NOW)).toBe(state)
      expect(computeDisplayStatus(state, STALE_TIME, DEFAULT_TIMEOUT, NOW)).toBe("idle")
    }
  })

  it("never demotes attention states to idle when stale", () => {
    const attentionStates = ["error", "question"]

    for (const state of attentionStates) {
      expect(computeDisplayStatus(state, FRESH_TIME, DEFAULT_TIMEOUT, NOW)).toBe(state)
      expect(computeDisplayStatus(state, STALE_TIME, DEFAULT_TIMEOUT, NOW)).toBe(state)
    }
  })

  it("does not demote other inactive states when stale", () => {
    const otherStates = ["idle", "unknown"]

    for (const state of otherStates) {
      expect(computeDisplayStatus(state, FRESH_TIME, DEFAULT_TIMEOUT, NOW)).toBe(state)
      expect(computeDisplayStatus(state, STALE_TIME, DEFAULT_TIMEOUT, NOW)).toBe(state)
    }
  })
})

describe("getSessionFamily", () => {
  it("keeps error sessions visually distinct from question sessions", () => {
    expect(getSessionFamily("question")).toBe("attention")
    expect(getSessionFamily("error")).toBe("danger")
  })

  it("preserves active and idle family mapping", () => {
    expect(getSessionFamily("running_tool")).toBe("active")
    expect(getSessionFamily("thinking")).toBe("active")
    expect(getSessionFamily("busy")).toBe("active")
    expect(getSessionFamily("idle")).toBe("idle")
    expect(getSessionFamily("unknown")).toBe("idle")
  })
})
