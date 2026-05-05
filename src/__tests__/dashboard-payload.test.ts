import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  createMockDb,
  MockDatabase,
  mockReadBoulderState,
  mockReadBoulderHistory,
  mockReadPlanProgress,
  mockReadPlanSteps,
  mockScanUninitiatedPlans,
  mockPickActiveSessionId,
  mockReadMainSessionMetas,
  mockGetMainSessionView,
  mockDeriveBackgroundTasks,
  mockDeriveTimeSeriesActivity,
  mockDeriveToolCalls,
  mockDeriveTokenUsage,
  mockPickActiveSessionIdSqlite,
  mockReadMainSessionMetasSqlite,
  mockGetMainSessionViewSqlite,
  mockDeriveBackgroundTasksSqlite,
  mockDeriveTimeSeriesActivitySqlite,
  mockDeriveToolCallsSqlite,
  mockDeriveTokenUsageSqlite,
  mockDeriveTodosSqlite,
} = vi.hoisted(() => {
  type QueryRows = Array<Record<string, unknown>>

  type MockDbConfig = {
    rowsBySqlNeedle?: Record<string, QueryRows>
    throwOnQuery?: boolean
    throwOnPrepare?: boolean
  }

  function createMockDb(config: MockDbConfig = {}) {
    const resolveRows = (sql: string): QueryRows => {
      const map = config.rowsBySqlNeedle ?? {}
      for (const [needle, rows] of Object.entries(map)) {
        if (sql.includes(needle)) return rows
      }
      return []
    }

    return {
      query: vi.fn((sql: string) => ({
        all: (..._params: unknown[]) => {
          if (config.throwOnQuery) throw new Error("database is locked")
          return resolveRows(sql)
        },
        get: (..._params: unknown[]) => {
          const rows = resolveRows(sql)
          return rows[0] ?? null
        },
      })),
      prepare: vi.fn((sql: string) => ({
        all: (..._params: unknown[]) => {
          if (config.throwOnPrepare) throw new Error("database is locked")
          return resolveRows(sql)
        },
        get: (..._params: unknown[]) => {
          const rows = resolveRows(sql)
          return rows[0] ?? null
        },
      })),
      close: vi.fn(),
    }
  }

  return {
    createMockDb,
    MockDatabase: vi.fn(() => createMockDb()),
    mockReadBoulderState: vi.fn(),
    mockReadBoulderHistory: vi.fn(),
    mockReadPlanProgress: vi.fn(),
    mockReadPlanSteps: vi.fn(),
    mockScanUninitiatedPlans: vi.fn(),
    mockPickActiveSessionId: vi.fn(),
    mockReadMainSessionMetas: vi.fn(),
    mockGetMainSessionView: vi.fn(),
    mockDeriveBackgroundTasks: vi.fn(),
    mockDeriveTimeSeriesActivity: vi.fn(),
    mockDeriveToolCalls: vi.fn(),
    mockDeriveTokenUsage: vi.fn(),
    mockPickActiveSessionIdSqlite: vi.fn(),
    mockReadMainSessionMetasSqlite: vi.fn(),
    mockGetMainSessionViewSqlite: vi.fn(),
    mockDeriveBackgroundTasksSqlite: vi.fn(),
    mockDeriveTimeSeriesActivitySqlite: vi.fn(),
    mockDeriveToolCallsSqlite: vi.fn(),
    mockDeriveTokenUsageSqlite: vi.fn(),
    mockDeriveTodosSqlite: vi.fn(),
  }
})

vi.mock("bun:sqlite", () => ({
  Database: MockDatabase,
}))

vi.mock("../ingest/boulder", () => ({
  readBoulderState: mockReadBoulderState,
  readBoulderHistory: mockReadBoulderHistory,
  readPlanProgress: mockReadPlanProgress,
  readPlanSteps: mockReadPlanSteps,
  scanUninitiatedPlans: mockScanUninitiatedPlans,
}))

vi.mock("../ingest/session", () => ({
  getStorageRoots: vi.fn(() => ({ session: "/tmp/session", message: "/tmp/message", part: "/tmp/part" })),
  pickActiveSessionId: mockPickActiveSessionId,
  readMainSessionMetas: mockReadMainSessionMetas,
  getMainSessionView: mockGetMainSessionView,
}))

