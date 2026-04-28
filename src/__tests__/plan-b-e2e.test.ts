import { describe, expect, it, vi } from "vitest";
import type {
	DashboardMultiProjectPayload,
	ProjectSnapshot,
	SessionSummary,
} from "../types";

type MockDecisionRecord = {
	id: string;
	decisionType: string;
	sourceId: string;
	sessionId: string | null;
	riskClass: "low" | "medium" | "high" | "critical";
	approved: boolean;
	preflightResult: {
		approved: boolean;
		checks: Record<string, boolean>;
		downgradeTo: "advisory" | "human_review" | null;
		reason: string | null;
	} | null;
	createdAt: string;
	updatedAt: string;
};

type MockExecutionRecord = {
	id: string;
	decisionId: string;
	state:
		| "pending"
		| "preflighting"
		| "approved"
		| "denied"
		| "dispatched"
		| "succeeded"
		| "failed"
		| "timed_out";
	phase:
		| "select_executable"
		| "preflight"
		| "dispatch"
		| "monitor"
		| "reconcile";
	idempotencyKey: string;
	error: string | null;
	createdAt: string;
	updatedAt: string;
};

type MockOutcomeRecord = {
	id: string;
	executionId: string;
	matched: boolean;
	expected: string;
	actual: string;
	createdAt: string;
};

type MockRateLimitState = {
	key: string;
	tokensUsed: number;
	windowStartedAt: string | null;
	lastDecisionAt: string | null;
	lastExecutionAt: string | null;
	cooldownUntil: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
};

type MockDriftEvent = {
	id: string;
	sourceId: string;
	fingerprintHash: string;
	previousFingerprintHash: string | null;
	driftLevel: "none" | "mild" | "moderate" | "severe";
	recommendedAction: "none" | "refresh" | "downgrade" | "alert";
	stalenessMs: number;
	report: {
		sourceId: string;
		fingerprint: { hash: string; observedAt: number; sourceId: string };
		previousFingerprint: {
			hash: string;
			observedAt: number;
			sourceId: string;
		} | null;
		stalenessMs: number;
		driftLevel: "none" | "mild" | "moderate" | "severe";
		recommendedAction: "none" | "refresh" | "downgrade" | "alert";
		reportedAt: string;
	} | null;
	createdAt: string;
};

type MockDb = {
	decisionRecords: MockDecisionRecord[];
	executionRecords: MockExecutionRecord[];
	outcomeRecords: MockOutcomeRecord[];
	rateLimitByKey: Map<string, MockRateLimitState>;
	driftEvents: MockDriftEvent[];
	query: (sql: string) => {
		get: (value?: unknown) => { found: number } | null;
	};
	close: () => void;
};

const BASE_NOW_MS = Date.parse("2026-01-01T00:00:00.000Z");
const SOURCE_ID = "source-1";

function buildMockDb(): MockDb {
	const db: MockDb = {
		decisionRecords: [],
		executionRecords: [],
		outcomeRecords: [],
		rateLimitByKey: new Map(),
		driftEvents: [],
		query: (sql: string) => ({
			get: (value?: unknown) => {
				if (
					sql.includes("FROM execution_log") &&
					sql.includes("idempotency_key")
				) {
					const key = typeof value === "string" ? value : "";
					return db.executionRecords.some(
						(record) => record.idempotencyKey === key,
					)
						? { found: 1 }
						: null;
				}
				return null;
			},
		}),
		close: () => {},
	};

	return db;
}

function iso(ms = BASE_NOW_MS): string {
	return new Date(ms).toISOString();
}

