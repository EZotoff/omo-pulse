import { describe, expect, it, beforeEach } from "vitest";
import { Database } from "bun:sqlite";
import { evaluatePreflight, DEFAULT_FRESHNESS_THRESHOLD_MS, DEFAULT_COOLDOWN_MS } from "../server/control-plane/plan-b/preflight-guard";
import { createPlanBLedgerSqlite, setRateLimitState, putSafetySuppression, insertExecutionRecord } from "../server/control-plane/plan-b/ledger-sqlite";
import type { PlanBLedgerDatabase } from "../server/control-plane/plan-b/ledger-sqlite";
import type { AutomationTier, DriftReport } from "../server/control-plane/plan-b/types";

// ─── Helpers ───────────────────────────────────────────────────────────

function makeDriftReport(overrides: Partial<DriftReport> = {}): DriftReport {
	return {
		sourceId: "proj-1",
		fingerprint: { hash: "abc123", observedAt: 1000, sourceId: "proj-1" },
		previousFingerprint: null,
		stalenessMs: 0,
		driftLevel: "none",
		recommendedAction: "none",
		reportedAt: new Date().toISOString(),
		...overrides,
	};
}

function makePreflightArgs(overrides: Record<string, unknown> = {}) {
	const nowMs = Date.now();
	return {
		db: undefined as unknown as PlanBLedgerDatabase,
		decisionType: "mark_plan_stale",
		targetId: "proj-1",
		currentTier: "tier1" as AutomationTier,
		observedAtMs: nowMs - 1000,
		nowMs,
		driftReport: makeDriftReport(),
		idempotencyKey: "ik-001",
		scope: "project",
		...overrides,
	};
}

// ─── Setup ─────────────────────────────────────────────────────────────

