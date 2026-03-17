import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockReadBoulderState,
  mockReadBoulderHistory,
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
  mockReadBoulderHistory: vi.fn(),
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
  readBoulderHistory: mockReadBoulderHistory,
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
    mockReadBoulderHistory.mockReturnValue([])
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
    expect(payload.planHistory).toBeUndefined()
  })

  it("includes lifecycle history and completed fields in the sqlite payload", () => {
    mockReadBoulderState.mockReturnValue({
      active_plan: "/repo/.sisyphus/plans/active-plan.md",
      started_at: "2025-01-01T00:00:00Z",
      session_ids: ["ses_abc"],
      plan_name: "active-plan",
      status: "completed",
      completed_at: "2025-01-01T01:00:00Z",
    })
    mockReadPlanProgress.mockReturnValue({
      total: 3,
      completed: 3,
      isComplete: true,
      missing: false,
      planStale: false,
      planComplete: true,
    })
    mockReadPlanSteps.mockReturnValue({
      missing: false,
      steps: [
        { checked: true, text: "Wire builders" },
        { checked: true, text: "Map snapshot fields" },
        { checked: true, text: "Add tests" },
      ],
    })
    mockReadBoulderHistory.mockReturnValue([
      {
        plan_name: "active-plan",
        plan_path: "/repo/.sisyphus/plans/active-plan.md",
        archived_path: "/repo/.sisyphus/plans/_archive/active-plan.md",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-01T01:00:00Z",
        session_ids: ["ses_abc"],
        total_tasks: 3,
        completed_tasks: 3,
      },
    ])

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: { session: "/tmp/session", message: "/tmp/message", part: "/tmp/part" },
      storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
      nowMs: 1_000_000,
    })

    expect(payload.planProgress.boulderStatus).toBe("completed")
    expect(payload.planProgress.completedAt).toBe("2025-01-01T01:00:00Z")
    expect(payload.planHistory).toEqual({
      entries: [
        {
          plan_name: "active-plan",
          plan_path: "/repo/.sisyphus/plans/active-plan.md",
          archived_path: "/repo/.sisyphus/plans/_archive/active-plan.md",
          started_at: "2025-01-01T00:00:00Z",
          completed_at: "2025-01-01T01:00:00Z",
          session_ids: ["ses_abc"],
          total_tasks: 3,
          completed_tasks: 3,
        },
      ],
      totalCompleted: 1,
    })
  })
})
