import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DashboardPayload } from "../server/dashboard"

// ---------------------------------------------------------------------------
// Mock all heavy dependencies that createMultiProjectService imports
// ---------------------------------------------------------------------------

vi.mock("../ingest/sources-registry", () => ({
  listSources: vi.fn(() => []),
  getSourceById: vi.fn(() => null),
}))

vi.mock("../ingest/storage-backend", () => ({
  getLegacyStorageRootForBackend: vi.fn(() => "/tmp/legacy-storage"),
}))

// Mock createDashboardStore to return a controllable DashboardPayload
const mockGetSnapshot = vi.fn()
vi.mock("../server/dashboard", () => ({
  createDashboardStore: vi.fn(() => ({
    getSnapshot: mockGetSnapshot,
  })),
}))

// ---------------------------------------------------------------------------
// Import AFTER mocking
// ---------------------------------------------------------------------------
import { createMultiProjectService } from "../server/multi-project"
import { listSources, getSourceById } from "../ingest/sources-registry"

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDashboardPayload(overrides: Partial<DashboardPayload> = {}): DashboardPayload {
  return {
    mainSession: {
      agent: "build",
      currentModel: "gpt-4",
      currentTool: "bash",
      lastUpdatedLabel: "2025-01-01T00:00:00Z",
      session: "test-session",
      sessionId: "ses_abc",
      statusPill: "idle",
    },
    planProgress: {
      name: "test-plan",
      completed: 5,
      total: 10,
      path: "/plan.md",
      statusPill: "in progress",
      steps: [],
    },
    backgroundTasks: [],
    mainSessionTasks: [],
    timeSeries: {
      windowMs: 300000,
      bucketMs: 2000,
      buckets: 150,
      anchorMs: 1000000,
      serverNowMs: 1000000,
      series: [],
    },
    todos: [],
    raw: null,
    ...overrides,
  }
}

describe("createMultiProjectService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty projects when no sources are registered", () => {
    vi.mocked(listSources).mockReturnValue([])

    const service = createMultiProjectService({
      storageRoot: "/tmp/test",
      storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
    })

    const payload = service.getMultiProjectPayload()
    expect(payload.projects).toEqual([])
    expect(payload.pollIntervalMs).toBe(2000)
    expect(typeof payload.serverNowMs).toBe("number")
  })

  it("returns ProjectSnapshot with correct shape for a valid source", () => {
    vi.mocked(listSources).mockReturnValue([
      { id: "src-1", label: "My App", updatedAt: 1000 },
    ])
    vi.mocked(getSourceById).mockReturnValue({
      id: "src-1",
      projectRoot: "/home/user/my-app",
      label: "My App",
      createdAt: 500,
      updatedAt: 1000,
    })
    mockGetSnapshot.mockReturnValue(makeDashboardPayload())

    const service = createMultiProjectService({
      storageRoot: "/tmp/test",
      storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
    })

    const payload = service.getMultiProjectPayload()
    expect(payload.projects).toHaveLength(1)

    const project = payload.projects[0]
    expect(project.sourceId).toBe("src-1")
    expect(project.label).toBe("My App")
    expect(project.projectRoot).toBe("/home/user/my-app")
    expect(project.mainSession.agent).toBe("build")
    expect(project.mainSession.status).toBe("idle")
    expect(project.planProgress.status).toBe("in progress")
  })

  it("isolates errors: one failing source doesn't break others", () => {
    vi.mocked(listSources).mockReturnValue([
      { id: "good", label: "Good", updatedAt: 1000 },
      { id: "bad", label: "Bad", updatedAt: 900 },
    ])
    // First call (good source) → returns entry; second call (bad source) → null
    vi.mocked(getSourceById)
      .mockReturnValueOnce({
        id: "good",
        projectRoot: "/home/user/good",
        label: "Good",
        createdAt: 500,
        updatedAt: 1000,
      })
      .mockReturnValueOnce(null)

    mockGetSnapshot.mockReturnValue(makeDashboardPayload())

    const service = createMultiProjectService({
      storageRoot: "/tmp/test",
      storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
    })

    const payload = service.getMultiProjectPayload()
    // Only the good source should appear; the null source is silently skipped
    expect(payload.projects).toHaveLength(1)
    expect(payload.projects[0].sourceId).toBe("good")
  })

  it("maps statusPill values correctly to SessionStatus", () => {
    const testCases: Array<{ pill: string; expected: string }> = [
      { pill: "running tool", expected: "running_tool" },
      { pill: "thinking", expected: "thinking" },
      { pill: "busy", expected: "busy" },
      { pill: "idle", expected: "idle" },
      { pill: "something_else", expected: "unknown" },
    ]

    for (const tc of testCases) {
      vi.mocked(listSources).mockReturnValue([
        { id: "test", updatedAt: 1000 },
      ])
      vi.mocked(getSourceById).mockReturnValue({
        id: "test",
        projectRoot: "/project",
        createdAt: 500,
        updatedAt: 1000,
      })
      mockGetSnapshot.mockReturnValue(
        makeDashboardPayload({
          mainSession: {
            ...makeDashboardPayload().mainSession,
            statusPill: tc.pill,
          },
        }),
      )

      const service = createMultiProjectService({
        storageRoot: "/tmp/test",
        storageBackend: { kind: "sqlite", dataDir: "/tmp", sqlitePath: "/tmp/test.db" },
      })

      const payload = service.getMultiProjectPayload()
      expect(payload.projects[0].mainSession.status).toBe(tc.expected)
    }
  })
})