vi.mock("../server/control-plane/plan-b/ledger-sqlite", () => {
	return {
		createPlanBLedgerSqlite: vi.fn(() => buildMockDb()),
		insertDecisionRecord: vi.fn(
			(
				db: MockDb,
				input: Omit<MockDecisionRecord, "createdAt" | "updatedAt"> & {
					createdAt?: string;
					updatedAt?: string;
				},
			) => {
				const record: MockDecisionRecord = {
					...input,
					createdAt: input.createdAt ?? iso(),
					updatedAt: input.updatedAt ?? iso(),
				};
				db.decisionRecords.push(record);
				return record;
			},
		),
		listDecisionRecords: vi.fn(
			(db: MockDb, opts?: { sourceId?: string; sessionId?: string }) => {
				return db.decisionRecords.filter((record) => {
					if (opts?.sourceId && record.sourceId !== opts.sourceId) return false;
					if (opts?.sessionId && record.sessionId !== opts.sessionId)
						return false;
					return true;
				});
			},
		),
		insertExecutionRecord: vi.fn(
			(
				db: MockDb,
				input: Omit<MockExecutionRecord, "createdAt" | "updatedAt"> & {
					createdAt?: string;
					updatedAt?: string;
				},
			) => {
				const record: MockExecutionRecord = {
					...input,
					createdAt: input.createdAt ?? iso(),
					updatedAt: input.updatedAt ?? iso(),
				};
				db.executionRecords.push(record);
				return record;
			},
		),
		getExecutionRecord: vi.fn((db: MockDb, id: string) => {
			return db.executionRecords.find((record) => record.id === id) ?? null;
		}),
		updateExecutionRecord: vi.fn(
			(db: MockDb, patch: Partial<MockExecutionRecord> & { id: string }) => {
				const current = db.executionRecords.find(
					(record) => record.id === patch.id,
				);
				if (!current) return null;
				Object.assign(current, patch, { updatedAt: patch.updatedAt ?? iso() });
				return current;
			},
		),
		listExecutionRecords: vi.fn(
			(
				db: MockDb,
				opts?: { decisionId?: string; state?: MockExecutionRecord["state"] },
			) => {
				return db.executionRecords.filter((record) => {
					if (opts?.decisionId && record.decisionId !== opts.decisionId)
						return false;
					if (opts?.state && record.state !== opts.state) return false;
					return true;
				});
			},
		),
		insertOutcomeRecord: vi.fn(
			(
				db: MockDb,
				input: Omit<MockOutcomeRecord, "createdAt"> & { createdAt?: string },
			) => {
				const record: MockOutcomeRecord = {
					...input,
					createdAt: input.createdAt ?? iso(),
				};
				db.outcomeRecords.push(record);
				return record;
			},
		),
		listOutcomeRecords: vi.fn((db: MockDb, opts?: { executionId?: string }) => {
			return db.outcomeRecords.filter((record) => {
				if (opts?.executionId && record.executionId !== opts.executionId)
					return false;
				return true;
			});
		}),
		listDriftEvents: vi.fn(
			(db: MockDb, opts?: { sourceId?: string; limit?: number }) => {
				const filtered = db.driftEvents.filter((event) => {
					if (opts?.sourceId && event.sourceId !== opts.sourceId) return false;
					return true;
				});
				const ordered = [...filtered].reverse();
				if (opts?.limit && opts.limit > 0) {
					return ordered.slice(0, opts.limit);
				}
				return ordered;
			},
		),
		appendDriftEvent: vi.fn(
			(
				db: MockDb,
				input: Omit<MockDriftEvent, "createdAt"> & { createdAt?: string },
			) => {
				const event: MockDriftEvent = {
					...input,
					createdAt: input.createdAt ?? iso(),
				};
				db.driftEvents.push(event);
				return event;
			},
		),
		getRateLimitState: vi.fn(
			(db: MockDb, key: string) => db.rateLimitByKey.get(key) ?? null,
		),
		setRateLimitState: vi.fn(
			(
				db: MockDb,
				input: Omit<MockRateLimitState, "createdAt" | "updatedAt"> & {
					createdAt?: string;
					updatedAt?: string;
				},
			) => {
				const existing = db.rateLimitByKey.get(input.key);
				const record: MockRateLimitState = {
					...input,
					createdAt: input.createdAt ?? existing?.createdAt ?? iso(),
					updatedAt: input.updatedAt ?? iso(),
				};
				db.rateLimitByKey.set(input.key, record);
				return record;
			},
		),
		listActiveSafetySuppressions: vi.fn(() => []),
		withPlanBLedgerTransaction: vi.fn(
			<T>(_db: MockDb, fn: () => T): T => {
				return fn();
			},
		),
	};
});

const planB = await import("../server/control-plane/plan-b");

function makeSessionSummary(
	overrides: Partial<SessionSummary> = {},
): SessionSummary {
	return {
		sessionId: "ses-main",
		sessionLabel: "Main",
		agent: "sisyphus",
		status: "idle",
		currentModel: "gpt-5",
		currentTool: "-",
		lastUpdated: iso(),
		lastUpdatedMs: BASE_NOW_MS,
		...overrides,
	};
}

