import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { deriveBackgroundTasks } from "../ingest/background-tasks"
import { getMainSessionView, type OpenCodeStorageRoots, type SessionMetadata, type StoredMessageMeta, type StoredToolPart } from "../ingest/session"

type PersistedToolPart = StoredToolPart & {
  state: StoredToolPart["state"] & {
    metadata?: { sessionId?: string }
    time?: { start?: number }
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8")
}

const tempDirs: string[] = []

function makeTempStorage(): OpenCodeStorageRoots {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-question-"))
  tempDirs.push(root)
  return {
    session: path.join(root, "session"),
    message: path.join(root, "message"),
    part: path.join(root, "part"),
  }
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock("../ingest/storage-backend")
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("background question bridge", () => {
  it("promotes file-based main-session status to question when a background task asks a question", () => {
    const storage = makeTempStorage()
    const nowMs = 1_000_000
    const mainSessionId = "ses-main"
    const questionSessionId = "ses-child-question"
    const runningSessionId = "ses-child-running"
    const mainMessageId = "msg-main"

    const mainMeta: StoredMessageMeta = {
      id: mainMessageId,
      sessionID: mainSessionId,
      role: "assistant",
      time: { created: nowMs - 1_000, completed: nowMs - 900 },
      agent: "build",
    }
    writeJson(path.join(storage.message, mainSessionId, `${mainMessageId}.json`), mainMeta)

    const mainTaskQuestion: PersistedToolPart = {
      id: "part-main-question",
      sessionID: mainSessionId,
      messageID: mainMessageId,
      type: "tool",
      callID: "call-question",
      tool: "background_task",
      state: {
        status: "completed",
        input: {
          description: "Ask the user",
          run_in_background: true,
        },
        metadata: { sessionId: questionSessionId },
        time: { start: nowMs - 1_200 },
      },
    }
    const mainTaskRunning: PersistedToolPart = {
      id: "part-main-running",
      sessionID: mainSessionId,
      messageID: mainMessageId,
      type: "tool",
      callID: "call-running",
      tool: "background_task",
      state: {
        status: "completed",
        input: {
          description: "Keep working",
          run_in_background: true,
        },
        metadata: { sessionId: runningSessionId },
        time: { start: nowMs - 1_100 },
      },
    }
    writeJson(path.join(storage.part, mainMessageId, "0001.json"), mainTaskQuestion)
    writeJson(path.join(storage.part, mainMessageId, "0002.json"), mainTaskRunning)

    const questionMeta: StoredMessageMeta = {
      id: "msg-child-question",
      sessionID: questionSessionId,
      role: "assistant",
      time: { created: nowMs - 200 },
      agent: "atlas",
    }
    writeJson(path.join(storage.message, questionSessionId, "msg-child-question.json"), questionMeta)
    const questionPart: StoredToolPart = {
      id: "part-child-question",
      sessionID: questionSessionId,
      messageID: questionMeta.id,
      type: "tool",
      callID: "child-question",
      tool: "mcp_question",
      state: {
        status: "pending",
        input: {},
      },
    }
    writeJson(path.join(storage.part, questionMeta.id, "0001.json"), questionPart)

    const runningMeta: StoredMessageMeta = {
      id: "msg-child-running",
      sessionID: runningSessionId,
      role: "assistant",
      time: { created: nowMs - 150 },
      agent: "atlas",
    }
    writeJson(path.join(storage.message, runningSessionId, "msg-child-running.json"), runningMeta)
    const runningPart: StoredToolPart = {
      id: "part-child-running",
      sessionID: runningSessionId,
      messageID: runningMeta.id,
      type: "tool",
      callID: "child-running",
      tool: "bash",
      state: {
        status: "running",
        input: {},
      },
    }
    writeJson(path.join(storage.part, runningMeta.id, "0001.json"), runningPart)

    const backgroundTasks = deriveBackgroundTasks({
      storage,
      mainSessionId,
      nowMs,
    })

    expect(backgroundTasks.map((task) => task.status)).toEqual(["question", "running"])

    const sessionMeta: SessionMetadata = {
      id: mainSessionId,
      projectID: "proj-1",
      directory: "/tmp/project",
      time: { created: nowMs - 5_000, updated: nowMs - 1_000 },
    }

    const view = getMainSessionView({
      projectRoot: "/tmp/project",
      sessionId: mainSessionId,
      storage,
      sessionMeta,
      nowMs,
    })

    expect(view.status).toBe("question")
    expect(view.currentTool).toBe("mcp_question")
  })

  it("demotes stale running question tools on the main session to idle", () => {
    const storage = makeTempStorage()
    const nowMs = 1_000_000
    const mainSessionId = "ses-main"
    const mainMessageId = "msg-main"

    const mainMeta: StoredMessageMeta = {
      id: mainMessageId,
      sessionID: mainSessionId,
      role: "assistant",
      time: { created: nowMs - 11 * 60_000 },
      agent: "build",
    }
    writeJson(path.join(storage.message, mainSessionId, `${mainMessageId}.json`), mainMeta)

    const staleQuestionPart: StoredToolPart = {
      id: "part-main-question",
      sessionID: mainSessionId,
      messageID: mainMessageId,
      type: "tool",
      callID: "call-question",
      tool: "question",
      state: {
        status: "running",
        input: {},
      },
    }
    writeJson(path.join(storage.part, mainMessageId, "0001.json"), staleQuestionPart)

    const sessionMeta: SessionMetadata = {
      id: mainSessionId,
      projectID: "proj-1",
      directory: "/tmp/project",
      time: { created: nowMs - 12 * 60_000, updated: nowMs - 11 * 60_000 },
    }

    const view = getMainSessionView({
      projectRoot: "/tmp/project",
      sessionId: mainSessionId,
      storage,
      sessionMeta,
      nowMs,
    })

    expect(view.status).toBe("idle")
    expect(view.currentTool).toBeNull()
  })

  it("surfaces question for SQLite background tasks and main-session fallback", async () => {
    vi.doMock("../ingest/storage-backend", () => {
      const mainSessionMeta: SessionMetadata = {
        id: "ses-main",
        projectID: "proj-1",
        directory: "/tmp/project",
        time: { created: 900_000, updated: 999_000 },
      }
      const childSessionMeta: SessionMetadata = {
        id: "ses-child",
        projectID: "proj-1",
        directory: "/tmp/project",
        parentID: "ses-main",
        title: "Ask the user (@atlas subagent)",
        time: { created: 999_100, updated: 999_900 },
      }
      const mainMeta: StoredMessageMeta = {
        id: "msg-main",
        sessionID: "ses-main",
        role: "assistant",
        time: { created: 999_000, completed: 999_100 },
        agent: "build",
      }
      const childMeta: StoredMessageMeta = {
        id: "msg-child",
        sessionID: "ses-child",
        role: "assistant",
        time: { created: 999_900 },
        agent: "atlas",
      }
      const mainTaskPart: PersistedToolPart = {
        id: "part-main",
        sessionID: "ses-main",
        messageID: "msg-main",
        type: "tool",
        callID: "call-main",
        tool: "background_task",
        state: {
          status: "completed",
          input: {
            description: "Ask the user",
            run_in_background: true,
            subagent_type: "atlas",
          },
          metadata: { sessionId: "ses-child" },
          time: { start: 999_050 },
        },
      }
      const childQuestionPart: StoredToolPart = {
        id: "part-child",
        sessionID: "ses-child",
        messageID: "msg-child",
        type: "tool",
        callID: "call-child",
        tool: "mcp_question",
        state: {
          status: "pending",
          input: {},
        },
      }

      return {
        readMainSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta] })),
        readAllSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta, childSessionMeta] })),
        readSessionExistsSqlite: vi.fn(() => ({ ok: true as const, rows: [{ id: "ses-child" }] })),
        readTodosSqlite: vi.fn(() => ({ ok: true as const, rows: [] })),
        readRecentMessageMetasSqlite: vi.fn(({ sessionId }: { sessionId: string }) => {
          if (sessionId === "ses-main") return { ok: true as const, rows: [mainMeta] }
          if (sessionId === "ses-child") return { ok: true as const, rows: [childMeta] }
          return { ok: true as const, rows: [] }
        }),
        readToolPartsForMessagesSqlite: vi.fn(({ messageIds }: { messageIds: string[] }) => {
          const rows: StoredToolPart[] = []
          if (messageIds.includes("msg-main")) rows.push(mainTaskPart)
          if (messageIds.includes("msg-child")) rows.push(childQuestionPart)
          return { ok: true as const, rows }
        }),
      }
    })

    const { deriveBackgroundTasksSqlite, getMainSessionViewSqlite } = await import("../ingest/sqlite-derive")

    const tasksResult = deriveBackgroundTasksSqlite({
      sqlitePath: "/tmp/opencode.db",
      mainSessionId: "ses-main",
      nowMs: 1_000_000,
    })

    expect(tasksResult.ok).toBe(true)
    if (!tasksResult.ok) throw new Error("expected sqlite background tasks")
    expect(tasksResult.value[0]?.status).toBe("question")
    expect(tasksResult.value[0]?.lastTool).toBe("mcp_question")

    const viewResult = getMainSessionViewSqlite({
      sqlitePath: "/tmp/opencode.db",
      sessionId: "ses-main",
      sessionMeta: {
        id: "ses-main",
        projectID: "proj-1",
        directory: "/tmp/project",
        time: { created: 900_000, updated: 999_000 },
      },
      nowMs: 1_000_000,
    })

    expect(viewResult.ok).toBe(true)
    if (!viewResult.ok) throw new Error("expected sqlite main session view")
    expect(viewResult.value.status).toBe("question")
    expect(viewResult.value.currentTool).toBe("mcp_question")
  })

  it("demotes stale running question tools on SQLite main sessions to idle", async () => {
    vi.doMock("../ingest/storage-backend", () => {
      const mainSessionMeta: SessionMetadata = {
        id: "ses-main",
        projectID: "proj-1",
        directory: "/tmp/project",
        time: { created: 100_000, updated: 340_000 },
      }
      const mainMeta: StoredMessageMeta = {
        id: "msg-main",
        sessionID: "ses-main",
        role: "assistant",
        time: { created: 340_000 },
        agent: "build",
      }
      const staleQuestionPart: StoredToolPart = {
        id: "part-main",
        sessionID: "ses-main",
        messageID: "msg-main",
        type: "tool",
        callID: "call-main",
        tool: "question",
        state: {
          status: "running",
          input: {},
        },
      }

      return {
        readMainSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta] })),
        readAllSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta] })),
        readSessionExistsSqlite: vi.fn(() => ({ ok: true as const, rows: [] })),
        readTodosSqlite: vi.fn(() => ({ ok: true as const, rows: [] })),
        readRecentMessageMetasSqlite: vi.fn(({ sessionId }: { sessionId: string }) => {
          if (sessionId === "ses-main") return { ok: true as const, rows: [mainMeta] }
          return { ok: true as const, rows: [] }
        }),
        readToolPartsForMessagesSqlite: vi.fn(({ messageIds }: { messageIds: string[] }) => {
          const rows: StoredToolPart[] = []
          if (messageIds.includes("msg-main")) rows.push(staleQuestionPart)
          return { ok: true as const, rows }
        }),
      }
    })

    const { getMainSessionViewSqlite } = await import("../ingest/sqlite-derive")

    const viewResult = getMainSessionViewSqlite({
      sqlitePath: "/tmp/opencode.db",
      sessionId: "ses-main",
      sessionMeta: {
        id: "ses-main",
        projectID: "proj-1",
        directory: "/tmp/project",
        time: { created: 100_000, updated: 340_000 },
      },
      nowMs: 1_000_000,
    })

    expect(viewResult.ok).toBe(true)
    if (!viewResult.ok) throw new Error("expected sqlite main session view")
    expect(viewResult.value.status).toBe("idle")
    expect(viewResult.value.currentTool).toBeNull()
  })
})
