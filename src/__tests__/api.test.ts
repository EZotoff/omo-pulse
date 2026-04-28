import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DashboardMultiProjectPayload } from "../types"

// ---------------------------------------------------------------------------
// Mock bun:sqlite — needed because transitive imports pull it in
// ---------------------------------------------------------------------------

vi.mock("bun:sqlite", () => ({
  Database: vi.fn(() => ({
    query: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(() => null) })),
    close: vi.fn(),
  })),
}))

// ---------------------------------------------------------------------------
// Mock all modules that createApi depends on
// ---------------------------------------------------------------------------

vi.mock("../ingest/sources-registry", () => ({
  listSources: vi.fn(() => []),
  getDefaultSourceId: vi.fn(() => null),
  getSourceById: vi.fn(() => null),
}))

vi.mock("../server/multi-project", () => ({
  createMultiProjectService: vi.fn(() => ({
    getMultiProjectPayload: vi.fn(async (): Promise<DashboardMultiProjectPayload> => ({
      projects: [],
      serverNowMs: Date.now(),
      pollIntervalMs: 2000,
    })),
  })),
}))

vi.mock("../ingest/session", () => ({
  getStorageRoots: vi.fn(() => ({
    session: "/tmp/session",
    message: "/tmp/message",
    part: "/tmp/part",
  })),
  getMessageDir: vi.fn(() => null),
}))

vi.mock("../ingest/paths", () => ({
  assertAllowedPath: vi.fn(() => "/allowed"),
  realpathSafe: vi.fn((p: string) => p),
  getDataDir: vi.fn(() => "/tmp"),
  getOpenCodeStorageDir: vi.fn(() => "/tmp/storage"),
  getOpenCodeStorageDirFromDataDir: vi.fn(() => "/tmp/storage"),
}))

vi.mock("../ingest/tool-calls", () => ({
  deriveToolCalls: vi.fn(() => ({ toolCalls: [], truncated: false })),
  MAX_TOOL_CALL_MESSAGES: 200,
  MAX_TOOL_CALLS: 300,
}))

vi.mock("../ingest/sqlite-derive", () => ({
  deriveToolCallsSqlite: vi.fn(() => ({ ok: false, reason: "db_unopenable" })),
}))

vi.mock("../server/control-plane/plan-b", () => ({
  EXECUTION_PHASE_ORDER: [
    "select_executable",
    "preflight",
    "dispatch",
    "monitor",
    "reconcile",
  ],
  createPlanBLedgerSqlite: vi.fn(() => ({ kind: "mock-ledger-db" })),
  listExecutions: vi.fn(() => []),
  getExecution: vi.fn(() => null),
  getTier: vi.fn(() => "shadow"),
  requestTierChange: vi.fn(() => "shadow"),
  approveTierChange: vi.fn(() => "tier1"),
  emergencyDowngrade: vi.fn(() => "shadow"),
  observeAndRunPlanBControlLoop: vi.fn(async () => ({
    sourceId: "proj-1",
    tier: "shadow",
    normalized: {},
    driftReport: null,
    decisions: [],
  })),
}))

// ---------------------------------------------------------------------------
// Import AFTER mocking
// ---------------------------------------------------------------------------
import { createApi } from "../server/api"
import { createMultiProjectService } from "../server/multi-project"
import {
  approveTierChange,
  createPlanBLedgerSqlite,
  emergencyDowngrade,
  EXECUTION_PHASE_ORDER,
  getExecution,
  getTier,
  listExecutions,
  observeAndRunPlanBControlLoop,
  requestTierChange,
} from "../server/control-plane/plan-b"
import type { ProjectSnapshot } from "../types"

const mockedCreateMultiProjectService = createMultiProjectService as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedCreatePlanBLedgerSqlite =
  createPlanBLedgerSqlite as unknown as {
    mockReturnValue: (value: unknown) => void
  }

const mockedListExecutions = listExecutions as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedGetExecution = getExecution as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedGetTier = getTier as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedRequestTierChange = requestTierChange as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedApproveTierChange = approveTierChange as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedEmergencyDowngrade = emergencyDowngrade as unknown as {
  mockReturnValue: (value: unknown) => void
}

