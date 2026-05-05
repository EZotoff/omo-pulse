import type { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getMainSessionView,
	type OpenCodeStorageRoots,
	type SessionMetadata,
	type StoredMessageMeta,
	type StoredToolPart,
} from "../ingest/session";
import { findIncludedSessionsSqlite } from "../ingest/session-inclusion";

vi.mock("../ingest/paths", async () => {
	const actual = await vi.importActual<typeof import("../ingest/paths")>("../ingest/paths");
	return {
		...actual,
		realpathSafe: vi.fn((p: string) => p),
		getOpenCodeStorageDir: vi.fn(() => "/tmp/opencode/storage"),
	};
});

type SessionRow = {
	id: string;
	title?: string;
	directory: string;
	parent_id?: string;
	time_created: number;
	time_updated?: number;
};

type ActivePartRow = {
	tool: string;
	status?: string;
};

type TerminalPartRow = {
	status: string;
	time_created: number;
};

type AssistantMessageRow = {
	time_completed: number | null;
};

type QueryRows =
	| SessionRow[]
	| ActivePartRow[]
	| TerminalPartRow[]
	| AssistantMessageRow[];

type MockStatement = {
	all: (...params: unknown[]) => QueryRows;
};

type MockDatabase = {
	query: (sql: string) => MockStatement;
};

type MockDbConfig = {
	sessionRows?: SessionRow[];
	activePartsBySession?: Record<string, ActivePartRow[]>;
	terminalPartsBySession?: Record<string, TerminalPartRow[]>;
	assistantMessagesBySession?: Record<string, AssistantMessageRow[]>;
	throwOnActiveQueryForSessionIds?: string[];
};

const NOW_MS = 1_000_000;
const PROJECT_ROOT = "/tmp/project";
const tempDirs: string[] = [];

function createMockDb(config: MockDbConfig = {}): MockDatabase {
	return {
		query: (sql: string) => {
			return {
				all: (...params: unknown[]): QueryRows => {
					const isBatch = sql.includes("session_id IN")
					const sessionIds = params.filter((p): p is string => typeof p === "string")

					if (sql.includes("FROM session WHERE directory")) {
						return config.sessionRows ?? []
					}

					if (sql.includes("'pending', 'running'")) {
						const throwIds = config.throwOnActiveQueryForSessionIds ?? []
						if (!isBatch) {
							const sessionId = sessionIds[0]
							if (sessionId && throwIds.includes(sessionId)) {
								throw new Error(`failed active part query for ${sessionId}`)
							}
							return sessionId ? (config.activePartsBySession?.[sessionId] ?? []) : []
						}
						const rows: Array<ActivePartRow & { session_id: string }> = []
						for (const sid of sessionIds) {
							if (throwIds.includes(sid)) continue
							for (const part of (config.activePartsBySession?.[sid] ?? [])) {
								rows.push({ ...part, session_id: sid })
							}
						}
						return rows
					}

					if (sql.includes("'error', 'completed'")) {
						const source = config.terminalPartsBySession ?? {}
						if (isBatch) {
							const rows: Array<TerminalPartRow & { session_id: string }> = []
							for (const sid of sessionIds) {
								for (const part of (source[sid] ?? [])) {
									rows.push({ ...part, session_id: sid })
								}
							}
							return rows
						}
						const sessionId = sessionIds[0]
						return sessionId ? (source[sessionId] ?? []) : []
					}

					if (sql.includes("json_extract(data, '$.role') = 'assistant'")) {
						const source = config.assistantMessagesBySession ?? {}
						if (isBatch) {
							const rows: Array<AssistantMessageRow & { session_id: string }> = []
							for (const sid of sessionIds) {
								for (const msg of (source[sid] ?? [])) {
									rows.push({ ...msg, session_id: sid })
								}
							}
							return rows
						}
						const sessionId = sessionIds[0]
						return sessionId ? (source[sessionId] ?? []) : []
					}

					return []
				},
			}
		},
	}
}

