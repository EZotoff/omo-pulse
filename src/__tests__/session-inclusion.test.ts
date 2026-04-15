import type { Database } from "bun:sqlite"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../ingest/paths", () => ({
  realpathSafe: vi.fn((p: string) => p),
}))

import { isSessionIncluded, findIncludedSessionsSqlite } from "../ingest/session-inclusion"
import type { SessionMetadata } from "../ingest/session"

type SessionRow = {
  id: string
  title?: string
  directory: string
  parent_id?: string
  time_created: number
  time_updated?: number
}

type ActivePartRow = {
  tool: string
  status?: string
}

type TerminalPartRow = {
  status: string
  time_created: number
}

type AssistantMessageRow = {
  time_completed: number | null
}

type QueryRows = SessionRow[] | ActivePartRow[] | TerminalPartRow[] | AssistantMessageRow[]

type MockStatement = {
  all: (...params: unknown[]) => QueryRows
}

type MockDatabase = {
  query: (sql: string) => MockStatement
}

type MockDbConfig = {
  sessionRows?: SessionRow[]
  activePartsBySession?: Record<string, ActivePartRow[]>
  terminalPartsBySession?: Record<string, TerminalPartRow[]>
  assistantMessagesBySession?: Record<string, AssistantMessageRow[]>
  throwOnQuery?: boolean
}

function createMockDb(config: MockDbConfig = {}): MockDatabase {
  return {
    query: (sql: string) => {
      if (config.throwOnQuery) {
        throw new Error("database is locked")
      }

      return {
        all: (...params: unknown[]): QueryRows => {
          const sessionId = typeof params[0] === "string" ? params[0] : undefined

          if (sql.includes("FROM session WHERE directory")) {
            return config.sessionRows ?? []
          }

          if (sql.includes("'pending', 'running'")) {
            return sessionId ? (config.activePartsBySession?.[sessionId] ?? []) : []
          }

          if (sql.includes("'error', 'completed'")) {
            return sessionId ? (config.terminalPartsBySession?.[sessionId] ?? []) : []
          }

          if (sql.includes("json_extract(data, '$.role') = 'assistant'")) {
            return sessionId ? (config.assistantMessagesBySession?.[sessionId] ?? []) : []
          }

          return []
        },
      }
    },
  }
}

function runFindIncludedSessionsSqlite(
  db: MockDatabase,
  projectRoot: string,
  idleWindowMs: number
): SessionMetadata[] {
  return findIncludedSessionsSqlite(db as unknown as Database, projectRoot, idleWindowMs)
}

describe("isSessionIncluded", () => {
  it("excludes sessions with parentID (background sessions)", () => {
    const session: SessionMetadata = {
      id: "ses-bg",
      projectID: "proj-1",
      directory: "/project",
      parentID: "ses-main",
      title: "Background",
      time: { created: 1000, updated: 2000 },
    }

    const result = isSessionIncluded(session, 60000, 3000)
    expect(result).toBe(false)
  })

  it("includes main sessions (no parentID) within idle window", () => {
    const session: SessionMetadata = {
      id: "ses-main",
      projectID: "proj-1",
      directory: "/project",
      time: { created: 1000, updated: 2000 },
    }

    const result = isSessionIncluded(session, 60000, 2500)
    expect(result).toBe(true)
  })

  it("excludes main sessions outside idle window", () => {
    const session: SessionMetadata = {
      id: "ses-old",
      projectID: "proj-1",
      directory: "/project",
      time: { created: 1000, updated: 2000 },
    }

    const result = isSessionIncluded(session, 60000, 100000)
    expect(result).toBe(false)
  })

  it("uses time.created if time.updated is missing", () => {
    const session: SessionMetadata = {
      id: "ses-main",
      projectID: "proj-1",
      directory: "/project",
      time: { created: 1000, updated: 1000 },
    }

    const result = isSessionIncluded(session, 60000, 1500)
    expect(result).toBe(true)
  })
})

