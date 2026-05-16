import { describe, expect, it, vi } from "vitest"

import type { SessionMetadata, StoredMessageMeta, StoredToolPart } from "../ingest/session"

type PersistedToolPart = StoredToolPart & {
  state: StoredToolPart["state"] & {
    metadata?: { sessionId?: string }
    time?: { start?: number }
  }
}

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

vi.mock("../ingest/storage-backend", () => ({
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
}))

describe("background question bridge (SQLite)", () => {
  it("surfaces question for SQLite background tasks and main-session fallback", async () => {
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

	it("surfaces question for SQLite background tasks when child question tool is running", async () => {
		vi.doMock("../ingest/storage-backend", () => {
			const runningChildQuestionPart: StoredToolPart = {
				...childQuestionPart,
				tool: "question",
				state: {
					...childQuestionPart.state,
					status: "running",
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
					if (messageIds.includes("msg-child")) rows.push(runningChildQuestionPart)
					return { ok: true as const, rows }
				}),
			}
		})

		vi.resetModules()
		const { deriveBackgroundTasksSqlite, getMainSessionViewSqlite } = await import("../ingest/sqlite-derive")

		const tasksResult = deriveBackgroundTasksSqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs: 1_000_000,
		})

		expect(tasksResult.ok).toBe(true)
		if (!tasksResult.ok) throw new Error("expected sqlite background tasks")
		expect(tasksResult.value[0]?.status).toBe("question")
		expect(tasksResult.value[0]?.lastTool).toBe("question")

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
		expect(viewResult.value.currentTool).toBe("question")
	})

	it("does not surface question for stale orphaned SQLite running question tools", async () => {
		const nowMs = 2_000_000
		const freshMainMeta: StoredMessageMeta = {
			...mainMeta,
			time: { created: nowMs - 1_000, completed: nowMs - 900 },
		}
		const freshChildMeta: StoredMessageMeta = {
			...childMeta,
			time: { created: nowMs - 1_000, completed: nowMs - 900 },
		}
		const staleRunningQuestionPart: StoredToolPart = {
			...childQuestionPart,
			tool: "question",
			state: {
				...childQuestionPart.state,
				status: "running",
				time: { start: nowMs - 700_000 },
			} as StoredToolPart["state"] & { time: { start: number } },
		}

		vi.doMock("../ingest/storage-backend", () => ({
			readMainSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta] })),
			readAllSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta, childSessionMeta] })),
			readSessionExistsSqlite: vi.fn(() => ({ ok: true as const, rows: [{ id: "ses-child" }] })),
			readTodosSqlite: vi.fn(() => ({ ok: true as const, rows: [] })),
			readRecentMessageMetasSqlite: vi.fn(({ sessionId }: { sessionId: string }) => {
				if (sessionId === "ses-main") return { ok: true as const, rows: [freshMainMeta] }
				if (sessionId === "ses-child") return { ok: true as const, rows: [freshChildMeta] }
				return { ok: true as const, rows: [] }
			}),
			readToolPartsForMessagesSqlite: vi.fn(({ messageIds }: { messageIds: string[] }) => {
				const rows: StoredToolPart[] = []
				if (messageIds.includes("msg-main")) rows.push(mainTaskPart)
				if (messageIds.includes("msg-child")) rows.push(staleRunningQuestionPart)
				return { ok: true as const, rows }
			}),
		}))

		vi.resetModules()
		const { deriveBackgroundTasksSqlite, getMainSessionViewSqlite } = await import("../ingest/sqlite-derive")

		const tasksResult = deriveBackgroundTasksSqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs,
		})

		expect(tasksResult.ok).toBe(true)
		if (!tasksResult.ok) throw new Error("expected sqlite background tasks")
		expect(tasksResult.value[0]?.status).not.toBe("question")

		const viewResult = getMainSessionViewSqlite({
			sqlitePath: "/tmp/opencode.db",
			sessionId: "ses-main",
			sessionMeta: {
				id: "ses-main",
				projectID: "proj-1",
				directory: "/tmp/project",
				time: { created: nowMs - 10_000, updated: nowMs - 1_000 },
			},
			nowMs,
		})

		expect(viewResult.ok).toBe(true)
		if (!viewResult.ok) throw new Error("expected sqlite main session view")
		expect(viewResult.value.status).not.toBe("question")
	})

	it("does not surface question for stale orphaned SQLite main-session running question tools", async () => {
		const nowMs = 2_000_000
		const staleMainQuestionPart: StoredToolPart = {
			id: "part-main-stale-question",
			sessionID: "ses-main",
			messageID: "msg-main",
			type: "tool",
			callID: "call-main-stale-question",
			tool: "question",
			state: {
				status: "running",
				input: {},
				time: { start: nowMs - 700_000 },
			} as StoredToolPart["state"] & { time: { start: number } },
		}
		const freshMainMeta: StoredMessageMeta = {
			...mainMeta,
			time: { created: nowMs - 1_000, completed: nowMs - 900 },
		}

		vi.doMock("../ingest/storage-backend", () => ({
			readMainSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta] })),
			readAllSessionMetasSqlite: vi.fn(() => ({ ok: true as const, rows: [mainSessionMeta] })),
			readSessionExistsSqlite: vi.fn(() => ({ ok: true as const, rows: [] })),
			readTodosSqlite: vi.fn(() => ({ ok: true as const, rows: [] })),
			readRecentMessageMetasSqlite: vi.fn(({ sessionId }: { sessionId: string }) => {
				if (sessionId === "ses-main") return { ok: true as const, rows: [freshMainMeta] }
				return { ok: true as const, rows: [] }
			}),
			readToolPartsForMessagesSqlite: vi.fn(({ messageIds }: { messageIds: string[] }) => {
				const rows: StoredToolPart[] = []
				if (messageIds.includes("msg-main")) rows.push(staleMainQuestionPart)
				return { ok: true as const, rows }
			}),
		}))

		vi.resetModules()
		const { getMainSessionViewSqlite } = await import("../ingest/sqlite-derive")

		const viewResult = getMainSessionViewSqlite({
			sqlitePath: "/tmp/opencode.db",
			sessionId: "ses-main",
			sessionMeta: {
				id: "ses-main",
				projectID: "proj-1",
				directory: "/tmp/project",
				time: { created: nowMs - 10_000, updated: nowMs - 1_000 },
			},
			nowMs,
		})

		expect(viewResult.ok).toBe(true)
		if (!viewResult.ok) throw new Error("expected sqlite main session view")
		expect(viewResult.value.status).not.toBe("question")
		expect(viewResult.value.currentTool).toBeNull()
	})
})
