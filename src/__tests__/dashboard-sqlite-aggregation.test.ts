import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockReadBoulderState,
  mockReadPlanProgress,
  mockReadPlanSteps,
  mockScanUnintiatedPlans,
  mockPickActiveSessionIdSqlite,
  mockGetMainSessionViewSqlite,
  mockDeriveBackgroundTasksSqlite,
  mockDeriveTimeSeriesActivitySqlite,
  mockDeriveTokenUsageSqlite,
  mockDeriveTodosSqlite,
  mockDeriveToolCallsSqlite,
  mockReadMainSessionMetasSqlite,
} = vi.hoisted(() => ({
  mockReadBoulderState: vi.fn(),
  mockReadPlanProgress: vi.fn(),
  mockReadPlanSteps: vi.fn(),
  mockScanUnintiatedPlans: vi.fn(),
  mockPickActiveSessionIdSqlite: vi.fn(),
  mockGetMainSessionViewSqlite: vi.fn(),
  mockDeriveBackgroundTasksSqlite: vi.fn(),
  mockDeriveTimeSeriesActivitySqlite: vi.fn(),
  mockDeriveTokenUsageSqlite: vi.fn(),
  mockDeriveTodosSqlite: vi.fn(),
  mockDeriveToolCallsSqlite: vi.fn(),
  mockReadMainSessionMetasSqlite: vi.fn(),
}))

vi.mock("../ingest/boulder", () => ({
  readBoulderState: mockReadBoulderState,
  readPlanProgress: mockReadPlanProgress,
  readPlanSteps: mockReadPlanSteps,
  scanUnintiatedPlans: mockScanUnintiatedPlans,
}))

vi.mock("../ingest/sqlite-derive", () => ({
  pickActiveSessionIdSqlite: mockPickActiveSessionIdSqlite,
  getMainSessionViewSqlite: mockGetMainSessionViewSqlite,
  deriveBackgroundTasksSqlite: mockDeriveBackgroundTasksSqlite,
  deriveTimeSeriesActivitySqlite: mockDeriveTimeSeriesActivitySqlite,
  deriveTokenUsageSqlite: mockDeriveTokenUsageSqlite,
  deriveTodosSqlite: mockDeriveTodosSqlite,
  deriveToolCallsSqlite: mockDeriveToolCallsSqlite,
}))

vi.mock("../ingest/storage-backend", () => ({
  readMainSessionMetasSqlite: mockReadMainSessionMetasSqlite,
}))

import { buildDashboardPayload } from "../server/dashboard"

describe("buildDashboardPayload SQLite uninitiated plans", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockReadBoulderState.mockReturnValue(null)
    mockReadPlanProgress.mockReturnValue({
      total: 0,
      completed: 0,
      isComplete: false,
      missing: true,
      planStale: false,
      planComplete: false,
    })
    mockReadPlanSteps.mockReturnValue({ missing: true, steps: [] })
    mockScanUnintiatedPlans.mockReturnValue([
      {
        name: "new-feature",
        path: ".sisyphus/plans/new-feature.md",
        total: 2,
        steps: [
          { checked: false, text: "Draft API" },
          { checked: false, text: "Add tests" },
        ],
      },
    ])

    mockPickActiveSessionIdSqlite.mockReturnValue({ ok: true, value: "ses_abc" })
    mockReadMainSessionMetasSqlite.mockReturnValue({ ok: true, rows: [{ id: "ses_abc", title: "session-1", time: { created: 1000, updated: 2000 } }] })
    mockGetMainSessionViewSqlite.mockReturnValue({ ok: true, value: {
      agent: "atlas",
      currentTool: null,
      currentModel: "gpt-4",
      lastUpdated: 2000,
      sessionLabel: "session-1",
      status: "idle",
    } })
    mockDeriveBackgroundTasksSqlite.mockReturnValue({ ok: true, value: [] })
    mockDeriveTimeSeriesActivitySqlite.mockReturnValue({ ok: true, value: {
      windowMs: 300000,
      bucketMs: 2000,
      buckets: 150,
      anchorMs: 1000000,
      serverNowMs: 1000000,
      series: [],
    } })
    mockDeriveTokenUsageSqlite.mockReturnValue({ ok: true, value: undefined })
    mockDeriveTodosSqlite.mockReturnValue({ ok: true, value: [] })
    mockDeriveToolCallsSqlite.mockReturnValue({ ok: true, value: { toolCalls: [] } })
  })

  it("includes uninitiated plans in the sqlite payload", () => {
    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: { session: "/tmp/session", message: "/tmp/message", part: "/tmp/part" },
      storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
      nowMs: 1_000_000,
    })

    expect(payload.unintiatedPlans).toEqual([
      {
        name: "new-feature",
        path: ".sisyphus/plans/new-feature.md",
        total: 2,
        steps: [
          { checked: false, text: "Draft API" },
          { checked: false, text: "Add tests" },
        ],
      },
    ])
  })
})
