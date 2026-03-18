import { describe, it, expect } from "vitest"
import { filterProjects } from "../ui/utils/projectSearch"
import type { ProjectSnapshot } from "../types"

function createMockProject(
  label: string,
  projectRoot: string,
  sourceId: string = "test-source"
): ProjectSnapshot {
  return {
    sourceId,
    label,
    projectRoot,
    mainSession: {
      agent: "test-agent",
      currentModel: "test-model",
      currentTool: "",
      lastUpdated: "2026-01-01T00:00:00Z",
      sessionLabel: "test-session",
      sessionId: null,
      status: "unknown",
    },
    sessions: [],
    aggregateStatus: "unknown",
    planProgress: {
      name: "",
      completed: 0,
      total: 0,
      path: "",
      status: "not started",
      steps: [],
      planStale: false,
      planComplete: false,
    },
    unintiatedPlans: [],
    timeSeries: {
      windowMs: 0,
      bucketMs: 0,
      buckets: 0,
      anchorMs: 0,
      serverNowMs: 0,
      series: [],
    },
    backgroundTasks: [],
    sessionTimeSeries: {
      windowMs: 0,
      bucketMs: 0,
      buckets: 0,
      anchorMs: 0,
      serverNowMs: 0,
      sessions: [],
    },
    lastUpdatedMs: Date.now(),
  }
}

describe("filterProjects", () => {
  const projects = [
    createMockProject("react-dashboard", "/home/user/projects/react-dashboard"),
    createMockProject("node-api", "/home/user/projects/node-api"),
    createMockProject("Python ML", "/workspace/python-ml-toolkit"),
    createMockProject("Swift iOS App", "/Users/dev/ios-projects/swift-app"),
  ]

  it("returns all projects for empty query", () => {
    const result = filterProjects(projects, "")
    expect(result).toEqual(projects)
  })

  it("returns all projects for whitespace-only query", () => {
    const result = filterProjects(projects, "   ")
    expect(result).toEqual(projects)
  })

  it("matches by label (case-insensitive)", () => {
    const result = filterProjects(projects, "react")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("react-dashboard")
  })

  it("matches by label with uppercase query", () => {
    const result = filterProjects(projects, "REACT")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("react-dashboard")
  })

  it("matches by projectRoot (case-insensitive)", () => {
    const result = filterProjects(projects, "node-api")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("node-api")
  })

  it("matches by partial substring in label", () => {
    const result = filterProjects(projects, "dash")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("react-dashboard")
  })

  it("matches by partial substring in projectRoot", () => {
    const result = filterProjects(projects, "projects")
    expect(result).toHaveLength(3)
    expect(result.map((p) => p.label)).toContain("react-dashboard")
    expect(result.map((p) => p.label)).toContain("node-api")
    expect(result.map((p) => p.label)).toContain("Swift iOS App")
  })

  it("returns empty array when no match", () => {
    const result = filterProjects(projects, "nonexistent")
    expect(result).toHaveLength(0)
  })

  it("handles special characters in query", () => {
    const result = filterProjects(projects, "/Users/dev")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("Swift iOS App")
  })

  it("matches multi-word labels", () => {
    const result = filterProjects(projects, "Python ML")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("Python ML")
  })

  it("matches partial multi-word query", () => {
    const result = filterProjects(projects, "Swift")
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("Swift iOS App")
  })

  it("preserves project order in results", () => {
    const result = filterProjects(projects, "projects")
    expect(result[0].label).toBe("react-dashboard")
    expect(result[1].label).toBe("node-api")
  })
})