const mockedObserveAndRunPlanBControlLoop =
  observeAndRunPlanBControlLoop as unknown as {
    mockResolvedValue: (value: unknown) => void
  }

// ---------------------------------------------------------------------------
// Helper: build a minimal ProjectSnapshot fixture
// ---------------------------------------------------------------------------
function makeProjectSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    sourceId: "proj-1",
    label: "Test Project",
    projectRoot: "/home/user/project",
    mainSession: {
      agent: "build",
      currentModel: "gpt-4",
      currentTool: "bash",
      lastUpdated: "2025-01-01T00:00:00Z",
      sessionLabel: "session-1",
      sessionId: "ses_abc",
      status: "idle",
    },
    planProgress: {
      name: "plan-1",
      completed: 3,
      total: 10,
      path: "/plan.md",
      status: "in progress",
      steps: [],
      planStale: false,
      planComplete: false,
    },
    timeSeries: {
      windowMs: 300000,
      bucketMs: 2000,
      buckets: 150,
      anchorMs: 1000000,
      serverNowMs: 1000000,
      series: [],
    },
    sessions: [],
    aggregateStatus: "idle" as const,
    unintiatedPlans: [],
    backgroundTasks: [],
    sessionTimeSeries: {
      windowMs: 300000,
      bucketMs: 2000,
      buckets: 150,
      anchorMs: 1000000,
      serverNowMs: 1000000,
      sessions: [],
    },
    lastUpdatedMs: Date.now(),
    ...overrides,
  }
}

