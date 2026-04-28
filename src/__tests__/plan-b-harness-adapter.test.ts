import { describe, expect, it, vi } from "vitest";
import type {
	ExecutionPhase,
	ExecutionState,
	DriftReport,
} from "../server/control-plane/plan-b/types";

// ─── Mock types ───────────────────────────────────────────────────────

type MockExecutionRecord = {
	id: string;
	decisionId: string;
	state: ExecutionState;
	phase: ExecutionPhase;
	idempotencyKey: string;
	error: string | null;
	createdAt: string;
	updatedAt: string;
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
	driftLevel: string;
	recommendedAction: string;
	stalenessMs: number;
	report: unknown;
	createdAt: string;
};

type MockOutcomeRecord = {
	id: string;
	executionId: string;
	matched: boolean;
	expected: string;
	actual: string;
	createdAt: string;
};

type MockDb = {
	executionRecords: MockExecutionRecord[];
	rateLimitByKey: Map<string, MockRateLimitState>;
	driftEvents: MockDriftEvent[];
	outcomeRecords: MockOutcomeRecord[];
};

// ─── Helpers ──────────────────────────────────────────────────────────

function buildMockDb(): MockDb {
	return {
		executionRecords: [],
		rateLimitByKey: new Map(),
		driftEvents: [],
		outcomeRecords: [],
	};
}

function iso(ms = Date.parse("2026-01-01T00:00:00.000Z")): string {
	return new Date(ms).toISOString();
}

function seedExecution(
	db: MockDb,
	overrides: Partial<MockExecutionRecord> = {},
): MockExecutionRecord {
	const record: MockExecutionRecord = {
		id: "exec-1",
		decisionId: "dec-1",
		state: "pending",
		phase: "select_executable",
		idempotencyKey: "ik-1",
		error: null,
		createdAt: iso(),
		updatedAt: iso(),
		...overrides,
	};
	db.executionRecords.push(record);
	return record;
}

// ─── Mock ledger-sqlite ───────────────────────────────────────────────