describe("findIncludedSessionsSqlite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty array when no sessions in project", () => {
    const result = runFindIncludedSessionsSqlite(createMockDb(), "/home/user/project", 60000)

    expect(result).toEqual([])
  })

  it("filters sessions by project directory match", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "ses-1",
            title: "Session 1",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
          {
            id: "ses-2",
            title: "Session 2",
            directory: "/different/project",
            time_created: now,
            time_updated: now,
          },
        ],
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ses-1")
  })

  it("excludes background sessions (with parent_id)", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "ses-main",
            title: "Main",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
          {
            id: "ses-bg",
            title: "Background",
            directory: "/home/user/project",
            parent_id: "ses-main",
            time_created: now,
            time_updated: now,
          },
        ],
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ses-main")
  })

  it("excludes stale non-attention sessions outside idle window", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "ses-active",
            title: "Active",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
          {
            id: "ses-stale",
            title: "Stale",
            directory: "/home/user/project",
            time_created: now - 100000,
            time_updated: now - 100000,
          },
        ],
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ses-active")
  })

  it("keeps stale question sessions included beyond the normal idle window", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "stale-question",
            title: "Question",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
          {
            id: "stale-busy",
            title: "Busy",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
        ],
        activePartsBySession: {
          "stale-question": [{ tool: "mcp_question", status: "pending" }],
        },
      }),
      "/home/user/project",
      60000,
    )

    expect(result.map((session) => session.id)).toEqual(["stale-question"])
  })

  it("excludes stale error sessions once error and activity are both stale", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "stale-error",
            title: "Error",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
          {
            id: "stale-idle",
            title: "Idle",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
        ],
        terminalPartsBySession: {
          "stale-error": [{ status: "error", time_created: now - 120000 }],
        },
      }),
      "/home/user/project",
      60000,
    )

    expect(result.map((session) => session.id)).toEqual([])
  })

  it("does not treat generic mc_* tools as question status", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "fresh-busy",
            title: "Fresh Busy",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
          {
            id: "stale-mc-launch",
            title: "Stale MC Launch",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
        ],
        activePartsBySession: {
          "stale-mc-launch": [{ tool: "mc_launch", status: "running" }],
        },
      }),
      "/home/user/project",
      60000,
    )

    expect(result.map((session) => session.id)).toEqual(["fresh-busy"])
  })

  it("keeps canonical question tools included beyond the normal idle window", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "stale-question",
            title: "Question",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
          {
            id: "stale-mcp-answer",
            title: "Answer",
            directory: "/home/user/project",
            time_created: now - 120000,
            time_updated: now - 120000,
          },
        ],
        activePartsBySession: {
          "stale-question": [{ tool: "mcp_question", status: "pending" }],
          "stale-mcp-answer": [{ tool: "mcp_answer", status: "running" }],
        },
      }),
      "/home/user/project",
      60000,
    )

    expect(result.map((session) => session.id)).toEqual(["stale-question"])
  })

  it("handles mixed sessions: active top-level, stale excluded, child/background excluded", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "ses-active",
            title: "Active Main",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
          {
            id: "ses-old",
            title: "Old Main",
            directory: "/home/user/project",
            time_created: now - 100000,
            time_updated: now - 100000,
          },
          {
            id: "ses-bg-active",
            title: "Active Background",
            directory: "/home/user/project",
            parent_id: "ses-active",
            time_created: now,
            time_updated: now,
          },
          {
            id: "ses-bg-old",
            title: "Old Background",
            directory: "/home/user/project",
            parent_id: "ses-old",
            time_created: now - 100000,
            time_updated: now - 100000,
          },
        ],
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ses-active")
  })

  it("returns empty array on database read error", () => {
    const result = runFindIncludedSessionsSqlite(
      createMockDb({ throwOnQuery: true }),
      "/home/user/project",
      60000,
    )

    expect(result).toEqual([])
  })

  it("handles sessions with missing time_updated (uses time_created)", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "ses-1",
            title: "Session 1",
            directory: "/home/user/project",
            time_created: now,
          },
        ],
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(1)
    expect(result[0].time.updated).toBe(now)
  })

  it("returns sessions in deterministic order: most recent first, then id ascending as tie-breaker", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "ses-c",
            title: "Session C",
            directory: "/home/user/project",
            time_created: now - 30000,
            time_updated: now - 30000,
          },
          {
            id: "ses-a",
            title: "Session A",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
          {
            id: "ses-b",
            title: "Session B",
            directory: "/home/user/project",
            time_created: now,
            time_updated: now,
          },
        ],
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe("ses-a")
    expect(result[1].id).toBe("ses-b")
    expect(result[2].id).toBe("ses-c")
  })

  it("orders sessions by severity-first (error > question > busy), then recency", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "error-session",
            title: "Error Session",
            directory: "/home/user/project",
            time_created: now - 30000,
            time_updated: now - 30000,
          },
          {
            id: "question-session",
            title: "Question Session",
            directory: "/home/user/project",
            time_created: now - 10000,
            time_updated: now - 10000,
          },
          {
            id: "busy-session",
            title: "Busy Session",
            directory: "/home/user/project",
            time_created: now - 5000,
            time_updated: now - 5000,
          },
        ],
        activePartsBySession: {
          "question-session": [{ tool: "mcp_question", status: "pending" }],
        },
        terminalPartsBySession: {
          "error-session": [{ status: "error", time_created: now - 30000 }],
        },
      }),
      "/home/user/project",
      60000,
    )

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe("error-session")
    expect(result[1].id).toBe("question-session")
    expect(result[2].id).toBe("busy-session")
  })

  it("orders idle sessions (>60s old) after busy sessions (<=60s old) based on canonical ACTIVE_BUSY_WINDOW_MS", () => {
    const now = Date.now()
    const result = runFindIncludedSessionsSqlite(
      createMockDb({
        sessionRows: [
          {
            id: "idle-session",
            title: "Idle Session (90s old)",
            directory: "/home/user/project",
            time_created: now - 90000,
            time_updated: now - 90000,
          },
          {
            id: "busy-session",
            title: "Busy Session (30s old)",
            directory: "/home/user/project",
            time_created: now - 30000,
            time_updated: now - 30000,
          },
        ],
      }),
      "/home/user/project",
      120000,
    )

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("busy-session")
    expect(result[1].id).toBe("idle-session")
  })
})
