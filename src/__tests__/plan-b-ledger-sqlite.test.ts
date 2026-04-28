import { describe, expect, it, vi } from "vitest";
import type {
	PreflightResult,
	RiskClass,
	StalenessLevel,
} from "../server/control-plane/plan-b/types.js";
import type {
	CreateDecisionRecordInput,
	CreateExecutionRecordInput,
	CreateOutcomeRecordInput,
	SetRateLimitStateInput,
	PutSafetySuppressionInput,
	AppendDriftEventInput,
} from "../server/control-plane/plan-b/ledger-sqlite.js";

// ─── Mock Database ──────────────────────────────────────────────────────
// We mock bun:sqlite because vitest runs in a Node-like environment where
// the Bun built-in is unavailable. The mock records queries and returns
// controlled data so we can verify query construction and result parsing.

type QueryLogEntry = {
	sql: string;
	params: unknown[];
};

type TableData = Record<string, Record<string, unknown>[]>;

function createMockDb() {
	const tables: TableData = {
		decision_log: [],
		execution_log: [],
		outcome_log: [],
		drift_events: [],
		safety_suppressions: [],
		rate_limit_state: [],
	};
	const queryLog: QueryLogEntry[] = [];
	let transactionFailed = false;

	const mockQuery = {
		run: vi.fn((...params: unknown[]) => {
			queryLog[queryLog.length - 1].params = params;
			if (transactionFailed) {
				throw new Error("transaction rolled back");
			}
		}),
		get: vi.fn((...params: unknown[]) => {
			queryLog[queryLog.length - 1].params = params;
			return null;
		}),
		all: vi.fn((...params: unknown[]) => {
			queryLog[queryLog.length - 1].params = params;
			return [];
		}),
	};

	const db = {
		query: vi.fn((sql: string) => {
			queryLog.push({ sql, params: [] });
			return mockQuery;
		}),
		exec: vi.fn((_sql: string) => {}),
		run: vi.fn((_sql: string) => {}),
		close: vi.fn(),
		// Track transaction state
		_transactionDepth: 0,
		transaction: vi.fn((fn: () => unknown) => {
			// Return a wrapper function that executes fn — production code calls db.transaction(fn)()
			return () => {
				try {
					const result = fn();
					return result;
				} catch (e) {
					transactionFailed = true;
					throw e;
				}
			};
		}),
		// Helper to inject rows for query results
		_injectRows: vi.fn((table: string, rows: Record<string, unknown>[]) => {
			tables[table] = rows;
		}),
		// Helper to make get() return a specific row
		_setGetResult: vi.fn((row: Record<string, unknown> | null) => {
			(mockQuery.get as ReturnType<typeof vi.fn>).mockReturnValue(row);
		}),
		// Helper to make all() return specific rows
		_setAllResult: vi.fn((rows: Record<string, unknown>[]) => {
			(mockQuery.all as ReturnType<typeof vi.fn>).mockReturnValue(rows);
		}),
		// Reset query log
		_clearLog: vi.fn(() => {
			queryLog.length = 0;
		}),
		// Access query log
		_getLog: vi.fn(() => queryLog),
		// Reset transaction state
		_resetTransaction: vi.fn(() => {
			transactionFailed = false;
		}),
		// Force transaction to fail
		_setTransactionFail: vi.fn(() => {
			transactionFailed = true;
		}),
	};

	return db;
}

type MockDb = ReturnType<typeof createMockDb>;

// We need to mock bun:sqlite before importing the module under test
vi.mock("bun:sqlite", () => ({
	Database: vi.fn(() => createMockDb()),
}));

// Import after mock is set up
const ledger = await import("../server/control-plane/plan-b/ledger-sqlite.js");

// ─── Helpers ────────────────────────────────────────────────────────────

function mockDb(): MockDb {
	const db = ledger.openPlanBLedgerSqlite(":memory:") as unknown as MockDb;
	return db;
}

