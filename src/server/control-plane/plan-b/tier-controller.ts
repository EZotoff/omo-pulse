import { getRateLimitState, setRateLimitState } from "./ledger-sqlite.js";
import type { PlanBLedgerDatabase } from "./ledger-sqlite.js";
import type { AutomationTier, DriftReport } from "./types.js";

const TIER_STATE_KEY = "automation:tier";

type TierStateMetadata = {
	tier: AutomationTier;
	pendingTier?: AutomationTier;
	approvalReason?: string;
	requestedAt?: string;
	approvedAt?: string;
	updatedAt: string;
};

function isAutomationTier(value: unknown): value is AutomationTier {
	return value === "shadow" || value === "tier1";
}

function nowIso(): string {
	return new Date().toISOString();
}

function readTierState(db: PlanBLedgerDatabase): TierStateMetadata {
	const record = getRateLimitState(db, TIER_STATE_KEY);
	const metadata = record?.metadata;

	if (
		metadata &&
		typeof metadata === "object" &&
		"tier" in metadata &&
		isAutomationTier(metadata.tier)
	) {
		return {
			tier: metadata.tier,
			pendingTier: isAutomationTier(metadata.pendingTier)
				? metadata.pendingTier
				: undefined,
			approvalReason:
				typeof metadata.approvalReason === "string"
					? metadata.approvalReason
					: undefined,
			requestedAt:
				typeof metadata.requestedAt === "string"
					? metadata.requestedAt
					: undefined,
			approvedAt:
				typeof metadata.approvedAt === "string"
					? metadata.approvedAt
					: undefined,
			updatedAt:
				typeof metadata.updatedAt === "string"
					? metadata.updatedAt
					: nowIso(),
		};
	}

	return {
		tier: "shadow",
		updatedAt: nowIso(),
	};
}

function writeTierState(
	db: PlanBLedgerDatabase,
	state: TierStateMetadata,
): void {
	setRateLimitState(db, {
		key: TIER_STATE_KEY,
		tokensUsed: 0,
		windowStartedAt: null,
		lastDecisionAt: null,
		lastExecutionAt: null,
		cooldownUntil: null,
		metadata: state,
	});
}

/**
 * Get the current automation tier.
 * Defaults to "shadow" when no persisted state exists.
 */
export function getTier(db: PlanBLedgerDatabase): AutomationTier {
	return readTierState(db).tier;
}

export type RequestTierChangeArgs = {
	db: PlanBLedgerDatabase;
	requestedTier: AutomationTier;
	reason?: string;
};

/**
 * Record a pending tier change request.
 * Does NOT auto-promote — the caller must call `approveTierChange`.
 */
export function requestTierChange(args: RequestTierChangeArgs): AutomationTier {
	const { db, requestedTier, reason } = args;

	if (!isAutomationTier(requestedTier)) {
		throw new Error(`Unsupported automation tier: ${requestedTier}`);
	}

	if (requestedTier === "shadow") {
		throw new Error(
			`Tier 'shadow' can only be entered via emergencyDowngrade()`,
		);
	}

	const state = readTierState(db);

	if (requestedTier === state.tier) {
		return state.tier;
	}

	writeTierState(db, {
		...state,
		pendingTier: requestedTier,
		approvalReason: reason,
		requestedAt: nowIso(),
	});

	return state.tier;
}

export type ApproveTierChangeArgs = {
	db: PlanBLedgerDatabase;
	approvedTier: AutomationTier;
	reason?: string;
};

/**
 * Approve a previously requested tier change.
 * Throws if there is no matching pending request.
 */
export function approveTierChange(args: ApproveTierChangeArgs): AutomationTier {
	const { db, approvedTier, reason } = args;

	if (!isAutomationTier(approvedTier)) {
		throw new Error(`Unsupported automation tier: ${approvedTier}`);
	}

	if (approvedTier === "shadow") {
		throw new Error(
			`Tier 'shadow' can only be entered via emergencyDowngrade()`,
		);
	}

	const state = readTierState(db);

	if (state.pendingTier !== approvedTier) {
		throw new Error(
			`No pending tier change request to ${approvedTier}`,
		);
	}

	writeTierState(db, {
		tier: approvedTier,
		approvalReason: reason,
		approvedAt: nowIso(),
		updatedAt: nowIso(),
	});

	return approvedTier;
}

export type EmergencyDowngradeArgs = {
	db: PlanBLedgerDatabase;
	reason?: string;
};

/**
 * Immediately force the tier to "shadow" and clear any pending request.
 * Always succeeds, regardless of current state.
 */
export function emergencyDowngrade(args: EmergencyDowngradeArgs): AutomationTier {
	const { db, reason } = args;

	writeTierState(db, {
		tier: "shadow",
		approvalReason: reason,
		updatedAt: nowIso(),
	});

	return "shadow";
}

export type AutoDowngradeOnInstabilityArgs = {
	db: PlanBLedgerDatabase;
	currentTier: AutomationTier;
	driftReport: DriftReport;
};

/**
 * Automatically downgrade from tier1 to shadow when drift indicates
 * instability severe enough to require downgrade or alert.
 *
 * Returns the effective tier for the current loop iteration:
 * - "shadow" if a downgrade was applied (or already shadow)
 * - unchanged currentTier otherwise
 *
 * Idempotent — safe to call multiple times per loop.
 */
export function autoDowngradeOnInstability(
	args: AutoDowngradeOnInstabilityArgs,
): AutomationTier {
	const { db, currentTier, driftReport } = args;

	if (currentTier !== "tier1") {
		return currentTier;
	}

	if (
		driftReport.recommendedAction === "downgrade" ||
		driftReport.recommendedAction === "alert"
	) {
		return emergencyDowngrade({
			db,
			reason: `Auto-downgrade: drift recommendedAction="${driftReport.recommendedAction}"`,
		});
	}

	return currentTier;
}
