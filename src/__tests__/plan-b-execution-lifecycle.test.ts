import { describe, expect, it, vi } from "vitest";
import type {
	ExecutionRecord,
	ExecutionPhase,
	ExecutionState,
	OutcomeRecord,
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
	outcomeRecords: MockOutcomeRecord[];
};

// ─── Helpers ──────────────────────────────────────────────────────────

function buildMockDb(): MockDb {
	return { executionRecords: [], outcomeRecords: [] };
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
		listExecutionRecords: vi.fn(
			(
				db: MockDb,
				opts?: { decisionId?: string; state?: ExecutionState },
			) => {
				return db.executionRecords.filter((r) => {
					if (opts?.decisionId && r.decisionId !== opts.decisionId)
						return false;
					if (opts?.state && r.state !== opts.state) return false;
					return true;
				});
			},
		),
		insertOutcomeRecord: vi.fn(
			(
				db: MockDb,
				input: Omit<MockOutcomeRecord, "createdAt"> & {
					createdAt?: string;
				},
			) => {
				const record: MockOutcomeRecord = {
					...input,
					createdAt: input.createdAt ?? iso(),
				};
				db.outcomeRecords.push(record);
				return record;
			},
		),
	};
});

const lifecycle = await import(
	"../server/control-plane/plan-b/execution-lifecycle"
);

// ─── Tests ────────────────────────────────────────────────────────────

describe("execution-lifecycle", () => {
	describe("createExecution", () => {
		it("creates an execution with default phase=select_executable and state=pending", () => {
			const db = buildMockDb();
			const record = lifecycle.createExecution({
				db: db as never,
				decisionId: "dec-1",
				idempotencyKey: "ik-1",
			});

			expect(record).toMatchObject({
				decisionId: "dec-1",
				idempotencyKey: "ik-1",
				phase: "select_executable",
				state: "pending",
				error: null,
			});
			expect(record.id).toBeTruthy();
			expect(record.createdAt).toBeTruthy();
			expect(record.updatedAt).toBeTruthy();
			expect(db.executionRecords).toHaveLength(1);
		});

		it("accepts an explicit id", () => {
			const db = buildMockDb();
			const record = lifecycle.createExecution({
				db: db as never,
				decisionId: "dec-1",
				idempotencyKey: "ik-1",
				id: "my-custom-id",
			});

			expect(record.id).toBe("my-custom-id");
		});
	});

	describe("valid phase transitions", () => {
		it("transitions from select_executable to preflight", () => {
			const db = buildMockDb();
			seedExecution(db);

			const updated = lifecycle.transitionPhase({
				db: db as never,
				id: "exec-1",
				phase: "preflight",
			});

			expect(updated.phase).toBe("preflight");
			expect(updated.state).toBe("pending");
		});

		it("transitions through all phases in order", () => {
			const db = buildMockDb();
			seedExecution(db);

			const phases: ExecutionPhase[] = [
				"preflight",
				"dispatch",
				"monitor",
				"reconcile",
			];
			let current = db.executionRecords[0];

			for (const nextPhase of phases) {
				current = lifecycle.transitionPhase({
					db: db as never,
					id: "exec-1",
					phase: nextPhase,
				});
				expect(current.phase).toBe(nextPhase);
			}
		});

		it("sets state and error when provided", () => {
			const db = buildMockDb();
			seedExecution(db);

			const updated = lifecycle.transitionPhase({
				db: db as never,
				id: "exec-1",
				phase: "preflight",
				state: "approved",
				error: null,
			});

			expect(updated.phase).toBe("preflight");
			expect(updated.state).toBe("approved");
			expect(updated.error).toBeNull();
		});
	});

	describe("invalid phase transitions", () => {
		it("throws when skipping a phase", () => {
			const db = buildMockDb();
			seedExecution(db);

			expect(() =>
				lifecycle.transitionPhase({
					db: db as never,
					id: "exec-1",
					phase: "dispatch",
				}),
			).toThrow(/cannot be skipped or reversed/);
		});

		it("throws when reversing a phase", () => {
			const db = buildMockDb();
			seedExecution(db, { phase: "dispatch" });

			expect(() =>
				lifecycle.transitionPhase({
					db: db as never,
					id: "exec-1",
					phase: "preflight",
				}),
			).toThrow(/cannot be skipped or reversed/);
		});

		it("throws for unknown phase value", () => {
			const db = buildMockDb();
			seedExecution(db);

			expect(() =>
				lifecycle.transitionPhase({
					db: db as never,
					id: "exec-1",
					phase: "unknown_phase" as ExecutionPhase,
				}),
			).toThrow(/not in EXECUTION_PHASE_ORDER/);
		});

		it("throws when execution does not exist", () => {
			const db = buildMockDb();

			expect(() =>
				lifecycle.transitionPhase({
					db: db as never,
					id: "nonexistent",
					phase: "preflight",
				}),
			).toThrow(/not found/);
		});
	});

	describe("reconcileExecutionOutcome", () => {
		it("stores outcome with matched=true when expected equals actual", () => {
			const db = buildMockDb();
			const outcome = lifecycle.reconcileExecutionOutcome({
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
			expect(outcome.id).toBeTruthy();
			expect(outcome.createdAt).toBeTruthy();
			expect(db.outcomeRecords).toHaveLength(1);
		});

		it("stores outcome with matched=false when expected differs from actual", () => {
			const db = buildMockDb();
			const outcome = lifecycle.reconcileExecutionOutcome({
				db: db as never,
				executionId: "exec-1",
				expected: "succeeded",
				actual: "failed",
			});

			expect(outcome).toMatchObject({
				executionId: "exec-1",
				matched: false,
				expected: "succeeded",
				actual: "failed",
			});
		});

		it("accepts an explicit outcome id", () => {
			const db = buildMockDb();
			const outcome = lifecycle.reconcileExecutionOutcome({
				db: db as never,
				executionId: "exec-1",
				expected: "a",
				actual: "b",
				id: "outcome-custom",
			});

			expect(outcome.id).toBe("outcome-custom");
		});
	});

	describe("getExecution / listExecutions", () => {
		it("getExecution returns null for missing id", () => {
			const db = buildMockDb();
			expect(lifecycle.getExecution(db as never, "nope")).toBeNull();
		});

		it("getExecution returns the record when found", () => {
			const db = buildMockDb();
			seedExecution(db);
			const found = lifecycle.getExecution(db as never, "exec-1");
			expect(found).not.toBeNull();
			expect(found!.id).toBe("exec-1");
		});

		it("listExecutions filters by decisionId", () => {
			const db = buildMockDb();
			seedExecution(db, { id: "e1", decisionId: "d1" });
			seedExecution(db, { id: "e2", decisionId: "d2" });

			const list = lifecycle.listExecutions(db as never, {
				decisionId: "d1",
			});
			expect(list).toHaveLength(1);
			expect(list[0].id).toBe("e1");
		});

		it("listExecutions filters by state", () => {
			const db = buildMockDb();
			seedExecution(db, { id: "e1", state: "pending" });
			seedExecution(db, { id: "e2", state: "dispatched" });

			const list = lifecycle.listExecutions(db as never, {
				state: "dispatched",
			});
			expect(list).toHaveLength(1);
			expect(list[0].id).toBe("e2");
		});
	});
});
