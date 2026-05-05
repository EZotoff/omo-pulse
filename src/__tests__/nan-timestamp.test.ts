import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

vi.mock("../ingest/boulder", () => ({
  readBoulderState: vi.fn(() => null),
  readPlanProgress: vi.fn(() => ({ total: 0, completed: 0, isComplete: false, missing: true, planStale: false, planComplete: false })),
  readPlanSteps: vi.fn(() => ({ missing: true, steps: [] })),
  scanUninitiatedPlans: vi.fn(() => []),
}))

vi.mock("../ingest/background-tasks", () => ({
  deriveBackgroundTasks: vi.fn(() => []),
  deriveBackgroundTasksSqlite: vi.fn(() => ({ ok: true, value: [] })),
}))

vi.mock("../ingest/timeseries", () => ({
  deriveTimeSeriesActivity: vi.fn(() => ({ windowMs: 300000, bucketMs: 2000, buckets: 150, anchorMs: 1000000, serverNowMs: 1000000, series: [] })),
}))

vi.mock("../ingest/tool-calls", () => ({
  deriveToolCalls: vi.fn(() => ({ toolCalls: [] })),
}))

vi.mock("../ingest/token-usage", () => ({
  deriveTokenUsage: vi.fn(() => undefined),
}))

vi.mock("../ingest/session", () => ({
  getMainSessionView: vi.fn(() => ({
    agent: "build",
    currentTool: null,
    currentModel: "gpt-4",
    lastUpdated: Number.NaN,
    sessionLabel: "session-1",
    status: "idle",
  })),
  getStorageRoots: vi.fn(() => ({ session: "/tmp/session", message: "/tmp/message", part: "/tmp/part" })),
  pickActiveSessionId: vi.fn(() => "ses_abc"),
  readMainSessionMetas: vi.fn(() => [{ id: "ses_abc", title: "session-1", time: { created: 1000, updated: 2000 } }]),
}))

import { buildDashboardPayload } from "../server/dashboard"
import { formatRelativeTime } from "../ui/components/ProjectStrip"

const NOW = 1_000_000_000

describe("timestamp sanitization", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns an em dash for invalid relative timestamps", () => {
    expect(formatRelativeTime(Number.NaN)).toBe("—")
    expect(formatRelativeTime(Number.POSITIVE_INFINITY)).toBe("—")
    expect(formatRelativeTime(0)).toBe("—")
    expect(formatRelativeTime(-1000)).toBe("—")
  })

  it("keeps valid relative timestamps working", () => {
    expect(formatRelativeTime(NOW - 1000)).toBe("1s ago")
    expect(formatRelativeTime(NOW - 60_000)).toBe("1m ago")
  })

  it("emits an empty lastUpdated label when the session timestamp is invalid", () => {
    const payload = buildDashboardPayload({
      projectRoot: "/tmp/project",
      storage: { session: "/tmp/session", message: "/tmp/message", part: "/tmp/part" },
      nowMs: NOW,
    })

    expect(payload.mainSession.lastUpdatedLabel).toBe("")
  })
})