function makeProjectSnapshot(
	overrides: Partial<ProjectSnapshot> = {},
): ProjectSnapshot {
	const mainSession = {
		agent: "sisyphus",
		currentModel: "gpt-5",
		currentTool: "-",
		lastUpdated: iso(),
		sessionLabel: "Main",
		sessionId: "ses-main",
		status: "idle" as const,
		...(overrides.mainSession ?? {}),
	};

	return {
		sourceId: SOURCE_ID,
		label: "Project One",
		projectRoot: "/tmp/project-one",
		mainSession,
		sessions: [makeSessionSummary()],
		aggregateStatus: "idle",
		planProgress: {
			name: "plan-b",
			completed: 1,
			total: 3,
			path: "/tmp/project-one/.sisyphus/plans/plan-b.md",
			status: "in progress",
			steps: [],
			planStale: false,
			planComplete: false,
		},
		unintiatedPlans: [],
		timeSeries: {
			windowMs: 300_000,
			bucketMs: 2_000,
			buckets: 150,
			anchorMs: BASE_NOW_MS,
			serverNowMs: BASE_NOW_MS,
			series: [],
		},
		backgroundTasks: [],
		sessionTimeSeries: {
			windowMs: 300_000,
			bucketMs: 2_000,
			buckets: 150,
			anchorMs: BASE_NOW_MS,
			serverNowMs: BASE_NOW_MS,
			sessions: [],
		},
		lastUpdatedMs: BASE_NOW_MS,
		...overrides,
	};
}

function makePayload(project: ProjectSnapshot): DashboardMultiProjectPayload {
	return {
		projects: [project],
		serverNowMs: BASE_NOW_MS,
		pollIntervalMs: 2000,
	};
}

describe("Plan B E2E smoke test", () => {
	it("happy path: tier1 + fresh observation + planStale => full execution lifecycle with all records", async () => {
		const db = planB.createPlanBLedgerSqlite(":memory:") as unknown as MockDb;
		const payload = makePayload(
			makeProjectSnapshot({
				planProgress: {
					name: "plan-b",
					completed: 1,
					total: 3,
					path: "/tmp/project-one/.sisyphus/plans/plan-b.md",
					status: "in progress",
					steps: [],
					planStale: true,
					planComplete: false,
				},
			}),
		);

		const result = await planB.observeAndRunPlanBControlLoop({
			getMultiProjectPayload: async () => payload,
			sourceId: SOURCE_ID,
			db: db as never,
			currentTier: "tier1",
			nowMs: BASE_NOW_MS,
		});

		// 1. One decision is produced for mark_plan_stale
		expect(result.decisions).toHaveLength(1);
		expect(result.decisions[0]).toMatchObject({
			decisionType: "mark_plan_stale",
			action: "dispatched",
			reason: null,
			outcomeMatched: true,
		});
		const executionId = result.decisions[0].executionId;
		expect(executionId).toBeTruthy();

		// 2. One decision_log row exists and is approved
		const decisions = planB.listDecisionRecords(db as never, {
			sourceId: SOURCE_ID,
		});
		expect(decisions).toHaveLength(1);
		expect(decisions[0].approved).toBe(true);
		expect(decisions[0].decisionType).toBe("mark_plan_stale");
		expect(decisions[0].preflightResult).not.toBeNull();
		expect(decisions[0].preflightResult?.approved).toBe(true);

		// 3. One execution_log row exists
		const executions = planB.listExecutionRecords(db as never);
		expect(executions).toHaveLength(1);

		// 4. Final execution state is succeeded
		// 5. Final execution phase is reconcile
		const finalExecution = planB.getExecutionRecord(
			db as never,
			executionId ?? "",
		);
		expect(finalExecution).not.toBeNull();
		if (!finalExecution) throw new Error("finalExecution should not be null");
		expect(finalExecution.state).toBe("succeeded");
		expect(finalExecution.phase).toBe("reconcile");

		// 6. Phase sequence satisfied via EXECUTION_PHASE_ORDER
		expect(planB.EXECUTION_PHASE_ORDER[0]).toBe("select_executable");
		expect(
			planB.EXECUTION_PHASE_ORDER[
				planB.EXECUTION_PHASE_ORDER.length - 1
			],
		).toBe("reconcile");
		expect(finalExecution.phase).toBe(
			planB.EXECUTION_PHASE_ORDER[planB.EXECUTION_PHASE_ORDER.length - 1],
		);

		// 7. One outcome_log row exists with matched === true
		const outcomes = planB.listOutcomeRecords(db as never);
		expect(outcomes).toHaveLength(1);
		expect(outcomes[0]).toMatchObject({
			matched: true,
			expected: "dispatched",
			actual: "dispatched",
		});

		// 8. Relevant rate_limit_state row exists for mark_plan_stale:<sourceId>
		const rateLimitState = planB.getRateLimitState(
			db as never,
			`mark_plan_stale:${SOURCE_ID}`,
		);
		expect(rateLimitState).not.toBeNull();
		if (!rateLimitState) throw new Error("rateLimitState should not be null");
		expect(rateLimitState.lastExecutionAt).toBeTruthy();
		expect(rateLimitState.tokensUsed).toBeGreaterThanOrEqual(1);
	});
});