vi.mock("../server/control-plane/plan-b/ledger-sqlite", () => {
	return {
		getExecutionRecord: vi.fn((db: MockDb, id: string) => {
			return db.executionRecords.find((r) => r.id === id) ?? null;
		}),
		updateExecutionRecord: vi.fn(
			(
				db: MockDb,
				patch: Partial<MockExecutionRecord> & { id: string },
			) => {
				const current = db.executionRecords.find((r) => r.id === patch.id);
				if (!current) return null;
				Object.assign(current, patch, { updatedAt: patch.updatedAt ?? iso() });
				return current;
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
		appendDriftEvent: vi.fn(
			(
				db: MockDb,
				input: Omit<MockDriftEvent, "createdAt"> & {
					createdAt?: string;
				},
			) => {
				const event: MockDriftEvent = {
					...input,
					createdAt: input.createdAt ?? iso(),
				};
				db.driftEvents.push(event);
				return event;
			},
		),
		withPlanBLedgerTransaction: vi.fn(
			<T>(_db: MockDb, fn: () => T): T => {
				return fn();
			},
		),
	};
});

// Mock execution-lifecycle's reconcileExecutionOutcome and transitionToDispatched
vi.mock("../server/control-plane/plan-b/execution-lifecycle", () => {
	return {
		transitionToDispatched: vi.fn(
			(args: {
				db: MockDb;
				id: string;
			}) => {
				const { db, id } = args;
				const current = db.executionRecords.find((r) => r.id === id);
				if (!current) throw new Error("Execution not found");
				current.state = "dispatched";
				current.phase = "dispatch";
				current.updatedAt = iso();
				return current;
			},
		),
		reconcileExecutionOutcome: vi.fn(
			(args: {
				db: MockDb;
				executionId: string;
				expected: string;
				actual: string;
				id?: string;
			}) => {
				const { db, executionId, expected, actual } = args;
				const id = args.id ?? "outcome-1";
				const matched = expected === actual;
				const record: MockOutcomeRecord = {
					id,
					executionId,
					matched,
					expected,
					actual,
					createdAt: iso(),
				};
				db.outcomeRecords.push(record);
				return record;
			},
		),
	};
});

const adapter = await import("../server/control-plane/plan-b/harness-adapter");

// ─── Tests ────────────────────────────────────────────────────────────

describe("harness-adapter", () => {
	describe("validatePrimitive", () => {
		it("rejects unknown primitive", () => {
			expect(() => adapter.validatePrimitive("bogus")).toThrow(
				/Unknown primitive/,
			);
		});

		it("accepts known primitives", () => {
			expect(adapter.validatePrimitive("update_ledger_status")).toBe(
				"update_ledger_status",
			);
			expect(adapter.validatePrimitive("append_drift_event")).toBe(
				"append_drift_event",
			);
			expect(adapter.validatePrimitive("publish_advisory")).toBe(
				"publish_advisory",
			);
		});
	});

	describe("dispatch", () => {
		it("throws for unknown primitive", () => {
			const db = buildMockDb();
			seedExecution(db);

			expect(() =>
				adapter.dispatch({
					db: db as never,
					executionId: "exec-1",
					decisionType: "mark_plan_stale",
					targetId: "source-1",
					primitive: "bogus",
					idempotencyKey: "ik-1",
					context: {},
				}),
			).toThrow(/Unknown primitive/);
		});

		it("throws when execution not found", () => {
			const db = buildMockDb();

			expect(() =>
				adapter.dispatch({
					db: db as never,
					executionId: "nonexistent",
					decisionType: "mark_plan_stale",
					targetId: "source-1",
					primitive: "update_ledger_status",
					idempotencyKey: "ik-1",
					context: {},
				}),
			).toThrow(/not found/);
		});

		it("throws on idempotency key mismatch", () => {
			const db = buildMockDb();
			seedExecution(db, { idempotencyKey: "ik-original" });

			expect(() =>
				adapter.dispatch({
					db: db as never,
					executionId: "exec-1",
					decisionType: "mark_plan_stale",
					targetId: "source-1",
					primitive: "update_ledger_status",
					idempotencyKey: "ik-wrong",
					context: {},
				}),
			).toThrow(/Idempotency key mismatch/);
		});

		it("update_ledger_status dispatches and sets state to dispatched", () => {
			const db = buildMockDb();
			seedExecution(db);

			const result = adapter.dispatch({
				db: db as never,
				executionId: "exec-1",
				decisionType: "mark_plan_stale",
				targetId: "source-1",
				primitive: "update_ledger_status",
				idempotencyKey: "ik-1",
				context: { status: "open" },
			});

			expect(result).toEqual({
				noOp: false,
				executionId: "exec-1",
				state: "dispatched",
			});

			const exec = db.executionRecords[0];
			expect(exec.state).toBe("dispatched");
			expect(exec.phase).toBe("dispatch");

			const rateKey = "mark_plan_stale:source-1";
			const rateState = db.rateLimitByKey.get(rateKey);
			expect(rateState).toBeDefined();
			expect(rateState!.tokensUsed).toBe(1);
			expect(rateState!.metadata).toMatchObject({
				primitive: "update_ledger_status",
				status: "open",
			});
		});

		it("append_drift_event dispatches and stores drift event", () => {
			const db = buildMockDb();
			seedExecution(db);

			const driftReport: DriftReport = {
				sourceId: "source-1",
				fingerprint: { hash: "abc", observedAt: 1000, sourceId: "source-1" },
				previousFingerprint: null,
				stalenessMs: 5000,
				driftLevel: "mild",
				recommendedAction: "refresh",
				reportedAt: iso(),
			};

			const result = adapter.dispatch({
				db: db as never,
				executionId: "exec-1",
				decisionType: "check_drift",
				targetId: "source-1",
				primitive: "append_drift_event",
				idempotencyKey: "ik-1",
				context: {},
				driftReport,
			});

			expect(result).toEqual({
				noOp: false,
				executionId: "exec-1",
				state: "dispatched",
			});

			expect(db.driftEvents).toHaveLength(1);
			expect(db.driftEvents[0]).toMatchObject({
				sourceId: "source-1",
				fingerprintHash: "abc",
				driftLevel: "mild",
			});
		});

		it("append_drift_event throws when driftReport is missing", () => {
			const db = buildMockDb();
			seedExecution(db);

			expect(() =>
				adapter.dispatch({
					db: db as never,
					executionId: "exec-1",
					decisionType: "check_drift",
					targetId: "source-1",
					primitive: "append_drift_event",
					idempotencyKey: "ik-1",
					context: {},
				}),
			).toThrow(/requires driftReport/);
		});

		it("publish_advisory throws PrimitiveUnavailable", () => {
			const db = buildMockDb();
			seedExecution(db);

			expect(() =>
				adapter.dispatch({
					db: db as never,
					executionId: "exec-1",
					decisionType: "notify",
					targetId: "source-1",
					primitive: "publish_advisory",
					idempotencyKey: "ik-1",
					context: {},
				}),
			).toThrow(/PrimitiveUnavailable/);
		});

		it("returns noOp=true when execution is already in post-dispatch state", () => {
			const db = buildMockDb();
			seedExecution(db, { state: "dispatched", phase: "dispatch" });

			const result = adapter.dispatch({
				db: db as never,
				executionId: "exec-1",
				decisionType: "mark_plan_stale",
				targetId: "source-1",
				primitive: "update_ledger_status",
				idempotencyKey: "ik-1",
				context: {},
			});

			expect(result).toEqual({
				noOp: true,
				executionId: "exec-1",
				state: "dispatched",
			});
		});

		it("returns noOp=true for succeeded state", () => {
			const db = buildMockDb();
			seedExecution(db, { state: "succeeded", phase: "reconcile" });

			const result = adapter.dispatch({
				db: db as never,
				executionId: "exec-1",
				decisionType: "mark_plan_stale",
				targetId: "source-1",
				primitive: "update_ledger_status",
				idempotencyKey: "ik-1",
				context: {},
			});

			expect(result).toEqual({
				noOp: true,
				executionId: "exec-1",
				state: "succeeded",
			});
		});

		it("returns noOp=true for failed state", () => {
			const db = buildMockDb();
			seedExecution(db, { state: "failed", phase: "reconcile" });

			const result = adapter.dispatch({
				db: db as never,
				executionId: "exec-1",
				decisionType: "mark_plan_stale",
				targetId: "source-1",
				primitive: "update_ledger_status",
				idempotencyKey: "ik-1",
				context: {},
			});

			expect(result).toEqual({
				noOp: true,
				executionId: "exec-1",
				state: "failed",
			});
		});

		it("returns noOp=true for timed_out state", () => {
			const db = buildMockDb();
			seedExecution(db, { state: "timed_out", phase: "reconcile" });

			const result = adapter.dispatch({
				db: db as never,
				executionId: "exec-1",
				decisionType: "mark_plan_stale",
				targetId: "source-1",
				primitive: "update_ledger_status",
				idempotencyKey: "ik-1",
				context: {},
			});

			expect(result).toEqual({
				noOp: true,
				executionId: "exec-1",
				state: "timed_out",
			});
		});
	});

	describe("recordOutcome", () => {
		it("delegates to reconcileExecutionOutcome", () => {
			const db = buildMockDb();
			const outcome = adapter.recordOutcome({
				db: db as never,
				executionId: "exec-1",
				expected: "dispatched",
				actual: "dispatched",
			});

			expect(outcome).toMatchObject({
				executionId: "exec-1",
				matched: true,
				expected: "dispatched",
				actual: "dispatched",
			});
			expect(db.outcomeRecords).toHaveLength(1);
		});
	});
});