describe("API routes", () => {
  let app: ReturnType<typeof createApi>

  beforeEach(() => {
    vi.clearAllMocks()

    const mockPlanBLedgerDb = { kind: "mock-ledger-db" }
    mockedCreatePlanBLedgerSqlite.mockReturnValue(mockPlanBLedgerDb)
    mockedListExecutions.mockReturnValue([])
    mockedGetExecution.mockReturnValue(null)
    mockedGetTier.mockReturnValue("shadow")
    mockedRequestTierChange.mockReturnValue("shadow")
    mockedApproveTierChange.mockReturnValue("tier1")
    mockedEmergencyDowngrade.mockReturnValue("shadow")
    mockedObserveAndRunPlanBControlLoop.mockResolvedValue({
      sourceId: "proj-1",
      tier: "shadow",
      normalized: {},
      driftReport: null,
      decisions: [],
    })

    const mockService = {
      getMultiProjectPayload: vi.fn(async (): Promise<DashboardMultiProjectPayload> => ({
        projects: [makeProjectSnapshot()],
        serverNowMs: Date.now(),
        pollIntervalMs: 2000,
      })),
    }
    mockedCreateMultiProjectService.mockReturnValue(mockService)

    app = createApi({
      storageRoot: "/tmp/test-storage",
      storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
      version: "1.0.0-test",
    })
  })

  // -------------------------------------------------------------------------
  // GET /health
  // -------------------------------------------------------------------------
  it("GET /health returns 200 with ok and version", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, version: "1.0.0-test" })
  })

  // -------------------------------------------------------------------------
  // GET /sources
  // -------------------------------------------------------------------------
  it("GET /sources returns 200 with sources list", async () => {
    const { listSources, getDefaultSourceId } = await import("../ingest/sources-registry")
    ;(listSources as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue([
      { id: "src-1", label: "My Project", updatedAt: 1000 },
    ])
    ;(getDefaultSourceId as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue("src-1")

    const res = await app.request("/sources")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.sources).toHaveLength(1)
    expect(body.defaultSourceId).toBe("src-1")
  })

  // -------------------------------------------------------------------------
  // GET /projects
  // -------------------------------------------------------------------------
  it("GET /projects returns multi-project payload directly", async () => {
    const res = await app.request("/projects")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects).toBeDefined()
    expect(Array.isArray(body.projects)).toBe(true)
    expect(body.pollIntervalMs).toBe(2000)
  })

  // -------------------------------------------------------------------------
  // GET /projects/:sourceId — found
  // -------------------------------------------------------------------------
  it("GET /projects/:sourceId returns single project when found", async () => {
    const res = await app.request("/projects/proj-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sourceId).toBe("proj-1")
    expect(body.label).toBe("Test Project")
  })

  // -------------------------------------------------------------------------
  // GET /projects/:sourceId — not found
  // -------------------------------------------------------------------------
  it("GET /projects/:sourceId returns 404 for unknown source", async () => {
    const res = await app.request("/projects/unknown-id")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe("Source not found")
  })

  // -------------------------------------------------------------------------
  // GET /tool-calls/:sessionId — invalid session ID
  // -------------------------------------------------------------------------
  it("GET /tool-calls with invalid sessionId returns 400", async () => {
    // Session ID with special chars that fail SESSION_ID_PATTERN
    const res = await app.request("/tool-calls/ses!@%23$%25")
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Cache-Control header
  // -------------------------------------------------------------------------
  it("responses include Cache-Control: no-cache header", async () => {
    const res = await app.request("/health")
    expect(res.headers.get("Cache-Control")).toBe("no-cache")
  })

  // -------------------------------------------------------------------------
  // GET /control-plane/executions — empty
  // -------------------------------------------------------------------------
  it("GET /control-plane/executions returns empty executions array", async () => {
    const res = await app.request("/control-plane/executions")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, executions: [] })
  })

  // -------------------------------------------------------------------------
  // GET /control-plane/executions — with data
  // -------------------------------------------------------------------------
  it("GET /control-plane/executions returns mocked executions", async () => {
    mockedListExecutions.mockReturnValue([
      {
        id: "exec-1",
        decisionId: "dec-1",
        state: "dispatched",
        phase: "dispatch",
        idempotencyKey: "idem-1",
        error: null,
        createdAt: "2026-04-24T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:01.000Z",
      },
    ])

    const res = await app.request("/control-plane/executions")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.executions).toHaveLength(1)
    expect(body.executions[0].id).toBe("exec-1")
  })

  // -------------------------------------------------------------------------
  // GET /control-plane/executions/:id — not found
  // -------------------------------------------------------------------------
  it("GET /control-plane/executions/:id returns 404 when execution is missing", async () => {
    const res = await app.request("/control-plane/executions/not-found")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      error: "Execution not found",
      executionId: "not-found",
    })
  })

  // -------------------------------------------------------------------------
  // GET /control-plane/executions/:id — found
  // -------------------------------------------------------------------------
  it("GET /control-plane/executions/:id returns execution with phases", async () => {
    mockedGetExecution.mockReturnValue({
      id: "exec-1",
      decisionId: "dec-1",
      state: "succeeded",
      phase: "reconcile",
      idempotencyKey: "idem-1",
      error: null,
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:02.000Z",
    })

    const res = await app.request("/control-plane/executions/exec-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.execution.id).toBe("exec-1")
    expect(body.phases).toEqual(EXECUTION_PHASE_ORDER)
  })

  // -------------------------------------------------------------------------
  // GET /control-plane/tier
  // -------------------------------------------------------------------------
  it("GET /control-plane/tier returns current tier", async () => {
    mockedGetTier.mockReturnValue("shadow")

    const res = await app.request("/control-plane/tier")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, tier: "shadow" })
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/tier — invalid tier
  // -------------------------------------------------------------------------
  it("POST /control-plane/tier returns 400 for invalid tier", async () => {
    const res = await app.request("/control-plane/tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "tier2" }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      error: 'tier must be "shadow" or "tier1"',
    })
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/tier — operator approval required for tier1
  // -------------------------------------------------------------------------
  it("POST /control-plane/tier requires approved:true for tier1", async () => {
    const res = await app.request("/control-plane/tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "tier1" }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      error: "approved: true is required for tier1 promotion",
    })
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/tier — promote to tier1
  // -------------------------------------------------------------------------
  it("POST /control-plane/tier promotes to tier1 when approved", async () => {
    mockedGetTier.mockReturnValue("shadow")
    mockedApproveTierChange.mockReturnValue("tier1")

    const res = await app.request("/control-plane/tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "tier1", approved: true, reason: "operator" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, tier: "tier1" })
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/execute — missing target
  // -------------------------------------------------------------------------
  it("POST /control-plane/execute returns 400 when target is missing", async () => {
    const res = await app.request("/control-plane/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "proj-1", decisionType: "mark_plan_stale" }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain("sourceId, decisionType, and targetId")
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/execute — invalid decisionType yields advisory_only
  // -------------------------------------------------------------------------
  it("POST /control-plane/execute returns advisory_only when requested decision target is absent", async () => {
    mockedGetTier.mockReturnValue("tier1")
    mockedObserveAndRunPlanBControlLoop.mockResolvedValue({
      sourceId: "proj-1",
      tier: "tier1",
      normalized: { sourceId: "proj-1" },
      driftReport: null,
      decisions: [],
    })

    const res = await app.request("/control-plane/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: "proj-1",
        decisionType: "unknown_decision",
        targetId: "target-1",
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.executionId).toBeNull()
    expect(body.status).toBe("advisory_only")
    expect(body.result.action).toBe("advisory_only")
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/execute — source missing
  // -------------------------------------------------------------------------
  it("POST /control-plane/execute returns 404 when source is not found", async () => {
    mockedObserveAndRunPlanBControlLoop.mockResolvedValue({
      sourceId: "missing-source",
      tier: "shadow",
      normalized: null,
      driftReport: null,
      decisions: [],
    })

    const res = await app.request("/control-plane/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: "missing-source",
        decisionType: "mark_plan_stale",
        targetId: "proj-1",
      }),
    })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      error: "Source not found",
      sourceId: "missing-source",
    })
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/execute — dispatched happy path
  // -------------------------------------------------------------------------
  it("POST /control-plane/execute returns executionId for dispatched decision", async () => {
    mockedGetTier.mockReturnValue("tier1")
    mockedObserveAndRunPlanBControlLoop.mockResolvedValue({
      sourceId: "proj-1",
      tier: "tier1",
      normalized: { sourceId: "proj-1" },
      driftReport: null,
      decisions: [
        {
          decisionId: "dec-1",
          decisionType: "mark_plan_stale",
          targetId: "proj-1",
          primitive: "update_ledger_status",
          preflightResult: { approved: true },
          action: "dispatched",
          reason: null,
          executionId: "exec-1",
          outcomeMatched: true,
        },
      ],
    })

    const res = await app.request("/control-plane/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: "proj-1",
        decisionType: "mark_plan_stale",
        targetId: "proj-1",
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.executionId).toBe("exec-1")
    expect(body.status).toBe("dispatched")
    expect(body.result.decisionType).toBe("mark_plan_stale")
  })

  // -------------------------------------------------------------------------
  // POST /control-plane/execute — preflight failure advisory_only
  // -------------------------------------------------------------------------
  it("POST /control-plane/execute returns advisory_only when preflight denies execution", async () => {
    mockedGetTier.mockReturnValue("tier1")
    mockedObserveAndRunPlanBControlLoop.mockResolvedValue({
      sourceId: "proj-1",
      tier: "tier1",
      normalized: { sourceId: "proj-1" },
      driftReport: null,
      decisions: [
        {
          decisionId: "dec-2",
          decisionType: "mark_plan_stale",
          targetId: "proj-1",
          primitive: "update_ledger_status",
          preflightResult: {
            approved: false,
            reason: "Observation too stale",
          },
          action: "advisory_only",
          reason: "Observation too stale",
          executionId: null,
          outcomeMatched: null,
        },
      ],
    })

    const res = await app.request("/control-plane/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: "proj-1",
        decisionType: "mark_plan_stale",
        targetId: "proj-1",
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.executionId).toBeNull()
    expect(body.status).toBe("advisory_only")
    expect(body.result.reason).toBe("Observation too stale")
  })
})
