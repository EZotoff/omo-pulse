import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ProjectStrip } from "../ui/components/ProjectStrip"
import type { ProjectSnapshot, StripConfigState } from "../types"

describe("ProjectStrip plan history rendering", () => {
  const baseProject: ProjectSnapshot = {
    sourceId: "test",
    label: "test-project",
    projectRoot: "/test",
    mainSession: {
      agent: "build",
      currentModel: null,
      currentTool: "bash",
      lastUpdated: "2025-01-01T00:00:00Z",
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

  it("renders history section when planHistory entries exist", () => {
    const projectWithHistory: ProjectSnapshot = {
      ...baseProject,
      planHistory: {
        totalCompleted: 1,
        entries: [
          {
            plan_name: "completed-feature",
            plan_path: "/completed-feature.md",
            archived_path: "/archive/completed-feature.md",
            started_at: "2025-01-01T10:00:00Z",
            completed_at: "2025-01-01T11:00:00Z",
            session_ids: [],
            total_tasks: 5,
            completed_tasks: 5
          }
        ]
      }
    }

    const html = renderToStaticMarkup(
      <ProjectStrip
        project={projectWithHistory}
        expanded={true}
        onToggleExpand={() => {}}
        stripConfig={baseConfig}
      >
        {children}
      </ProjectStrip>
    )

    expect(html).toContain("Plan History")
    expect(html).toContain("plan-history-section")
    expect(html).toContain("completed-feature")
    expect(html).toContain("5/5 tasks")
    expect(html).toContain("1h")
  })

  it("does not render history section when planHistory has no entries", () => {
    const projectEmptyHistory: ProjectSnapshot = {
      ...baseProject,
      planHistory: {
        totalCompleted: 0,
        entries: []
      }
    }

    const html = renderToStaticMarkup(
      <ProjectStrip
        project={projectEmptyHistory}
        expanded={true}
        onToggleExpand={() => {}}
        stripConfig={baseConfig}
      >
        {children}
      </ProjectStrip>
    )

    expect(html).not.toContain("Plan History")
    expect(html).not.toContain("plan-history-section")
  })

  it("does not render history section when planHistory is missing", () => {
    const html = renderToStaticMarkup(
      <ProjectStrip
        project={baseProject}
        expanded={true}
        onToggleExpand={() => {}}
        stripConfig={baseConfig}
      >
        {children}
      </ProjectStrip>
    )

    expect(html).not.toContain("Plan History")
    expect(html).not.toContain("plan-history-section")
  })

  it("renders history safely with invalid dates", () => {
    const projectWithBadDates: ProjectSnapshot = {
      ...baseProject,
      planHistory: {
        totalCompleted: 1,
        entries: [
          {
            plan_name: "bad-dates-feature",
            plan_path: "/bad-dates.md",
            archived_path: "/archive/bad.md",
            started_at: "invalid-date",
            completed_at: "invalid-date",
            session_ids: [],
            total_tasks: 2,
            completed_tasks: 2
          }
        ]
      }
    }

    const html = renderToStaticMarkup(
      <ProjectStrip
        project={projectWithBadDates}
        expanded={true}
        onToggleExpand={() => {}}
        stripConfig={baseConfig}
      >
        {children}
      </ProjectStrip>
    )

    expect(html).toContain("bad-dates-feature")
    expect(html).toContain("Unknown")
  })
})
