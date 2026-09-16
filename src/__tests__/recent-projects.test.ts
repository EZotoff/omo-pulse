import { describe, expect, it } from "vitest"
import { compareProjectsByLabel, selectRecentProjects } from "../ui/utils/recent-projects"
import type { ProjectSnapshot } from "../types"

function makeSnapshot(overrides: Partial<ProjectSnapshot> & { sourceId: string }): ProjectSnapshot {
  return {
    label: overrides.sourceId,
    projectRoot: `/tmp/${overrides.sourceId}`,
    mainSession: {
      agent: "build",
      currentModel: null,
      currentTool: "-",
      lastUpdated: "just now",
      sessionLabel: "s",
      sessionId: null,
      status: "idle",
    },
    sessions: [],
    aggregateStatus: "idle",
    planProgress: {
      name: "",
      completed: 0,
      total: 0,
      path: "",
      status: "idle",
      steps: [],
      planStale: false,
      planComplete: false,
    },
    unintiatedPlans: [],
    timeSeries: { windowMs: 0, bucketMs: 60_000, buckets: 0, anchorMs: 0, serverNowMs: 0, series: [] },
    backgroundTasks: [],
    sessionTimeSeries: { windowMs: 0, bucketMs: 60_000, buckets: 0, anchorMs: 0, serverNowMs: 0, sessions: [] },
    lastUpdatedMs: 0,
    ...overrides,
  } as ProjectSnapshot
}

describe("selectRecentProjects", () => {
  it("selects the X most recently active projects", () => {
    const projects = [
      makeSnapshot({ sourceId: "a", lastActivityMs: 100 }),
      makeSnapshot({ sourceId: "b", lastActivityMs: 300 }),
      makeSnapshot({ sourceId: "c", lastActivityMs: 200 }),
    ]
    const result = selectRecentProjects(projects, 2)
    expect(result.map((p) => p.sourceId).sort()).toEqual(["b", "c"])
  })

  it("returns projects in label order, not recency order", () => {
    const projects = [
      makeSnapshot({ sourceId: "z", label: "Zeta", lastActivityMs: 300 }),
      makeSnapshot({ sourceId: "a", label: "Alpha", lastActivityMs: 200 }),
      makeSnapshot({ sourceId: "m", label: "Mid", lastActivityMs: 100 }),
    ]
    const result = selectRecentProjects(projects, 3)
    expect(result.map((p) => p.label)).toEqual(["Alpha", "Mid", "Zeta"])
  })

  it("keeps idle projects without sessions visible when within the limit", () => {
    const projects = [
      makeSnapshot({ sourceId: "active", lastActivityMs: Date.now() }),
      makeSnapshot({ sourceId: "stale", lastActivityMs: 1 }),
    ]
    const result = selectRecentProjects(projects, 2)
    expect(result.map((p) => p.sourceId).sort()).toEqual(["active", "stale"])
  })

  it("falls back to lastUpdatedMs when lastActivityMs is missing", () => {
    const projects = [
      makeSnapshot({ sourceId: "a", lastUpdatedMs: 50 }),
      makeSnapshot({ sourceId: "b", lastUpdatedMs: 500 }),
      makeSnapshot({ sourceId: "c", lastUpdatedMs: 250 }),
    ]
    const result = selectRecentProjects(projects, 2)
    expect(result.map((p) => p.sourceId).sort()).toEqual(["b", "c"])
  })

  it("handles empty project list and invalid limits", () => {
    expect(selectRecentProjects([], 5)).toEqual([])
    const projects = [makeSnapshot({ sourceId: "a", lastActivityMs: 1 })]
    expect(selectRecentProjects(projects, 0).map((p) => p.sourceId)).toEqual(["a"])
    expect(selectRecentProjects(projects, Number.NaN).map((p) => p.sourceId)).toEqual(["a"])
  })
})

describe("compareProjectsByLabel", () => {
  it("sorts alphabetically and breaks ties by sourceId", () => {
    const a = makeSnapshot({ sourceId: "2", label: "Same" })
    const b = makeSnapshot({ sourceId: "1", label: "Same" })
    const c = makeSnapshot({ sourceId: "3", label: "Other" })
    expect([a, b, c].sort(compareProjectsByLabel).map((p) => p.sourceId)).toEqual(["3", "1", "2"])
  })
})
