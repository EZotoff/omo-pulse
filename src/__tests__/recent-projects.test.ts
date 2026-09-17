import { describe, expect, it } from "vitest"
import { compareProjectsByLabel, DYNAMIC_ACTIVITY_WINDOW_MS, selectRecentProjects } from "../ui/utils/recent-projects"
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
  const NOW = 1_800_000_000_000
  const daysAgo = (d: number): number => NOW - d * 24 * 60 * 60_000

  it("selects the X most recently active projects", () => {
    const projects = [
      makeSnapshot({ sourceId: "a", lastActivityMs: daysAgo(3) }),
      makeSnapshot({ sourceId: "b", lastActivityMs: daysAgo(1) }),
      makeSnapshot({ sourceId: "c", lastActivityMs: daysAgo(2) }),
    ]
    const result = selectRecentProjects(projects, 2, NOW)
    expect(result.map((p) => p.sourceId).sort()).toEqual(["b", "c"])
  })

  it("excludes projects inactive longer than the dynamic window, even when pool is smaller than the limit", () => {
    const projects = [
      makeSnapshot({ sourceId: "fresh", lastActivityMs: daysAgo(1) }),
      makeSnapshot({ sourceId: "game-life", lastActivityMs: daysAgo(60) }),
    ]
    const result = selectRecentProjects(projects, 6, NOW)
    expect(result.map((p) => p.sourceId)).toEqual(["fresh"])
  })

  it("returns projects in label order, not recency order", () => {
    const projects = [
      makeSnapshot({ sourceId: "z", label: "Zeta", lastActivityMs: daysAgo(1) }),
      makeSnapshot({ sourceId: "a", label: "Alpha", lastActivityMs: daysAgo(2) }),
      makeSnapshot({ sourceId: "m", label: "Mid", lastActivityMs: daysAgo(3) }),
    ]
    const result = selectRecentProjects(projects, 3, NOW)
    expect(result.map((p) => p.label)).toEqual(["Alpha", "Mid", "Zeta"])
  })

  it("keeps idle projects without sessions visible when within the limit", () => {
    const projects = [
      makeSnapshot({ sourceId: "active", lastActivityMs: NOW }),
      makeSnapshot({ sourceId: "stale", lastActivityMs: NOW - DYNAMIC_ACTIVITY_WINDOW_MS + 60_000 }),
    ]
    const result = selectRecentProjects(projects, 2, NOW)
    expect(result.map((p) => p.sourceId).sort()).toEqual(["active", "stale"])
  })

  it("falls back to lastUpdatedMs when lastActivityMs is missing and sessions exist", () => {
    const withSessions = (sourceId: string, updated: number): ProjectSnapshot =>
      makeSnapshot({
        sourceId,
        lastUpdatedMs: updated,
        sessions: [
          { sessionId: sourceId, sessionLabel: "s", agent: "build", status: "idle", lastUpdated: "x", currentTool: "-", currentModel: null, tokenUsage: null },
        ],
      })
    const projects = [
      withSessions("a", daysAgo(5)),
      withSessions("b", daysAgo(1)),
      withSessions("c", daysAgo(3)),
    ]
    const result = selectRecentProjects(projects, 2, NOW)
    expect(result.map((p) => p.sourceId).sort()).toEqual(["b", "c"])
  })

  it("handles empty project list and invalid limits", () => {
    expect(selectRecentProjects([], 5, NOW)).toEqual([])
    const projects = [makeSnapshot({ sourceId: "a", lastActivityMs: daysAgo(1) })]
    expect(selectRecentProjects(projects, 0, NOW).map((p) => p.sourceId)).toEqual(["a"])
    expect(selectRecentProjects(projects, Number.NaN, NOW).map((p) => p.sourceId)).toEqual(["a"])
  })

  it("excludes registered-but-empty projects whose lastUpdatedMs defaults to now", () => {
    const projects = [
      makeSnapshot({ sourceId: "game-life", label: "Game Life", lastActivityMs: undefined, lastUpdatedMs: NOW, sessions: [] }),
      makeSnapshot({ sourceId: "fresh", lastActivityMs: daysAgo(1) }),
    ]
    const result = selectRecentProjects(projects, 6, NOW)
    expect(result.map((p) => p.sourceId)).toEqual(["fresh"])
  })

  it("still trusts lastUpdatedMs when the snapshot carries sessions", () => {
    const projects = [
      makeSnapshot({ sourceId: "with-sessions", lastActivityMs: undefined, lastUpdatedMs: daysAgo(1), sessions: [
        { sessionId: "s1", sessionLabel: "s", agent: "build", status: "idle", lastUpdated: "1h ago", currentTool: "-", currentModel: null, tokenUsage: null },
      ] }),
    ]
    const result = selectRecentProjects(projects, 6, NOW)
    expect(result.map((p) => p.sourceId)).toEqual(["with-sessions"])
  })

  it("returns nothing when every project is outside the dynamic window", () => {
    const projects = [makeSnapshot({ sourceId: "a", lastActivityMs: daysAgo(90) })]
    expect(selectRecentProjects(projects, 6, NOW)).toEqual([])
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