function runFindIncludedSessionsSqlite(
	db: MockDatabase,
	idleWindowMs: number,
): SessionMetadata[] {
	return findIncludedSessionsSqlite(
		db as unknown as Database,
		PROJECT_ROOT,
		idleWindowMs,
	);
}

function writeJson(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function makeTempStorage(): OpenCodeStorageRoots {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-status-"));
	tempDirs.push(root);
	return {
		session: path.join(root, "session"),
		message: path.join(root, "message"),
		part: path.join(root, "part"),
	};
}

function makeSessionMeta(
	sessionId: string,
	updatedAt: number,
): SessionMetadata {
	return {
		id: sessionId,
		projectID: "proj-1",
		directory: PROJECT_ROOT,
		time: { created: updatedAt - 5_000, updated: updatedAt },
	};
}

function makeAssistantMessage(
	messageId: string,
	sessionId: string,
	created: number,
	completed?: number,
): StoredMessageMeta {
	return {
		id: messageId,
		sessionID: sessionId,
		role: "assistant",
		time: typeof completed === "number" ? { created, completed } : { created },
		agent: "build",
	};
}

function writeMessage(
	storage: OpenCodeStorageRoots,
	message: StoredMessageMeta,
): void {
	writeJson(
		path.join(storage.message, message.sessionID, `${message.id}.json`),
		message,
	);
}

function writeToolPart(
	storage: OpenCodeStorageRoots,
	messageId: string,
	part: StoredToolPart,
	fileName = "0001.json",
): void {
	writeJson(path.join(storage.part, messageId, fileName), part);
}

afterEach(() => {
	vi.restoreAllMocks();
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("status derivation characterization: SQLite session inclusion path", () => {
	it("derives and orders all main-session statuses by severity", () => {
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
		const age = (ms: number): number => NOW_MS - ms;

		const sessions = runFindIncludedSessionsSqlite(
			createMockDb({
				sessionRows: [
					{
						id: "ses-question",
						directory: PROJECT_ROOT,
						time_created: age(20_000),
						time_updated: age(20_000),
					},
					{
						id: "ses-running",
						directory: PROJECT_ROOT,
						time_created: age(20_000),
						time_updated: age(20_000),
					},
					{
						id: "ses-thinking",
						directory: PROJECT_ROOT,
						time_created: age(20_000),
						time_updated: age(20_000),
					},
					{
						id: "ses-busy-fresh",
						directory: PROJECT_ROOT,
						time_created: age(20_000),
						time_updated: age(20_000),
					},
					{
						id: "ses-busy",
						directory: PROJECT_ROOT,
						time_created: age(30_000),
						time_updated: age(30_000),
					},
					{
						id: "ses-idle",
						directory: PROJECT_ROOT,
						time_created: age(90_000),
						time_updated: age(90_000),
					},
					{
						id: "ses-unknown",
						directory: PROJECT_ROOT,
						time_created: age(20_000),
						time_updated: age(20_000),
					},
				],
				activePartsBySession: {
					"ses-question": [{ tool: "mcp_question", status: "pending" }],
					"ses-running": [{ tool: "bash", status: "running" }],
				},
				assistantMessagesBySession: {
					"ses-thinking": [{ time_completed: null }],
				},
				throwOnActiveQueryForSessionIds: ["ses-unknown"],
			}),
			120_000,
		);

		expect(sessions.map((session) => session.id)).toEqual([
			"ses-question",
			"ses-running",
			"ses-thinking",
			"ses-busy-fresh",
			"ses-busy",
			"ses-unknown",
			"ses-idle",
		]);
	});

	it("returns idle for stale sessions regardless of terminal tool status", () => {
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
		const age = (ms: number): number => NOW_MS - ms;

		const sessions = runFindIncludedSessionsSqlite(
			createMockDb({
				sessionRows: [
					{
						id: "ses-busy",
						directory: PROJECT_ROOT,
						time_created: age(20_000),
						time_updated: age(20_000),
					},
					{
						id: "ses-stale",
						directory: PROJECT_ROOT,
						time_created: age(90_000),
						time_updated: age(90_000),
					},
				],
			}),
			120_000,
		);

		expect(sessions.map((session) => session.id)).toEqual([
			"ses-busy",
			"ses-stale",
		]);
	});
});

describe("status derivation characterization: file-based getMainSessionView path", () => {
	it("returns question when the latest active tool is a pending question tool", () => {
		const storage = makeTempStorage();
		const message = makeAssistantMessage(
			"msg-question",
			"ses-question",
			NOW_MS - 5_000,
			NOW_MS - 4_900,
		);
		writeMessage(storage, message);

		writeToolPart(storage, message.id, {
			id: "part-question",
			sessionID: message.sessionID,
			messageID: message.id,
			type: "tool",
			callID: "call-question",
			tool: "mcp_question",
			state: { status: "pending", input: {} },
		});

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: message.sessionID,
			storage,
			sessionMeta: makeSessionMeta(message.sessionID, NOW_MS - 5_000),
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("question");
	});

	it("returns running_tool when the latest active tool is non-question", () => {
		const storage = makeTempStorage();
		const message = makeAssistantMessage(
			"msg-running",
			"ses-running",
			NOW_MS - 5_000,
			NOW_MS - 4_900,
		);
		writeMessage(storage, message);

		writeToolPart(storage, message.id, {
			id: "part-running",
			sessionID: message.sessionID,
			messageID: message.id,
			type: "tool",
			callID: "call-running",
			tool: "bash",
			state: { status: "running", input: {} },
		});

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: message.sessionID,
			storage,
			sessionMeta: makeSessionMeta(message.sessionID, NOW_MS - 5_000),
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("running_tool");
	});

	it("returns busy when a terminal tool error exists but session is still active", () => {
		const storage = makeTempStorage();
		const message = makeAssistantMessage(
			"msg-error",
			"ses-error",
			NOW_MS - 10_000,
			NOW_MS - 9_900,
		);
		writeMessage(storage, message);

		writeToolPart(storage, message.id, {
			id: "part-error",
			sessionID: message.sessionID,
			messageID: message.id,
			type: "tool",
			callID: "call-error",
			tool: "bash",
			state: { status: "error", input: {} },
		});

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: message.sessionID,
			storage,
			sessionMeta: makeSessionMeta(message.sessionID, NOW_MS - 10_000),
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("busy");
	});

	it("returns thinking for fresh assistant messages without completion time", () => {
		const storage = makeTempStorage();
		const message = makeAssistantMessage(
			"msg-thinking",
			"ses-thinking",
			NOW_MS - 8_000,
		);
		writeMessage(storage, message);

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: message.sessionID,
			storage,
			sessionMeta: makeSessionMeta(message.sessionID, NOW_MS - 8_000),
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("thinking");
	});

	it("returns busy from fallback branch when session is active within busy window", () => {
		const storage = makeTempStorage();
		const message = makeAssistantMessage(
			"msg-busy",
			"ses-busy",
			NOW_MS - 30_000,
			NOW_MS - 29_000,
		);
		writeMessage(storage, message);

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: message.sessionID,
			storage,
			sessionMeta: makeSessionMeta(message.sessionID, NOW_MS - 30_000),
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("busy");
	});

	it("returns idle from fallback branch when session is older than busy window", () => {
		const storage = makeTempStorage();
		const message = makeAssistantMessage(
			"msg-idle",
			"ses-idle",
			NOW_MS - 90_000,
			NOW_MS - 89_000,
		);
		writeMessage(storage, message);

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: message.sessionID,
			storage,
			sessionMeta: makeSessionMeta(message.sessionID, NOW_MS - 90_000),
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("idle");
	});

	it("keeps unknown when there is no readable message history", () => {
		const storage = makeTempStorage();

		const view = getMainSessionView({
			projectRoot: PROJECT_ROOT,
			sessionId: "ses-unknown",
			storage,
			nowMs: NOW_MS,
		});

		expect(view.status).toBe("unknown");
	});
});