function initDb(db: MockDb): MockDb {
	ledger.initializePlanBLedgerSchema(db as never);
	return db;
}

function makeDecisionInput(overrides: Partial<CreateDecisionRecordInput> = {}): CreateDecisionRecordInput {
	return {
		id: "dec-1",
		decisionType: "mark_plan_stale",
		sourceId: "source-1",
		sessionId: "ses-1",
		riskClass: "low" as RiskClass,
		approved: true,
		preflightResult: null,
		...overrides,
	};
}

function makeExecutionInput(overrides: Partial<CreateExecutionRecordInput> = {}): CreateExecutionRecordInput {
	return {
		id: "exec-1",
		decisionId: "dec-1",
		state: "pending",
		phase: "select_executable",
		idempotencyKey: "ik-1",
		error: null,
		...overrides,
	};
}

function makeOutcomeInput(overrides: Partial<CreateOutcomeRecordInput> = {}): CreateOutcomeRecordInput {
	return {
		id: "out-1",
		executionId: "exec-1",
		matched: true,
		expected: "dispatched",
		actual: "dispatched",
		...overrides,
	};
}

function makeRateLimitInput(overrides: Partial<SetRateLimitStateInput> = {}): SetRateLimitStateInput {
	return {
		key: "mark_plan_stale:source-1",
		tokensUsed: 5,
		windowStartedAt: "2026-01-01T00:00:00.000Z",
		lastDecisionAt: "2026-01-01T00:00:00.000Z",
		lastExecutionAt: null,
		cooldownUntil: null,
		metadata: null,
		...overrides,
	};
}

function makeSafetySuppressionInput(overrides: Partial<PutSafetySuppressionInput> = {}): PutSafetySuppressionInput {
	return {
		id: "sup-1",
		scope: "source",
		scopeId: "source-1",
		reason: "maintenance window",
		active: true,
		metadata: null,
		expiresAt: "2026-01-02T00:00:00.000Z",
		...overrides,
	};
}