describe("evaluatePreflight", () => {
	let db: PlanBLedgerDatabase;

	beforeEach(() => {
		db = createPlanBLedgerSqlite();
	});

	// ─── Check 1: Freshness ─────────────────────────────────────────────

	describe("freshness check", () => {
		it("passes when observation is recent", () => {
			const nowMs = Date.now();
			const result = evaluatePreflight(makePreflightArgs({
				db,
				observedAtMs: nowMs - 1000,
				nowMs,
			}));

			expect(result.checks.freshness).toBe(true);
		});

		it("fails when observation exceeds threshold", () => {
			const nowMs = Date.now();
			const result = evaluatePreflight(makePreflightArgs({
				db,
				observedAtMs: nowMs - DEFAULT_FRESHNESS_THRESHOLD_MS - 1,
				nowMs,
			}));

			expect(result.checks.freshness).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("stale");
		});

		it("downgrades to advisory on stale observation", () => {
			const nowMs = Date.now();
			const result = evaluatePreflight(makePreflightArgs({
				db,
				observedAtMs: nowMs - DEFAULT_FRESHNESS_THRESHOLD_MS - 1,
				nowMs,
				driftReport: makeDriftReport({ driftLevel: "none", recommendedAction: "none" }),
			}));

			expect(result.downgradeTo).toBe("advisory");
		});
	});

	// ─── Check 2: Drift ─────────────────────────────────────────────────

	describe("drift check", () => {
		it("passes when drift level is none", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				driftReport: makeDriftReport({ driftLevel: "none", recommendedAction: "none" }),
			}));

			expect(result.checks.drift).toBe(true);
		});

		it("fails when drift is detected", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				driftReport: makeDriftReport({ driftLevel: "mild", recommendedAction: "refresh" }),
			}));

			expect(result.checks.drift).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("Drift detected");
		});

		it("downgrades to human_review when recommended action is alert", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				driftReport: makeDriftReport({ driftLevel: "severe", recommendedAction: "alert" }),
			}));

			expect(result.downgradeTo).toBe("human_review");
		});

		it("downgrades to advisory when recommended action is refresh", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				driftReport: makeDriftReport({ driftLevel: "mild", recommendedAction: "refresh" }),
			}));

			expect(result.downgradeTo).toBe("advisory");
		});
	});

	// ─── Check 3: Suppression ───────────────────────────────────────────

	describe("suppression check", () => {
		it("passes when no active suppressions exist", () => {
			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.checks.suppression).toBe(true);
		});

		it("fails when active suppression exists for target", () => {
			putSafetySuppression(db, {
				id: "sup-1",
				scope: "project",
				scopeId: "proj-1",
				reason: "Manual override",
				active: true,
				metadata: null,
				expiresAt: new Date(Date.now() + 3600000).toISOString(),
			});

			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.checks.suppression).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("Manual override");
		});

		it("downgrades to human_review on active suppression", () => {
			putSafetySuppression(db, {
				id: "sup-1",
				scope: "project",
				scopeId: "proj-1",
				reason: "Manual override",
				active: true,
				metadata: null,
				expiresAt: new Date(Date.now() + 3600000).toISOString(),
			});

			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.downgradeTo).toBe("human_review");
		});

		it("passes when suppression is expired", () => {
			putSafetySuppression(db, {
				id: "sup-1",
				scope: "project",
				scopeId: "proj-1",
				reason: "Old override",
				active: true,
				metadata: null,
				expiresAt: new Date(Date.now() - 1000).toISOString(),
			});

			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.checks.suppression).toBe(true);
		});
	});

	// ─── Check 4: Cooldown ──────────────────────────────────────────────

	describe("cooldown check", () => {
		it("passes when no rate limit state exists", () => {
			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.checks.cooldown).toBe(true);
		});

		it("passes when cooldown has elapsed", () => {
			const longAgo = new Date(Date.now() - DEFAULT_COOLDOWN_MS - 1000).toISOString();
			setRateLimitState(db, {
				key: "mark_plan_stale:proj-1",
				tokensUsed: 1,
				windowStartedAt: longAgo,
				lastDecisionAt: longAgo,
				lastExecutionAt: longAgo,
				cooldownUntil: longAgo,
				metadata: null,
			});

			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.checks.cooldown).toBe(true);
		});

		it("fails when cooldown is still active", () => {
			const recent = new Date(Date.now() - 1000).toISOString();
			const future = new Date(Date.now() + 30000).toISOString();
			setRateLimitState(db, {
				key: "mark_plan_stale:proj-1",
				tokensUsed: 1,
				lastExecutionAt: recent,
				cooldownUntil: future,
				windowStartedAt: recent,
				lastDecisionAt: recent,
				metadata: null,
			});

			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.checks.cooldown).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("Cooldown active");
		});

		it("downgrades to advisory on active cooldown", () => {
			const recent = new Date(Date.now() - 1000).toISOString();
			const future = new Date(Date.now() + 30000).toISOString();
			setRateLimitState(db, {
				key: "mark_plan_stale:proj-1",
				tokensUsed: 1,
				lastExecutionAt: recent,
				cooldownUntil: future,
				windowStartedAt: recent,
				lastDecisionAt: recent,
				metadata: null,
			});

			const result = evaluatePreflight(makePreflightArgs({ db }));

			expect(result.downgradeTo).toBe("advisory");
		});
	});

	// ─── Check 5: Tier ──────────────────────────────────────────────────

	describe("tier check", () => {
		it("passes for known capability at tier1", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, currentTier: "tier1" }));

			expect(result.checks.tier).toBe(true);
		});

		it("fails for known capability at shadow tier", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, currentTier: "shadow" }));

			expect(result.checks.tier).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("requires tier");
		});

		it("fails for unknown decision type", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, decisionType: "unknown_type" }));

			expect(result.checks.tier).toBe(false);
			expect(result.reason).toContain("Unknown decision type");
		});

		it("downgrades to advisory on tier mismatch", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, currentTier: "shadow" }));

			expect(result.downgradeTo).toBe("advisory");
		});
	});

	// ─── Check 6: Idempotency ───────────────────────────────────────────

	describe("idempotency check", () => {
		it("passes when idempotency key has not been seen", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, idempotencyKey: "fresh-key" }));

			expect(result.checks.idempotency).toBe(true);
		});

		it("fails when idempotency key already exists in execution_log", () => {
			insertExecutionRecord(db, {
				id: "exec-1",
				decisionId: "dec-1",
				state: "succeeded",
				phase: "reconcile",
				idempotencyKey: "ik-001",
				error: null,
			});

			const result = evaluatePreflight(makePreflightArgs({ db, idempotencyKey: "ik-001" }));

			expect(result.checks.idempotency).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("Duplicate idempotency key");
		});

		it("hard-denies on duplicate idempotency key (no downgrade)", () => {
			insertExecutionRecord(db, {
				id: "exec-1",
				decisionId: "dec-1",
				state: "succeeded",
				phase: "reconcile",
				idempotencyKey: "ik-001",
				error: null,
			});

			const result = evaluatePreflight(makePreflightArgs({ db, idempotencyKey: "ik-001" }));

			expect(result.downgradeTo).toBeNull();
		});
	});

	// ─── Check 7: Scope ─────────────────────────────────────────────────

	describe("scope check", () => {
		it("passes when scope matches expected", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, scope: "project" }));

			expect(result.checks.scope).toBe(true);
		});

		it("passes when scope is undefined (not provided)", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, scope: undefined }));

			expect(result.checks.scope).toBe(true);
		});

		it("fails when scope does not match expected", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, scope: "session" }));

			expect(result.checks.scope).toBe(false);
			expect(result.approved).toBe(false);
			expect(result.reason).toContain("Scope mismatch");
		});

		it("fails for unknown decision type with no scope mapping", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, decisionType: "unknown_type" }));

			expect(result.checks.scope).toBe(false);
			expect(result.reason).toContain("No scope mapping");
		});

		it("fails when targetId is empty", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, targetId: "" }));

			expect(result.checks.scope).toBe(false);
			expect(result.reason).toContain("Empty targetId");
		});

		it("hard-denies on scope mismatch (no downgrade)", () => {
			const result = evaluatePreflight(makePreflightArgs({ db, scope: "session" }));

			expect(result.downgradeTo).toBeNull();
		});
	});

	// ─── All checks pass ────────────────────────────────────────────────

	describe("all checks pass", () => {
		it("returns approved=true when all 7 checks pass", () => {
			const nowMs = Date.now();
			const result = evaluatePreflight(makePreflightArgs({
				db,
				observedAtMs: nowMs - 1000,
				nowMs,
				driftReport: makeDriftReport({ driftLevel: "none", recommendedAction: "none" }),
				currentTier: "tier1",
				idempotencyKey: "fresh-key",
				scope: "project",
			}));

			expect(result.approved).toBe(true);
			expect(result.downgradeTo).toBeNull();
			expect(result.reason).toBeNull();
			expect(result.checks.freshness).toBe(true);
			expect(result.checks.drift).toBe(true);
			expect(result.checks.suppression).toBe(true);
			expect(result.checks.cooldown).toBe(true);
			expect(result.checks.tier).toBe(true);
			expect(result.checks.idempotency).toBe(true);
			expect(result.checks.scope).toBe(true);
		});
	});

	// ─── Downgrade precedence ───────────────────────────────────────────

	describe("downgrade precedence", () => {
		it("human_review takes precedence over advisory", () => {
			const nowMs = Date.now();
			putSafetySuppression(db, {
				id: "sup-1",
				scope: "project",
				scopeId: "proj-1",
				reason: "Manual override",
				active: true,
				metadata: null,
				expiresAt: new Date(Date.now() + 3600000).toISOString(),
			});

			const result = evaluatePreflight(makePreflightArgs({
				db,
				observedAtMs: nowMs - DEFAULT_FRESHNESS_THRESHOLD_MS - 1,
				nowMs,
				driftReport: makeDriftReport({ driftLevel: "mild", recommendedAction: "refresh" }),
			}));

			// suppression → human_review, stale + drift → advisory
			// human_review should win
			expect(result.downgradeTo).toBe("human_review");
		});

		it("hard denial (scope mismatch) clears downgrade", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				scope: "session",
				driftReport: makeDriftReport({ driftLevel: "mild", recommendedAction: "refresh" }),
			}));

			// scope mismatch is hard denial → downgradeTo should be null
			expect(result.downgradeTo).toBeNull();
		});
	});

	// ─── log_session_stalled scope ──────────────────────────────────────

	describe("log_session_stalled scope", () => {
		it("expects session scope", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				decisionType: "log_session_stalled",
				targetId: "ses-001",
				scope: "session",
			}));

			expect(result.checks.scope).toBe(true);
		});

		it("rejects project scope", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				decisionType: "log_session_stalled",
				targetId: "ses-001",
				scope: "project",
			}));

			expect(result.checks.scope).toBe(false);
		});
	});

	// ─── notify_question_pending scope ──────────────────────────────────

	describe("notify_question_pending scope", () => {
		it("expects session scope", () => {
			const result = evaluatePreflight(makePreflightArgs({
				db,
				decisionType: "notify_question_pending",
				targetId: "ses-001",
				scope: "session",
			}));

			expect(result.checks.scope).toBe(true);
		});
	});
});