vi.mock("../ingest/background-tasks", () => ({
  deriveBackgroundTasks: mockDeriveBackgroundTasks,
}))

vi.mock("../ingest/timeseries", () => ({
  deriveTimeSeriesActivity: mockDeriveTimeSeriesActivity,
}))

vi.mock("../ingest/tool-calls", () => ({
  deriveToolCalls: mockDeriveToolCalls,
}))

vi.mock("../ingest/token-usage", () => ({
  deriveTokenUsage: mockDeriveTokenUsage,
}))

vi.mock("../ingest/storage-backend", () => ({
  readMainSessionMetasSqlite: mockReadMainSessionMetasSqlite,
}))

vi.mock("../ingest/sqlite-derive", () => ({
  pickActiveSessionIdSqlite: mockPickActiveSessionIdSqlite,
  getMainSessionViewSqlite: mockGetMainSessionViewSqlite,
  deriveBackgroundTasksSqlite: mockDeriveBackgroundTasksSqlite,
  deriveTimeSeriesActivitySqlite: mockDeriveTimeSeriesActivitySqlite,
  deriveToolCallsSqlite: mockDeriveToolCallsSqlite,
  deriveTokenUsageSqlite: mockDeriveTokenUsageSqlite,
  deriveTodosSqlite: mockDeriveTodosSqlite,
}))

import { buildDashboardPayload } from "../server/dashboard"

const NOW_MS = Date.parse("2026-01-01T12:00:00.000Z")

const BASE_STORAGE = {
  session: "/tmp/session",
  message: "/tmp/message",
  part: "/tmp/part",
}

const SQLITE_BACKEND = {
  kind: "sqlite" as const,
  dataDir: "/tmp",
  sqlitePath: "/tmp/test.db",
}

const FILES_BACKEND = {
  kind: "files" as const,
  dataDir: "/tmp",
  storageRoot: "/tmp/storage",
}

const BASE_TIME_SERIES = {
  windowMs: 300_000,
  bucketMs: 2_000,
  buckets: 150,
  anchorMs: NOW_MS,
  serverNowMs: NOW_MS,
  series: [],
}

function isoNoMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
}