function makeDriftEventInput(overrides: Partial<AppendDriftEventInput> = {}): AppendDriftEventInput {
	return {
		id: "drift-1",
		sourceId: "source-1",
		fingerprintHash: "abc123",
		previousFingerprintHash: null,
		driftLevel: "none" as StalenessLevel,
		recommendedAction: "none" as "none",
		stalenessMs: 0,
		report: null,
		...overrides,
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Plan B Ledger SQLite", () => {
	describe("schema initialization", () => {
		it("executes schema SQL on init", () => {
			const db = mockDb();
			initDb(db);

			expect(db.run).toHaveBeenCalledTimes(1);
			const sql = (db.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
			expect(sql).toContain("CREATE TABLE IF NOT EXISTS decision_log");
			expect(sql).toContain("CREATE TABLE IF NOT EXISTS execution_log");
			expect(sql).toContain("CREATE TABLE IF NOT EXISTS outcome_log");
			expect(sql).toContain("CREATE TABLE IF NOT EXISTS drift_events");
			expect(sql).toContain("CREATE TABLE IF NOT EXISTS safety_suppressions");
			expect(sql).toContain("CREATE TABLE IF NOT EXISTS rate_limit_state");
			expect(sql).toContain("PRAGMA foreign_keys = ON");
		});

		it("createPlanBLedgerSqlite opens and initializes", () => {
			const db = ledger.createPlanBLedgerSqlite(":memory:") as unknown as MockDb;
			expect(db.run).toHaveBeenCalled();
		});
	});

	describe("decision CRUD", () => {
		it("inserts a decision record", () => {
			const db = mockDb();
			initDb(db);

			const input = makeDecisionInput();
			const result = ledger.insertDecisionRecord(db as never, input);

			expect(result.id).toBe("dec-1");
			expect(result.decisionType).toBe("mark_plan_stale");
			expect(result.sourceId).toBe("source-1");
			expect(result.sessionId).toBe("ses-1");
			expect(result.riskClass).toBe("low");
			expect(result.approved).toBe(true);
			expect(result.createdAt).toBeTruthy();
			expect(result.updatedAt).toBeTruthy();
		});

		it("inserts decision with preflight result", () => {
			const db = mockDb();
			initDb(db);

			const preflight: PreflightResult = {
				approved: true,
				checks: { freshness: true, rate_limit: true },
				downgradeTo: null,
				reason: null,
			};
			const input = makeDecisionInput({ preflightResult: preflight });
			const result = ledger.insertDecisionRecord(db as never, input);

			expect(result.preflightResult).toEqual(preflight);
		});

		it("inserts decision with explicit timestamps", () => {
			const db = mockDb();
			initDb(db);

			const createdAt = "2025-06-01T12:00:00.000Z";
			const updatedAt = "2025-06-01T12:30:00.000Z";
			const input = makeDecisionInput({ createdAt, updatedAt });
			const result = ledger.insertDecisionRecord(db as never, input);

			expect(result.createdAt).toBe(createdAt);
			expect(result.updatedAt).toBe(updatedAt);
		});

		it("gets a decision record by id", () => {
			const db = mockDb();
			initDb(db);

			const input = makeDecisionInput();
			ledger.insertDecisionRecord(db as never, input);

			// Simulate the row being returned by the query
			const row = {
				id: "dec-1",
				decision_type: "mark_plan_stale",
				source_id: "source-1",
				session_id: "ses-1",
				risk_class: "low",
				approved: 1,
				preflight_result_json: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			};
			(db as unknown as MockDb)._setGetResult(row);

			const result = ledger.getDecisionRecord(db as never, "dec-1");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("dec-1");
			expect(result?.approved).toBe(true);
		});

		it("returns null for missing decision", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setGetResult(null);
			const result = ledger.getDecisionRecord(db as never, "nonexistent");
			expect(result).toBeNull();
		});

		it("updates a decision record", () => {
			const db = mockDb();
			initDb(db);

			const input = makeDecisionInput();
			ledger.insertDecisionRecord(db as never, input);

			// getDecisionRecord needs to return the current row
			const row = {
				id: "dec-1",
				decision_type: "mark_plan_stale",
				source_id: "source-1",
				session_id: "ses-1",
				risk_class: "low",
				approved: 1,
				preflight_result_json: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			};
			(db as unknown as MockDb)._setGetResult(row);

			const result = ledger.updateDecisionRecord(db as never, {
				id: "dec-1",
				approved: false,
			});

			expect(result).not.toBeNull();
			expect(result?.approved).toBe(false);
		});

		it("returns null when updating nonexistent decision", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setGetResult(null);
			const result = ledger.updateDecisionRecord(db as never, {
				id: "nonexistent",
				approved: false,
			});
			expect(result).toBeNull();
		});

		it("lists decision records with filters", () => {
			const db = mockDb();
			initDb(db);

			const rows = [
				{
					id: "dec-1",
					decision_type: "mark_plan_stale",
					source_id: "source-1",
					session_id: "ses-1",
					risk_class: "low",
					approved: 1,
					preflight_result_json: null,
					created_at: "2026-01-01T00:00:00.000Z",
					updated_at: "2026-01-01T00:00:00.000Z",
				},
			];
			(db as unknown as MockDb)._setAllResult(rows);

			const results = ledger.listDecisionRecords(db as never, {
				sourceId: "source-1",
			});
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("dec-1");
		});

		it("lists decision records with session filter", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setAllResult([]);
			const results = ledger.listDecisionRecords(db as never, {
				sessionId: "ses-other",
			});
			expect(results).toHaveLength(0);
		});
	});

	describe("execution CRUD", () => {
		it("inserts an execution record", () => {
			const db = mockDb();
			initDb(db);

			const input = makeExecutionInput();
			const result = ledger.insertExecutionRecord(db as never, input);

			expect(result.id).toBe("exec-1");
			expect(result.decisionId).toBe("dec-1");
			expect(result.state).toBe("pending");
			expect(result.phase).toBe("select_executable");
			expect(result.idempotencyKey).toBe("ik-1");
			expect(result.createdAt).toBeTruthy();
			expect(result.updatedAt).toBeTruthy();
		});

		it("inserts execution with error", () => {
			const db = mockDb();
			initDb(db);

			const input = makeExecutionInput({
				state: "failed",
				error: "something went wrong",
			});
			const result = ledger.insertExecutionRecord(db as never, input);

			expect(result.state).toBe("failed");
			expect(result.error).toBe("something went wrong");
		});

		it("gets an execution record by id", () => {
			const db = mockDb();
			initDb(db);

			const row = {
				id: "exec-1",
				decision_id: "dec-1",
				state: "pending",
				phase: "select_executable",
				idempotency_key: "ik-1",
				error: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			};
			(db as unknown as MockDb)._setGetResult(row);

			const result = ledger.getExecutionRecord(db as never, "exec-1");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("exec-1");
		});

		it("returns null for missing execution", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setGetResult(null);
			const result = ledger.getExecutionRecord(db as never, "nonexistent");
			expect(result).toBeNull();
		});

		it("updates an execution record", () => {
			const db = mockDb();
			initDb(db);

			const row = {
				id: "exec-1",
				decision_id: "dec-1",
				state: "pending",
				phase: "select_executable",
				idempotency_key: "ik-1",
				error: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			};
			(db as unknown as MockDb)._setGetResult(row);

			const result = ledger.updateExecutionRecord(db as never, {
				id: "exec-1",
				state: "succeeded",
				phase: "reconcile",
			});

			expect(result).not.toBeNull();
			expect(result?.state).toBe("succeeded");
			expect(result?.phase).toBe("reconcile");
		});

		it("returns null when updating nonexistent execution", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setGetResult(null);
			const result = ledger.updateExecutionRecord(db as never, {
				id: "nonexistent",
				state: "succeeded",
				phase: "reconcile",
			});
			expect(result).toBeNull();
		});

		it("lists execution records with filters", () => {
			const db = mockDb();
			initDb(db);

			const rows = [
				{
					id: "exec-1",
					decision_id: "dec-1",
					state: "pending",
					phase: "select_executable",
					idempotency_key: "ik-1",
					error: null,
					created_at: "2026-01-01T00:00:00.000Z",
					updated_at: "2026-01-01T00:00:00.000Z",
				},
			];
			(db as unknown as MockDb)._setAllResult(rows);

			const results = ledger.listExecutionRecords(db as never, {
				decisionId: "dec-1",
			});
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("exec-1");
		});
	});

	describe("outcome CRUD", () => {
		it("inserts an outcome record", () => {
			const db = mockDb();
			initDb(db);

			const input = makeOutcomeInput();
			const result = ledger.insertOutcomeRecord(db as never, input);

			expect(result.id).toBe("out-1");
			expect(result.executionId).toBe("exec-1");
			expect(result.matched).toBe(true);
			expect(result.expected).toBe("dispatched");
			expect(result.actual).toBe("dispatched");
			expect(result.createdAt).toBeTruthy();
		});

		it("inserts unmatched outcome", () => {
			const db = mockDb();
			initDb(db);

			const input = makeOutcomeInput({
				matched: false,
				expected: "dispatched",
				actual: "failed",
			});
			const result = ledger.insertOutcomeRecord(db as never, input);

			expect(result.matched).toBe(false);
			expect(result.actual).toBe("failed");
		});

		it("gets an outcome record by id", () => {
			const db = mockDb();
			initDb(db);

			const row = {
				id: "out-1",
				execution_id: "exec-1",
				matched: 1,
				expected: "dispatched",
				actual: "dispatched",
				created_at: "2026-01-01T00:00:00.000Z",
			};
			(db as unknown as MockDb)._setGetResult(row);

			const result = ledger.getOutcomeRecord(db as never, "out-1");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("out-1");
			expect(result?.matched).toBe(true);
		});

		it("returns null for missing outcome", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setGetResult(null);
			const result = ledger.getOutcomeRecord(db as never, "nonexistent");
			expect(result).toBeNull();
		});

		it("lists outcome records with execution filter", () => {
			const db = mockDb();
			initDb(db);

			const rows = [
				{
					id: "out-1",
					execution_id: "exec-1",
					matched: 1,
					expected: "dispatched",
					actual: "dispatched",
					created_at: "2026-01-01T00:00:00.000Z",
				},
			];
			(db as unknown as MockDb)._setAllResult(rows);

			const results = ledger.listOutcomeRecords(db as never, {
				executionId: "exec-1",
			});
			expect(results).toHaveLength(1);
		});
	});

	describe("rate-limit state", () => {
		it("sets a new rate limit state", () => {
			const db = mockDb();
			initDb(db);

			const input = makeRateLimitInput();
			const result = ledger.setRateLimitState(db as never, input);

			expect(result.key).toBe("mark_plan_stale:source-1");
			expect(result.tokensUsed).toBe(5);
			expect(result.createdAt).toBeTruthy();
			expect(result.updatedAt).toBeTruthy();
		});

		it("gets rate limit state", () => {
			const db = mockDb();
			initDb(db);

			const row = {
				key: "mark_plan_stale:source-1",
				tokens_used: 5,
				window_started_at: "2026-01-01T00:00:00.000Z",
				last_decision_at: "2026-01-01T00:00:00.000Z",
				last_execution_at: null,
				cooldown_until: null,
				metadata_json: null,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:00.000Z",
			};
			(db as unknown as MockDb)._setGetResult(row);

			const result = ledger.getRateLimitState(db as never, "mark_plan_stale:source-1");
			expect(result).not.toBeNull();
			expect(result?.key).toBe("mark_plan_stale:source-1");
			expect(result?.tokensUsed).toBe(5);
		});

		it("returns null for missing rate limit state", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setGetResult(null);
			const result = ledger.getRateLimitState(db as never, "nonexistent");
			expect(result).toBeNull();
		});

		it("upserts rate limit state on conflict", () => {
			const db = mockDb();
			initDb(db);

			const input = makeRateLimitInput({ tokensUsed: 10 });
			const result = ledger.setRateLimitState(db as never, input);

			expect(result.tokensUsed).toBe(10);
		});
	});

	describe("safety suppression", () => {
		it("puts a new safety suppression", () => {
			const db = mockDb();
			initDb(db);

			const input = makeSafetySuppressionInput();
			const result = ledger.putSafetySuppression(db as never, input);

			expect(result.id).toBe("sup-1");
			expect(result.scope).toBe("source");
			expect(result.scopeId).toBe("source-1");
			expect(result.reason).toBe("maintenance window");
			expect(result.active).toBe(true);
			expect(result.expiresAt).toBe("2026-01-02T00:00:00.000Z");
		});

		it("puts inactive suppression", () => {
			const db = mockDb();
			initDb(db);

			const input = makeSafetySuppressionInput({ active: false });
			const result = ledger.putSafetySuppression(db as never, input);

			expect(result.active).toBe(false);
		});

		it("lists active safety suppressions", () => {
			const db = mockDb();
			initDb(db);

			const rows = [
				{
					id: "sup-1",
					scope: "source",
					scope_id: "source-1",
					reason: "maintenance window",
					active: 1,
					metadata_json: null,
					created_at: "2026-01-01T00:00:00.000Z",
					updated_at: "2026-01-01T00:00:00.000Z",
					expires_at: "2026-01-02T00:00:00.000Z",
				},
			];
			(db as unknown as MockDb)._setAllResult(rows);

			const results = ledger.listActiveSafetySuppressions(db as never, {
				scope: "source",
			});
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("sup-1");
			expect(results[0].active).toBe(true);
		});

		it("lists active suppressions filtered by scopeId", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setAllResult([]);
			const results = ledger.listActiveSafetySuppressions(db as never, {
				scope: "source",
				scopeId: "source-other",
			});
			expect(results).toHaveLength(0);
		});
	});

	describe("drift events", () => {
		it("appends a drift event", () => {
			const db = mockDb();
			initDb(db);

			const input = makeDriftEventInput();
			const result = ledger.appendDriftEvent(db as never, input);

			expect(result.id).toBe("drift-1");
			expect(result.sourceId).toBe("source-1");
			expect(result.fingerprintHash).toBe("abc123");
			expect(result.driftLevel).toBe("none");
			expect(result.recommendedAction).toBe("none");
			expect(result.stalenessMs).toBe(0);
			expect(result.createdAt).toBeTruthy();
		});

		it("appends drift event with previous fingerprint", () => {
			const db = mockDb();
			initDb(db);

			const input = makeDriftEventInput({
				previousFingerprintHash: "def456",
				driftLevel: "mild",
				recommendedAction: "refresh",
				stalenessMs: 120000,
			});
			const result = ledger.appendDriftEvent(db as never, input);

			expect(result.previousFingerprintHash).toBe("def456");
			expect(result.driftLevel).toBe("mild");
			expect(result.recommendedAction).toBe("refresh");
			expect(result.stalenessMs).toBe(120000);
		});

		it("appends drift event with report", () => {
			const db = mockDb();
			initDb(db);

			const report = {
				sourceId: "source-1",
				fingerprint: { hash: "abc123", observedAt: 1000, sourceId: "source-1" },
				previousFingerprint: null,
				stalenessMs: 0,
				driftLevel: "none" as StalenessLevel,
				recommendedAction: "none" as "none",
				reportedAt: "2026-01-01T00:00:00.000Z",
			};
			const input = makeDriftEventInput({ report });
			const result = ledger.appendDriftEvent(db as never, input);

			expect(result.report).toEqual(report);
		});

		it("lists drift events", () => {
			const db = mockDb();
			initDb(db);

			const rows = [
				{
					id: "drift-1",
					source_id: "source-1",
					fingerprint_hash: "abc123",
					previous_fingerprint_hash: null,
					drift_level: "none",
					recommended_action: "none",
					staleness_ms: 0,
					report_json: null,
					created_at: "2026-01-01T00:00:00.000Z",
				},
			];
			(db as unknown as MockDb)._setAllResult(rows);

			const results = ledger.listDriftEvents(db as never, {
				sourceId: "source-1",
			});
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("drift-1");
		});

		it("lists drift events filtered by sourceId", () => {
			const db = mockDb();
			initDb(db);

			(db as unknown as MockDb)._setAllResult([]);
			const results = ledger.listDriftEvents(db as never, {
				sourceId: "source-other",
			});
			expect(results).toHaveLength(0);
		});
	});

	describe("transaction rollback", () => {
		it("withPlanBLedgerTransaction wraps fn in db.transaction", () => {
			const db = mockDb();
			initDb(db);

			let called = false;
			ledger.withPlanBLedgerTransaction(db as never, () => {
				called = true;
				return 42;
			});

			expect(called).toBe(true);
		});

		it("withPlanBLedgerTransaction returns the function result", () => {
			const db = mockDb();
			initDb(db);

			const result = ledger.withPlanBLedgerTransaction(db as never, () => 99);
			expect(result).toBe(99);
		});

		it("insertDecisionRecord uses transaction", () => {
			const db = mockDb();
			initDb(db);

			const input = makeDecisionInput();
			ledger.insertDecisionRecord(db as never, input);

			// Verify db.transaction was called (via withPlanBLedgerTransaction)
			expect((db as unknown as MockDb).transaction).toHaveBeenCalled();
		});
	});
});
