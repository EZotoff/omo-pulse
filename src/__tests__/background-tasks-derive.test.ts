import type { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { deriveBackgroundTasks } from "../ingest/background-tasks";
import type {
	OpenCodeStorageRoots,
	SessionMetadata,
	StoredMessageMeta,
	StoredToolPart,
} from "../ingest/session";
import {
	deriveBackgroundTasksSqlite,
	deriveTimeSeriesActivitySqlite,
} from "../ingest/sqlite-derive";

type SessionRow = {
	id: string;
	project_id: string;
	directory: string;
	title?: string;
	parent_id?: string;
	time_created: number;
	time_updated?: number;
};

type MessageRow = {
	id: string;
	session_id: string;
	time_created: number;
	data: string;
};

type PartRow = {
	id: string;
	message_id: string;
	session_id: string;
	time_created: number;
	data: string;
};

type MockDbConfig = {
	sessionRows?: SessionRow[];
	messagesBySession?: Record<string, MessageRow[]>;
	partsByMessage?: Record<string, PartRow[]>;
	throwOnQuery?: boolean;
};

type MockDatabase = {
	query: (sql: string) => {
		all: (...params: unknown[]) => unknown[];
	};
};

function createMockDb(config: MockDbConfig = {}): MockDatabase {
	return {
		query: (sql: string) => ({
			all: (...params: unknown[]): unknown[] => {
				if (config.throwOnQuery) {
					throw new Error("database is locked");
				}

				if (sql.includes("FROM session ORDER BY")) {
					return config.sessionRows ?? [];
				}

				if (sql.includes("FROM message WHERE session_id = ?")) {
					const sessionId = typeof params[0] === "string" ? params[0] : "";
					const limit =
						typeof params[1] === "number" ? params[1] : Number.MAX_SAFE_INTEGER;
					return (config.messagesBySession?.[sessionId] ?? []).slice(0, limit);
				}

				if (sql.includes("FROM part WHERE message_id IN")) {
					const messageIds = params.filter(
						(value): value is string => typeof value === "string",
					);
					return messageIds.flatMap(
						(messageId) => config.partsByMessage?.[messageId] ?? [],
					);
				}

				return [];
			},
		}),
	};
}

function makeMessageRow(opts: {
	id: string;
	sessionId: string;
	createdAt: number;
	agent?: string;
	role?: "assistant" | "user";
	completedAt?: number;
}): MessageRow {
	const role = opts.role ?? "assistant";
	const payload = {
		role,
		time:
			typeof opts.completedAt === "number"
				? { created: opts.createdAt, completed: opts.completedAt }
				: { created: opts.createdAt },
		...(opts.agent ? { agent: opts.agent } : {}),
	};

	return {
		id: opts.id,
		session_id: opts.sessionId,
		time_created: opts.createdAt,
		data: JSON.stringify(payload),
	};
}

function makePartRow(opts: {
	id: string;
	messageId: string;
	sessionId: string;
	createdAt: number;
	callId: string;
	tool: string;
	status: "pending" | "running" | "completed" | "error";
	input?: Record<string, unknown>;
	metadata?: { sessionId?: string };
	startAt?: number;
}): PartRow {
	const payload: Record<string, unknown> = {
		type: "tool",
		callID: opts.callId,
		tool: opts.tool,
		state: {
			status: opts.status,
			input: opts.input ?? {},
			...(opts.metadata ? { metadata: opts.metadata } : {}),
			...(typeof opts.startAt === "number"
				? { time: { start: opts.startAt } }
				: {}),
		},
	};

	return {
		id: opts.id,
		message_id: opts.messageId,
		session_id: opts.sessionId,
		time_created: opts.createdAt,
		data: JSON.stringify(payload),
	};
}

type PersistedToolPart = StoredToolPart & {
	state: StoredToolPart["state"] & {
		metadata?: { sessionId?: string };
		time?: { start?: number };
	};
};

const tempDirs: string[] = [];

function makeTempStorage(): OpenCodeStorageRoots {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-bg-derive-"));
	tempDirs.push(root);
	return {
		session: path.join(root, "session"),
		message: path.join(root, "message"),
		part: path.join(root, "part"),
	};
}

function writeJson(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function writeSessionMeta(
	storage: OpenCodeStorageRoots,
	fileName: string,
	meta: SessionMetadata,
): void {
	writeJson(path.join(storage.session, "project-a", `${fileName}.json`), meta);
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("deriveBackgroundTasksSqlite", () => {
	it("returns queued task when linked child session exists without activity yet", () => {
		const nowMs = 1_000_000;
		const db = createMockDb({
			sessionRows: [
				{
					id: "ses-main",
					project_id: "proj-1",
					directory: "/tmp/project",
					time_created: nowMs - 10_000,
					time_updated: nowMs - 1_000,
				},
				{
					id: "ses-child",
					project_id: "proj-1",
					parent_id: "ses-main",
					directory: "/tmp/project",
					title: "Background: Compile report",
					time_created: nowMs - 800,
					time_updated: nowMs - 800,
				},
			],
			messagesBySession: {
				"ses-main": [
					makeMessageRow({
						id: "msg-main",
						sessionId: "ses-main",
						createdAt: nowMs - 1_000,
						agent: "sisyphus",
					}),
				],
				"ses-child": [],
			},
			partsByMessage: {
				"msg-main": [
					makePartRow({
						id: "part-main",
						messageId: "msg-main",
						sessionId: "ses-main",
						createdAt: nowMs - 1_000,
						callId: "call-bg",
						tool: "background_task",
						status: "completed",
						input: {
							description: "Compile report",
							run_in_background: true,
							subagent_type: "atlas",
						},
						metadata: { sessionId: "ses-child" },
						startAt: nowMs - 3_000,
					}),
				],
			},
		});

		const result = deriveBackgroundTasksSqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs,
			db: db as unknown as Database,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toHaveLength(1);
		expect(result.value[0]).toMatchObject({
			id: "call-bg",
			description: "Compile report",
			agent: "atlas",
			status: "queued",
			toolCalls: 0,
			lastTool: null,
			lastModel: null,
			sessionId: "ses-child",
		});
		expect(result.value[0].timeline).not.toBe("");
	});

	it("marks linked background task as question when child session has a running canonical question tool", () => {
		const nowMs = 1_000_000;
		const db = createMockDb({
			sessionRows: [
				{
					id: "ses-main",
					project_id: "proj-1",
					directory: "/tmp/project",
					time_created: nowMs - 10_000,
					time_updated: nowMs - 1_000,
				},
				{
					id: "ses-child",
					project_id: "proj-1",
					parent_id: "ses-main",
					directory: "/tmp/project",
					title: "Background: Ask user",
					time_created: nowMs - 800,
					time_updated: nowMs - 500,
				},
			],
			messagesBySession: {
				"ses-main": [
					makeMessageRow({
						id: "msg-main",
						sessionId: "ses-main",
						createdAt: nowMs - 1_000,
						agent: "sisyphus",
					}),
				],
				"ses-child": [
					makeMessageRow({
						id: "msg-child",
						sessionId: "ses-child",
						createdAt: nowMs - 500,
						agent: "atlas",
					}),
				],
			},
			partsByMessage: {
				"msg-main": [
					makePartRow({
						id: "part-main",
						messageId: "msg-main",
						sessionId: "ses-main",
						createdAt: nowMs - 1_000,
						callId: "call-bg-question",
						tool: "background_task",
						status: "completed",
						input: {
							description: "Ask user",
							run_in_background: true,
							subagent_type: "atlas",
						},
						metadata: { sessionId: "ses-child" },
						startAt: nowMs - 2_000,
					}),
				],
				"msg-child": [
					makePartRow({
						id: "part-child-question",
						messageId: "msg-child",
						sessionId: "ses-child",
						createdAt: nowMs - 500,
						callId: "child-question",
						tool: "question",
						status: "running",
					}),
				],
			},
		});

		const result = deriveBackgroundTasksSqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs,
			db: db as unknown as Database,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toHaveLength(1);
		expect(result.value[0]).toMatchObject({
			id: "call-bg-question",
			description: "Ask user",
			agent: "atlas",
			status: "question",
			toolCalls: 1,
			lastTool: "question",
			sessionId: "ses-child",
		});
	});

	it("marks stale unlinked background task as unknown with null toolCalls", () => {
		const nowMs = 2_000_000;
		const startedAt = nowMs - 16 * 60_000;
		const db = createMockDb({
			sessionRows: [
				{
					id: "ses-main",
					project_id: "proj-1",
					directory: "/tmp/project",
					time_created: nowMs - 2_000_000,
					time_updated: nowMs - 1_000,
				},
			],
			messagesBySession: {
				"ses-main": [
					makeMessageRow({
						id: "msg-main",
						sessionId: "ses-main",
						createdAt: startedAt,
						agent: "sisyphus",
					}),
				],
			},
			partsByMessage: {
				"msg-main": [
					makePartRow({
						id: "part-main",
						messageId: "msg-main",
						sessionId: "ses-main",
						createdAt: startedAt,
						callId: "call-stale",
						tool: "background_task",
						status: "completed",
						input: { run_in_background: true, subagent_type: "prometheus" },
						startAt: startedAt,
					}),
				],
			},
		});

		const result = deriveBackgroundTasksSqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs,
			db: db as unknown as Database,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toHaveLength(1);
		expect(result.value[0]).toMatchObject({
			id: "call-stale",
			agent: "prometheus",
			description: "prometheus task",
			status: "unknown",
			toolCalls: null,
			sessionId: null,
		});
		expect(result.value[0].timeline).toBe("");
	});

	it("finds sync child by Task title and derives completed stats", () => {
		const nowMs = 1_000_000;
		const db = createMockDb({
			sessionRows: [
				{
					id: "ses-main",
					project_id: "proj-1",
					directory: "/tmp/project",
					time_created: nowMs - 200_000,
					time_updated: nowMs - 1_000,
				},
				{
					id: "ses-task",
					project_id: "proj-1",
					parent_id: "ses-main",
					directory: "/tmp/project",
					title: "Task: Refine docs",
					time_created: nowMs - 59_500,
					time_updated: nowMs - 20_000,
				},
			],
			messagesBySession: {
				"ses-main": [
					makeMessageRow({
						id: "msg-main",
						sessionId: "ses-main",
						createdAt: nowMs - 60_000,
						agent: "sisyphus",
					}),
				],
				"ses-task": [
					makeMessageRow({
						id: "msg-child",
						sessionId: "ses-task",
						createdAt: nowMs - 25_000,
						agent: "atlas",
					}),
				],
			},
			partsByMessage: {
				"msg-main": [
					makePartRow({
						id: "part-main",
						messageId: "msg-main",
						sessionId: "ses-main",
						createdAt: nowMs - 60_000,
						callId: "call-sync",
						tool: "task",
						status: "completed",
						input: {
							description: "Refine docs",
							run_in_background: false,
							subagent_type: "atlas",
						},
						startAt: nowMs - 59_000,
					}),
				],
				"msg-child": [
					makePartRow({
						id: "part-child-1",
						messageId: "msg-child",
						sessionId: "ses-task",
						createdAt: nowMs - 25_000,
						callId: "child-1",
						tool: "bash",
						status: "completed",
					}),
					makePartRow({
						id: "part-child-2",
						messageId: "msg-child",
						sessionId: "ses-task",
						createdAt: nowMs - 24_000,
						callId: "child-2",
						tool: "read",
						status: "completed",
					}),
				],
			},
		});

		const result = deriveBackgroundTasksSqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs,
			db: db as unknown as Database,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toHaveLength(1);
		expect(result.value[0]).toMatchObject({
			id: "call-sync",
			description: "Refine docs",
			agent: "atlas",
			status: "completed",
			toolCalls: 2,
			lastTool: "read",
			sessionId: "ses-task",
		});
	});
});

describe("deriveBackgroundTasks (file-based)", () => {
	it("uses resume session and title fallback to derive description", () => {
		const storage = makeTempStorage();
		const nowMs = 1_000_000;

		writeJson(path.join(storage.message, "ses-main", "msg-main.json"), {
			id: "msg-main",
			sessionID: "ses-main",
			role: "assistant",
			time: { created: nowMs - 50_000 },
			agent: "sisyphus",
		} satisfies StoredMessageMeta);

		writeJson(path.join(storage.part, "msg-main", "0001.json"), {
			id: "part-main",
			sessionID: "ses-main",
			messageID: "msg-main",
			type: "tool",
			callID: "call-resume",
			tool: "task",
			state: {
				status: "completed",
				input: {
					run_in_background: false,
					resume: "ses-resume",
					category: "quick",
				},
				time: { start: nowMs - 55_000 },
			},
		} satisfies PersistedToolPart);

		writeJson(path.join(storage.message, "ses-resume", "msg-resume.json"), {
			id: "msg-resume",
			sessionID: "ses-resume",
			role: "assistant",
			time: { created: nowMs - 40_000 },
			agent: "sisyphus",
		} satisfies StoredMessageMeta);

		writeJson(path.join(storage.part, "msg-resume", "0001.json"), {
			id: "part-resume",
			sessionID: "ses-resume",
			messageID: "msg-resume",
			type: "tool",
			callID: "resume-1",
			tool: "bash",
			state: {
				status: "completed",
				input: {},
			},
		} satisfies StoredToolPart);

		writeSessionMeta(storage, "resume", {
			id: "ses-resume",
			projectID: "proj-1",
			directory: "/tmp/project",
			parentID: "ses-main",
			title: "Task: Resume from snapshot",
			time: { created: nowMs - 45_000, updated: nowMs - 40_000 },
		});

		const rows = deriveBackgroundTasks({
			storage,
			mainSessionId: "ses-main",
			nowMs,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "call-resume",
			description: "Resume from snapshot",
			agent: "sisyphus-junior (quick)",
			status: "completed",
			toolCalls: 1,
			lastTool: "bash",
			sessionId: "ses-resume",
		});
	});

	it("does not mark file-backed background tasks as question for stale running question tools", () => {
		const storage = makeTempStorage();
		const nowMs = 1_000_000;

		writeJson(path.join(storage.message, "ses-main", "msg-main.json"), {
			id: "msg-main",
			sessionID: "ses-main",
			role: "assistant",
			time: { created: nowMs - 1_000, completed: nowMs - 900 },
			agent: "sisyphus",
		} satisfies StoredMessageMeta);

		writeJson(path.join(storage.part, "msg-main", "0001.json"), {
			id: "part-main",
			sessionID: "ses-main",
			messageID: "msg-main",
			type: "tool",
			callID: "call-bg",
			tool: "background_task",
			state: {
				status: "completed",
				input: {
					description: "Ask stale question",
					run_in_background: true,
					subagent_type: "atlas",
				},
				metadata: { sessionId: "ses-child" },
				time: { start: nowMs - 2_000 },
			},
		} satisfies PersistedToolPart);

		writeJson(path.join(storage.message, "ses-child", "msg-child.json"), {
			id: "msg-child",
			sessionID: "ses-child",
			role: "assistant",
			time: { created: nowMs - 1_000, completed: nowMs - 900 },
			agent: "atlas",
		} satisfies StoredMessageMeta);

		writeJson(path.join(storage.part, "msg-child", "0001.json"), {
			id: "part-child",
			sessionID: "ses-child",
			messageID: "msg-child",
			type: "tool",
			callID: "call-question",
			tool: "question",
			state: {
				status: "running",
				input: {},
				time: { start: nowMs - 700_000 },
			},
		} satisfies PersistedToolPart);

		writeSessionMeta(storage, "child", {
			id: "ses-child",
			projectID: "proj-1",
			directory: "/tmp/project",
			parentID: "ses-main",
			title: "Task: Ask stale question",
			time: { created: nowMs - 2_000, updated: nowMs - 1_000 },
		});

		const rows = deriveBackgroundTasks({
			storage,
			mainSessionId: "ses-main",
			nowMs,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).not.toBe("question");
	});

	it("keeps stale unlinked background task as unknown", () => {
		const storage = makeTempStorage();
		const nowMs = 2_000_000;
		const startedAt = nowMs - 20 * 60_000;

		writeJson(path.join(storage.message, "ses-main", "msg-main.json"), {
			id: "msg-main",
			sessionID: "ses-main",
			role: "assistant",
			time: { created: startedAt },
			agent: "sisyphus",
		} satisfies StoredMessageMeta);

		writeJson(path.join(storage.part, "msg-main", "0001.json"), {
			id: "part-main",
			sessionID: "ses-main",
			messageID: "msg-main",
			type: "tool",
			callID: "call-stale-files",
			tool: "background_task",
			state: {
				status: "completed",
				input: {
					run_in_background: true,
					category: "quick",
				},
				time: { start: startedAt },
			},
		} satisfies PersistedToolPart);

		const rows = deriveBackgroundTasks({
			storage,
			mainSessionId: "ses-main",
			nowMs,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "call-stale-files",
			description: "quick task",
			agent: "sisyphus-junior (quick)",
			status: "unknown",
			toolCalls: null,
			sessionId: null,
		});
		expect(rows[0].timeline).toBe("");
	});
});

describe("deriveTimeSeriesActivitySqlite", () => {
	it("buckets main-session and background tool activity into the expected series", () => {
		const nowMs = 400_000;
		const windowMs = 10_000;
		const bucketMs = 2_000;

		const db = createMockDb({
			sessionRows: [
				{
					id: "ses-main",
					project_id: "proj-1",
					directory: "/tmp/project",
					time_created: nowMs - 100_000,
					time_updated: nowMs - 1_000,
				},
				{
					id: "ses-child",
					project_id: "proj-1",
					parent_id: "ses-main",
					directory: "/tmp/project",
					title: "Background: Analyze",
					time_created: nowMs - 5_000,
					time_updated: nowMs - 1_000,
				},
			],
			messagesBySession: {
				"ses-main": [
					makeMessageRow({
						id: "msg-main-2",
						sessionId: "ses-main",
						createdAt: 396_000,
						agent: "atlas",
					}),
					makeMessageRow({
						id: "msg-main-1",
						sessionId: "ses-main",
						createdAt: 392_000,
						agent: "sisyphus",
					}),
					makeMessageRow({
						id: "msg-main-old",
						sessionId: "ses-main",
						createdAt: 389_000,
						agent: "sisyphus",
					}),
				],
				"ses-child": [
					makeMessageRow({
						id: "msg-child-1",
						sessionId: "ses-child",
						createdAt: 398_000,
						agent: "atlas",
					}),
				],
			},
			partsByMessage: {
				"msg-main-1": [
					makePartRow({
						id: "part-main-1a",
						messageId: "msg-main-1",
						sessionId: "ses-main",
						createdAt: 392_010,
						callId: "main-1a",
						tool: "bash",
						status: "completed",
					}),
					makePartRow({
						id: "part-main-1b",
						messageId: "msg-main-1",
						sessionId: "ses-main",
						createdAt: 392_020,
						callId: "main-1b",
						tool: "read",
						status: "completed",
					}),
				],
				"msg-main-2": [
					makePartRow({
						id: "part-main-2",
						messageId: "msg-main-2",
						sessionId: "ses-main",
						createdAt: 396_010,
						callId: "main-2",
						tool: "write",
						status: "completed",
					}),
				],
				"msg-main-old": [
					makePartRow({
						id: "part-main-old",
						messageId: "msg-main-old",
						sessionId: "ses-main",
						createdAt: 389_010,
						callId: "main-old",
						tool: "edit",
						status: "completed",
					}),
				],
				"msg-child-1": [
					makePartRow({
						id: "part-child-1a",
						messageId: "msg-child-1",
						sessionId: "ses-child",
						createdAt: 398_010,
						callId: "child-1a",
						tool: "bash",
						status: "completed",
					}),
					makePartRow({
						id: "part-child-1b",
						messageId: "msg-child-1",
						sessionId: "ses-child",
						createdAt: 398_020,
						callId: "child-1b",
						tool: "read",
						status: "completed",
					}),
					makePartRow({
						id: "part-child-1c",
						messageId: "msg-child-1",
						sessionId: "ses-child",
						createdAt: 398_030,
						callId: "child-1c",
						tool: "write",
						status: "completed",
					}),
				],
			},
		});

		const result = deriveTimeSeriesActivitySqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: "ses-main",
			nowMs,
			windowMs,
			bucketMs,
			db: db as unknown as Database,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.windowMs).toBe(windowMs);
		expect(result.value.bucketMs).toBe(bucketMs);
		expect(result.value.buckets).toBe(5);

		const series = new Map(
			result.value.series.map((entry) => [entry.id, entry.values] as const),
		);
		expect(series.get("overall-main")).toEqual([0, 2, 0, 1, 3]);
		expect(series.get("agent:sisyphus")).toEqual([0, 2, 0, 0, 0]);
		expect(series.get("agent:atlas")).toEqual([0, 0, 0, 1, 0]);
		expect(series.get("agent:prometheus")).toEqual([0, 0, 0, 0, 0]);
		expect(series.get("background-total")).toEqual([0, 0, 0, 0, 3]);
	});

	it("returns empty buckets when mainSessionId is null", () => {
		const result = deriveTimeSeriesActivitySqlite({
			sqlitePath: "/tmp/opencode.db",
			mainSessionId: null,
			nowMs: 100_000,
			windowMs: 8_000,
			bucketMs: 2_000,
			db: createMockDb() as unknown as Database,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.buckets).toBe(4);
		for (const entry of result.value.series) {
			expect(entry.values).toEqual([0, 0, 0, 0]);
		}
	});
});
