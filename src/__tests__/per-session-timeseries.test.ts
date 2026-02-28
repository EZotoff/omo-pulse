import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.hoisted — declare mock state at the hoisted level so vi.mock can see it
// ---------------------------------------------------------------------------

const { mockQueryAll, MockDatabase } = vi.hoisted(() => {
  const mockQueryAll = vi.fn((): unknown[] => [])
  const mockDbClose = vi.fn()
  const MockDatabase = vi.fn(() => ({
    query: vi.fn(() => ({ all: mockQueryAll })),
    close: mockDbClose,
  }))
  return { mockQueryAll, mockDbClose, MockDatabase }
})

vi.mock("bun:sqlite", () => ({
  Database: MockDatabase,
}))

vi.mock("../ingest/paths", () => ({
  realpathSafe: vi.fn((p: string) => p),
}))

// ---------------------------------------------------------------------------
// Import AFTER mocking
// ---------------------------------------------------------------------------
import { derivePerSessionTimeSeries } from "../ingest/per-session-timeseries"

describe("derivePerSessionTimeSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryAll.mockReturnValue([])
  })

  it("returns correct output shape with expected constants", () => {
    const result = derivePerSessionTimeSeries({
      sqlitePath: "/tmp/test.db",
      projectRoot: "/home/user/project",
      nowMs: 1_000_000_000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.windowMs).toBe(300_000)
    expect(result.value.bucketMs).toBe(2_000)
    expect(result.value.buckets).toBe(150)
    expect(result.value.anchorMs).toBe(Math.floor(1_000_000_000 / 2_000) * 2_000)
    expect(result.value.serverNowMs).toBe(1_000_000_000)
  })

  it("returns empty sessions when no matching project directory", () => {
    // First query returns sessions, none matching
    mockQueryAll.mockReturnValueOnce([
      { id: "ses-1", title: "Session 1", directory: "/different/project" },
    ])

    const result = derivePerSessionTimeSeries({
      sqlitePath: "/tmp/test.db",
      projectRoot: "/home/user/project",
      nowMs: 1_000_000_000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessions).toHaveLength(0)
  })

  it("values array length equals buckets count", () => {
    const nowMs = 1_000_000_000
    const anchorMs = Math.floor(nowMs / 2_000) * 2_000
    const startMs = anchorMs - 300_000 + 2_000
    const msgCreatedAt = startMs + 10_000 // well within the window

    // First query: session rows matching our project
    mockQueryAll.mockReturnValueOnce([
      { id: "ses-1", title: "Session 1", directory: "/home/user/project" },
    ])
    // Second query: message rows in time window
    mockQueryAll.mockReturnValueOnce([
      { id: "msg-1", session_id: "ses-1", time_created: msgCreatedAt },
    ])
    // Third query: part rows (tool parts)
    mockQueryAll.mockReturnValueOnce([
      { message_id: "msg-1", data: JSON.stringify({ type: "tool" }) },
    ])

    const result = derivePerSessionTimeSeries({
      sqlitePath: "/tmp/test.db",
      projectRoot: "/home/user/project",
      nowMs,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.sessions).toHaveLength(1)
    expect(result.value.sessions[0].values).toHaveLength(150)
    expect(result.value.sessions[0].sessionId).toBe("ses-1")
    expect(result.value.sessions[0].sessionLabel).toBe("Session 1")
  })

  it("handles SQLite open errors gracefully", () => {
    MockDatabase.mockImplementationOnce(() => {
      throw new Error("unable to open database file")
    })

    const result = derivePerSessionTimeSeries({
      sqlitePath: "/nonexistent/path.db",
      projectRoot: "/home/user/project",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("db_unopenable")
  })
})