describe("buildDashboardPayload characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    MockDatabase.mockImplementation(() => createMockDb())

    mockReadBoulderState.mockReturnValue(null)
    mockReadBoulderHistory.mockReturnValue([])
    mockReadPlanProgress.mockReturnValue({
      total: 0,
      completed: 0,
      isComplete: false,
      missing: true,
      planStale: false,
      planComplete: false,
    })
    mockReadPlanSteps.mockReturnValue({ missing: true, steps: [] })
    mockScanUninitiatedPlans.mockReturnValue([])

    mockPickActiveSessionId.mockReturnValue(null)
    mockReadMainSessionMetas.mockReturnValue([])
    mockGetMainSessionView.mockReturnValue({
      agent: "unknown",
      currentTool: null,
      currentModel: null,
      lastUpdated: null,
      sessionLabel: "(no session)",
      status: "unknown",
    })
    mockDeriveBackgroundTasks.mockReturnValue([])
    mockDeriveTimeSeriesActivity.mockReturnValue(BASE_TIME_SERIES)
    mockDeriveToolCalls.mockReturnValue({ toolCalls: [] })
    mockDeriveTokenUsage.mockReturnValue(undefined)

    mockPickActiveSessionIdSqlite.mockReturnValue({ ok: true, value: null })
    mockReadMainSessionMetasSqlite.mockReturnValue({ ok: true, rows: [] })
    mockGetMainSessionViewSqlite.mockReturnValue({
      ok: true,
      value: {
        agent: "unknown",
        currentTool: null,
        currentModel: null,
        lastUpdated: null,
        sessionLabel: "(no session)",
        status: "unknown",
      },
    })
    mockDeriveBackgroundTasksSqlite.mockReturnValue({ ok: true, value: [] })
    mockDeriveTimeSeriesActivitySqlite.mockReturnValue({ ok: true, value: BASE_TIME_SERIES })
    mockDeriveToolCallsSqlite.mockReturnValue({ ok: true, value: { toolCalls: [] } })
    mockDeriveTokenUsageSqlite.mockReturnValue({ ok: true, value: undefined })
    mockDeriveTodosSqlite.mockReturnValue({ ok: true, value: [] })
  })

  it("builds file-based payload for active session happy path", () => {
    mockPickActiveSessionId.mockReturnValue("ses-file-1")
    mockReadMainSessionMetas.mockReturnValue([
      {
        id: "ses-file-1",
        projectID: "proj-1",
        directory: "/repo",
        time: { created: NOW_MS - 20_000, updated: NOW_MS - 5_000 },
      },
    ])
    mockGetMainSessionView.mockReturnValue({
      agent: "build",
      currentTool: "bash",
      currentModel: "gpt-5",
      lastUpdated: NOW_MS - 5_000,
      sessionLabel: "session-file-1",
      status: "running_tool",
    })
    mockDeriveBackgroundTasks.mockReturnValue([
      {
        id: "bg-1",
        description: "Background worker",
        agent: "build",
        lastModel: null,
        status: "running",
        toolCalls: 2,
        lastTool: "bash",
        timeline: "2026-01-01T11:59:00Z: 1m",
        sessionId: "ses-bg-1",
      },
    ])
    mockDeriveToolCalls.mockReturnValue({ toolCalls: [{ tool: "grep" }] })
    mockDeriveTokenUsage.mockReturnValue({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: BASE_STORAGE,
      storageBackend: FILES_BACKEND,
      nowMs: NOW_MS,
    })

    expect(payload.mainSession.sessionId).toBe("ses-file-1")
    expect(payload.mainSession.statusPill).toBe("running tool")
    expect(payload.mainSession.currentTool).toBe("bash")
    expect(payload.mainSessionTasks).toHaveLength(1)
    expect(payload.mainSessionTasks[0].status).toBe("running")
    expect(payload.mainSessionTasks[0].lastTool).toBe("grep")
    expect(payload.backgroundTasks).toHaveLength(1)
    expect(payload.todos).toEqual([])
    expect(mockPickActiveSessionIdSqlite).not.toHaveBeenCalled()
  })

  it("returns file-based empty state when stale sessions yield no active session", () => {
    mockPickActiveSessionId.mockReturnValue(null)

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: BASE_STORAGE,
      storageBackend: FILES_BACKEND,
      nowMs: NOW_MS,
    })

    expect(payload.mainSession.sessionId).toBeNull()
    expect(payload.mainSession.session).toBe("(no session)")
    expect(payload.mainSession.statusPill).toBe("unknown")
    expect(payload.mainSessionTasks).toEqual([])
    expect(mockReadMainSessionMetas).not.toHaveBeenCalled()
    expect(mockGetMainSessionView).not.toHaveBeenCalled()
  })

  it("maps file-based unknown status to unknown pill and task state", () => {
    mockPickActiveSessionId.mockReturnValue("ses-file-unknown")
    mockReadMainSessionMetas.mockReturnValue([
      {
        id: "ses-file-unknown",
        projectID: "proj-1",
        directory: "/repo",
        time: { created: NOW_MS - 60_000, updated: NOW_MS - 40_000 },
      },
    ])
    mockGetMainSessionView.mockReturnValue({
      agent: "build",
      currentTool: null,
      currentModel: "gpt-5",
      lastUpdated: NOW_MS - 40_000,
      sessionLabel: "session-file-unknown",
      status: "unknown",
    })
    mockDeriveToolCalls.mockReturnValue({ toolCalls: [{ tool: "bash" }] })

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: BASE_STORAGE,
      storageBackend: FILES_BACKEND,
      nowMs: NOW_MS,
    })

    expect(payload.mainSession.statusPill).toBe("unknown")
    expect(payload.mainSession.currentTool).toBe("-")
    expect(payload.mainSessionTasks).toHaveLength(1)
    expect(payload.mainSessionTasks[0].status).toBe("unknown")
  })

  it("builds sqlite payload for active session happy path", () => {
    mockPickActiveSessionIdSqlite.mockReturnValue({ ok: true, value: "ses-sql-1" })
    mockReadMainSessionMetasSqlite.mockReturnValue({
      ok: true,
      rows: [
        {
          id: "ses-sql-1",
          projectID: "proj-1",
          directory: "/repo",
          time: { created: NOW_MS - 20_000, updated: NOW_MS - 4_000 },
        },
      ],
    })
    mockGetMainSessionViewSqlite.mockReturnValue({
      ok: true,
      value: {
        agent: "build",
        currentTool: "edit",
        currentModel: "claude-sonnet",
        lastUpdated: NOW_MS - 4_000,
        sessionLabel: "session-sql-1",
        status: "idle",
      },
    })
    mockDeriveBackgroundTasksSqlite.mockReturnValue({
      ok: true,
      value: [
        {
          id: "bg-sql-1",
          description: "SQLite background",
          agent: "build",
          lastModel: "claude-sonnet",
          status: "running",
          toolCalls: 1,
          lastTool: "read",
          timeline: "2026-01-01T11:59:30Z: 30s",
          sessionId: "ses-bg-sql-1",
        },
      ],
    })
    mockDeriveTimeSeriesActivitySqlite.mockReturnValue({ ok: true, value: BASE_TIME_SERIES })
    mockDeriveToolCallsSqlite.mockReturnValue({ ok: true, value: { toolCalls: [{ tool: "grep" }] } })
    mockDeriveTokenUsageSqlite.mockReturnValue({ ok: true, value: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } })
    mockDeriveTodosSqlite.mockReturnValue({
      ok: true,
      value: [
        { content: "Write tests", status: "in_progress", priority: "high", position: 0 },
        { content: "Run checks", status: "pending", priority: "medium", position: 1 },
      ],
    })

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: BASE_STORAGE,
      storageBackend: SQLITE_BACKEND,
      nowMs: NOW_MS,
    })

    expect(MockDatabase).toHaveBeenCalledWith("/tmp/test.db", { readonly: true })
    expect(payload.mainSession.sessionId).toBe("ses-sql-1")
    expect(payload.mainSession.statusPill).toBe("idle")
    expect(payload.mainSessionTasks).toHaveLength(1)
    expect(payload.mainSessionTasks[0].status).toBe("idle")
    expect(payload.mainSessionTasks[0].timeline).toBe(`${isoNoMs(NOW_MS - 20_000)}: 16s`)
    expect(payload.todos).toHaveLength(2)
    expect(payload.backgroundTasks).toHaveLength(1)
  })

  it("returns sqlite empty state when stale sessions yield no active session", () => {
    mockPickActiveSessionIdSqlite.mockReturnValue({ ok: true, value: null })

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: BASE_STORAGE,
      storageBackend: SQLITE_BACKEND,
      nowMs: NOW_MS,
    })

    expect(payload.mainSession.sessionId).toBeNull()
    expect(payload.mainSession.session).toBe("(no session)")
    expect(payload.mainSession.statusPill).toBe("unknown")
    expect(payload.mainSessionTasks).toEqual([])
    expect(payload.todos).toEqual([])
    expect(mockReadMainSessionMetasSqlite).not.toHaveBeenCalled()
    expect(mockGetMainSessionViewSqlite).not.toHaveBeenCalled()
  })

  it("falls back to file-based payload when sqlite database cannot be opened", () => {
    MockDatabase.mockImplementationOnce(() => {
      throw new Error("unable to open database file")
    })

    mockPickActiveSessionId.mockReturnValue("ses-file-fallback")
    mockReadMainSessionMetas.mockReturnValue([
      {
        id: "ses-file-fallback",
        projectID: "proj-1",
        directory: "/repo",
        time: { created: NOW_MS - 10_000, updated: NOW_MS - 2_000 },
      },
    ])
    mockGetMainSessionView.mockReturnValue({
      agent: "build",
      currentTool: "bash",
      currentModel: "gpt-5",
      lastUpdated: NOW_MS - 2_000,
      sessionLabel: "session-file-fallback",
      status: "busy",
    })
    mockDeriveToolCalls.mockReturnValue({ toolCalls: [{ tool: "bash" }] })

    const payload = buildDashboardPayload({
      projectRoot: "/repo",
      storage: BASE_STORAGE,
      storageBackend: SQLITE_BACKEND,
      nowMs: NOW_MS,
    })

    expect(payload.mainSession.sessionId).toBe("ses-file-fallback")
    expect(payload.mainSession.statusPill).toBe("busy")
    expect(mockPickActiveSessionIdSqlite).not.toHaveBeenCalled()
  })
})
