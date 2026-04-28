import { describe, expect, it, vi } from "vitest";
import type { AutomationTier, DriftReport } from "../server/control-plane/plan-b/types";

// ─── Mock types ───────────────────────────────────────────────────────

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

type MockDb = {
	rateLimitByKey: Map<string, MockRateLimitState>;
};

// ─── Helpers ──────────────────────────────────────────────────────────

function buildMockDb(): MockDb {
	return {
		rateLimitByKey: new Map(),
	};
}

function iso(ms = Date.parse("2026-01-01T00:00:00.000Z")): string {
	return new Date(ms).toISOString();
}

const TIER_STATE_KEY = "automation:tier";

function seedTierState(
	db: MockDb,
	overrides: Partial<MockRateLimitState["metadata"]> & {
		tier: AutomationTier;
	} = { tier: "shadow" },
): void {
	const metadata: Record<string, unknown> = {
		tier: overrides.tier,
		updatedAt: iso(),
	};
	if (overrides.pendingTier) metadata.pendingTier = overrides.pendingTier;
	if (overrides.approvalReason)
		metadata.approvalReason = overrides.approvalReason;
	if (overrides.requestedAt) metadata.requestedAt = overrides.requestedAt;
	if (overrides.approvedAt) metadata.approvedAt = overrides.approvedAt;

	db.rateLimitByKey.set(TIER_STATE_KEY, {
		key: TIER_STATE_KEY,
		tokensUsed: 0,
		windowStartedAt: null,
		lastDecisionAt: null,
		lastExecutionAt: null,
		cooldownUntil: null,
		metadata,
		createdAt: iso(),
		updatedAt: iso(),
	});
}

// ─── Mock ledger-sqlite ───────────────────────────────────────────────

vi.mock("../server/control-plane/plan-b/ledger-sqlite", () => {
	return {
		getRateLimitState: vi.fn((db: MockDb, key: string) => {
			return db.rateLimitByKey.get(key) ?? null;
		}),
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
	};
});

const controller = await import(
	"../server/control-plane/plan-b/tier-controller"
);

// ─── Tests ────────────────────────────────────────────────────────────

