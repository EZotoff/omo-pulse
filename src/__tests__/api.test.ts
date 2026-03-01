import { describe, it, expect, vi, beforeEach } from "vitest"
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
    getMultiProjectPayload: vi.fn((): DashboardMultiProjectPayload => ({
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

// ---------------------------------------------------------------------------
// Import AFTER mocking
// ---------------------------------------------------------------------------
import { createApi } from "../server/api"
import { createMultiProjectService } from "../server/multi-project"
import type { ProjectSnapshot } from "../types"

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

    const mockService = {
      getMultiProjectPayload: vi.fn((): DashboardMultiProjectPayload => ({
        projects: [makeProjectSnapshot()],
        serverNowMs: Date.now(),
        pollIntervalMs: 2000,
      })),
    }
    vi.mocked(createMultiProjectService).mockReturnValue(mockService)

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
    vi.mocked(listSources).mockReturnValue([
      { id: "src-1", label: "My Project", updatedAt: 1000 },
    ])
    vi.mocked(getDefaultSourceId).mockReturnValue("src-1")

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
})