describe("tier-controller", () => {
	describe("getTier", () => {
		it("returns 'shadow' when no persisted state exists", () => {
			const db = buildMockDb();
			expect(controller.getTier(db as never)).toBe("shadow");
		});

		it("returns the persisted tier when state exists", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });
			expect(controller.getTier(db as never)).toBe("tier1");
		});
	});

	describe("requestTierChange", () => {
		it("throws for unsupported tier", () => {
			const db = buildMockDb();
			expect(() =>
				controller.requestTierChange({
					db: db as never,
					requestedTier: "tier2" as AutomationTier,
				}),
			).toThrow(/Unsupported automation tier/);
		});

		it("throws when requesting 'shadow' (must use emergencyDowngrade)", () => {
			const db = buildMockDb();
			expect(() =>
				controller.requestTierChange({
					db: db as never,
					requestedTier: "shadow",
				}),
			).toThrow(/can only be entered via emergencyDowngrade/);
		});

		it("returns current tier when requesting same tier (no-op)", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });

			const result = controller.requestTierChange({
				db: db as never,
				requestedTier: "tier1",
			});

			expect(result).toBe("tier1");
			// No pendingTier should be set
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).not.toHaveProperty("pendingTier");
		});

		it("sets pendingTier and returns current tier when requesting a different tier", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "shadow" });

			const result = controller.requestTierChange({
				db: db as never,
				requestedTier: "tier1",
				reason: "Need production automation",
			});

			expect(result).toBe("shadow");

			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({
				tier: "shadow",
				pendingTier: "tier1",
				approvalReason: "Need production automation",
			});
			expect(state.metadata).toHaveProperty("requestedAt");
		});

		it("sets pendingTier from shadow to tier1", () => {
			const db = buildMockDb();
			// Default is shadow, no seed needed
			const result = controller.requestTierChange({
				db: db as never,
				requestedTier: "tier1",
			});

			expect(result).toBe("shadow");

			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({
				tier: "shadow",
				pendingTier: "tier1",
			});
		});
	});

	describe("approveTierChange", () => {
		it("throws for unsupported tier", () => {
			const db = buildMockDb();
			expect(() =>
				controller.approveTierChange({
					db: db as never,
					approvedTier: "tier2" as AutomationTier,
				}),
			).toThrow(/Unsupported automation tier/);
		});

		it("throws when approving 'shadow' (must use emergencyDowngrade)", () => {
			const db = buildMockDb();
			expect(() =>
				controller.approveTierChange({
					db: db as never,
					approvedTier: "shadow",
				}),
			).toThrow(/can only be entered via emergencyDowngrade/);
		});

		it("throws when there is no matching pending request", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "shadow" });

			expect(() =>
				controller.approveTierChange({
					db: db as never,
					approvedTier: "tier1",
				}),
			).toThrow(/No pending tier change request to tier1/);
		});

		it("approves a pending tier change and updates the tier", () => {
			const db = buildMockDb();
			seedTierState(db, {
				tier: "shadow",
				pendingTier: "tier1",
				requestedAt: iso(),
			});

			const result = controller.approveTierChange({
				db: db as never,
				approvedTier: "tier1",
				reason: "Approved by admin",
			});

			expect(result).toBe("tier1");

			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({
				tier: "tier1",
				approvalReason: "Approved by admin",
			});
			expect(state.metadata).not.toHaveProperty("pendingTier");
			expect(state.metadata).toHaveProperty("approvedAt");
			expect(state.metadata).toHaveProperty("updatedAt");
		});
	});

	describe("emergencyDowngrade", () => {
		it("forces tier to 'shadow' from tier1", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });

			const result = controller.emergencyDowngrade({
				db: db as never,
				reason: "Incident response",
			});

			expect(result).toBe("shadow");

			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({
				tier: "shadow",
				approvalReason: "Incident response",
			});
			expect(state.metadata).not.toHaveProperty("pendingTier");
			expect(state.metadata).not.toHaveProperty("requestedAt");
			expect(state.metadata).not.toHaveProperty("approvedAt");
		});

		it("clears any pending tier request", () => {
			const db = buildMockDb();
			seedTierState(db, {
				tier: "shadow",
				pendingTier: "tier1",
				requestedAt: iso(),
			});

			controller.emergencyDowngrade({ db: db as never });

			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "shadow" });
			expect(state.metadata).not.toHaveProperty("pendingTier");
		});

		it("is idempotent when already in shadow", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "shadow" });

			const result = controller.emergencyDowngrade({ db: db as never });

			expect(result).toBe("shadow");
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "shadow" });
		});
	});

	describe("autoDowngradeOnInstability", () => {
		function makeDriftReport(
			recommendedAction: DriftReport["recommendedAction"],
		): DriftReport {
			return {
				sourceId: "source-1",
				fingerprint: { hash: "abc", observedAt: 0, sourceId: "source-1" },
				previousFingerprint: null,
				stalenessMs: 0,
				driftLevel: "none",
				recommendedAction,
				reportedAt: iso(),
			};
		}

		it("downgrades tier1 to shadow when drift recommends downgrade", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });

			const result = controller.autoDowngradeOnInstability({
				db: db as never,
				currentTier: "tier1",
				driftReport: makeDriftReport("downgrade"),
			});

			expect(result).toBe("shadow");
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "shadow" });
		});

		it("downgrades tier1 to shadow when drift recommends alert", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });

			const result = controller.autoDowngradeOnInstability({
				db: db as never,
				currentTier: "tier1",
				driftReport: makeDriftReport("alert"),
			});

			expect(result).toBe("shadow");
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "shadow" });
		});

		it("does not downgrade when drift recommends none", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });

			const result = controller.autoDowngradeOnInstability({
				db: db as never,
				currentTier: "tier1",
				driftReport: makeDriftReport("none"),
			});

			expect(result).toBe("tier1");
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "tier1" });
		});

		it("does not downgrade when drift recommends refresh", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "tier1" });

			const result = controller.autoDowngradeOnInstability({
				db: db as never,
				currentTier: "tier1",
				driftReport: makeDriftReport("refresh"),
			});

			expect(result).toBe("tier1");
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "tier1" });
		});

		it("is idempotent when already shadow", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "shadow" });

			const result = controller.autoDowngradeOnInstability({
				db: db as never,
				currentTier: "shadow",
				driftReport: makeDriftReport("downgrade"),
			});

			expect(result).toBe("shadow");
			const state = db.rateLimitByKey.get(TIER_STATE_KEY)!;
			expect(state.metadata).toMatchObject({ tier: "shadow" });
		});

		it("returns currentTier unchanged when not tier1", () => {
			const db = buildMockDb();
			seedTierState(db, { tier: "shadow" });

			const result = controller.autoDowngradeOnInstability({
				db: db as never,
				currentTier: "shadow",
				driftReport: makeDriftReport("alert"),
			});

			expect(result).toBe("shadow");
		});
	});
});
