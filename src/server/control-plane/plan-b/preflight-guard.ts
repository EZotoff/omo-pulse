import { getCapability, isAllowed } from "./capability-registry.js";
import {
	getRateLimitState,
	listActiveSafetySuppressions,
	type PlanBLedgerDatabase,
} from "./ledger-sqlite.js";
import type { AutomationTier, DriftReport, PreflightResult } from "./types.js";

const EXPECTED_SCOPE_BY_DECISION_TYPE: Record<string, string> = {
	mark_plan_stale: "project",
	log_session_stalled: "session",
	notify_question_pending: "session",
};

/** Default observation freshness threshold (5 minutes). */
export const DEFAULT_FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;

/** Default cooldown between executions of the same decision type + target (30 seconds). */
export const DEFAULT_COOLDOWN_MS = 30 * 1000;

export type EvaluatePreflightArgs = {
	db: PlanBLedgerDatabase;
	decisionType: string;
	targetId: string;
	currentTier: AutomationTier;
	observedAtMs: number;
	nowMs: number;
	driftReport: DriftReport;
	idempotencyKey: string;
	scope?: string;
	freshnessThresholdMs?: number;
	cooldownMs?: number;
};

/**
 * Evaluate all 7 preflight checks deterministically and fail-closed.
 *
 * Checks:
 * 1. observation freshness < threshold
 * 2. drift level === "none"
 * 3. no active safety suppression
 * 4. cooldown elapsed since last execution
 * 5. tier check (decision allowed at current tier)
 * 6. idempotency key not seen
 * 7. capability scope matches target (capability exists)
 *
 * Downgrade behavior:
 * - Hard denials (unknown capability, duplicate idempotency, scope mismatch)
 *   → approved=false, downgradeTo=null
 * - Soft denials (freshness, drift, suppression, cooldown, tier)
 *   → approved=false, downgradeTo="advisory" | "human_review"
 *
 * Severity precedence for downgrade: human_review > advisory.
 */
export function evaluatePreflight(args: EvaluatePreflightArgs): PreflightResult {
	const {
		db,
		decisionType,
		targetId,
		currentTier,
		observedAtMs,
		nowMs,
		driftReport,
		idempotencyKey,
		scope,
		freshnessThresholdMs = DEFAULT_FRESHNESS_THRESHOLD_MS,
		cooldownMs = DEFAULT_COOLDOWN_MS,
	} = args;

	const checks: Record<string, boolean> = {};
	const reasons: string[] = [];
	let hasHardDenial = false;
	let downgradeTo: "advisory" | "human_review" | null = null;

	function setDowngrade(level: "advisory" | "human_review"): void {
		if (downgradeTo !== "human_review") {
			downgradeTo = level;
		}
	}

	const capability = getCapability(decisionType);

	checks.tier = capability ? isAllowed(decisionType, currentTier) : false;
	if (!checks.tier) {
		setDowngrade("advisory");
		reasons.push(
			capability
				? `Decision "${decisionType}" requires tier "${capability.minTier}" but current tier is "${currentTier}"`
				: `Unknown decision type "${decisionType}"`,
		);
	}

	const expectedScope = EXPECTED_SCOPE_BY_DECISION_TYPE[decisionType];
	if (!expectedScope) {
		checks.scope = false;
		hasHardDenial = true;
		reasons.push(`No scope mapping for decision type "${decisionType}"`);
	} else if (!targetId || targetId.trim().length === 0) {
		checks.scope = false;
		hasHardDenial = true;
		reasons.push(`Empty targetId for decision type "${decisionType}"`);
	} else if (scope !== undefined && scope !== expectedScope) {
		checks.scope = false;
		hasHardDenial = true;
		reasons.push(
			`Scope mismatch for "${decisionType}": expected "${expectedScope}" but got "${scope}"`,
		);
	} else {
		checks.scope = true;
	}

	const stalenessMs = nowMs - observedAtMs;
	checks.freshness = stalenessMs < freshnessThresholdMs;
	if (!checks.freshness) {
		setDowngrade("advisory");
		reasons.push(
			`Observation stale: ${stalenessMs}ms exceeds threshold ${freshnessThresholdMs}ms`,
		);
	}

	checks.drift = driftReport.driftLevel === "none";
	if (!checks.drift) {
		const action = driftReport.recommendedAction;
		setDowngrade(action === "alert" ? "human_review" : "advisory");
		reasons.push(
			`Drift detected: ${driftReport.driftLevel} (recommended: ${action})`,
		);
	}

	const suppressions = listActiveSafetySuppressions(db, {
		scope,
		scopeId: targetId,
		asOf: new Date(nowMs).toISOString(),
		limit: 1,
	});
	checks.suppression = suppressions.length === 0;
	if (!checks.suppression) {
		setDowngrade("human_review");
		reasons.push(
			`Active safety suppression: ${suppressions[0]?.reason ?? "unknown"}`,
		);
	}

	const rateKey = `${decisionType}:${targetId}`;
	const rateState = getRateLimitState(db, rateKey);
	let cooldownElapsed = true;
	if (rateState?.lastExecutionAt) {
		const lastExecMs = new Date(rateState.lastExecutionAt).getTime();
		cooldownElapsed = nowMs - lastExecMs >= cooldownMs;
	}
	if (rateState?.cooldownUntil) {
		const cooldownUntilMs = new Date(rateState.cooldownUntil).getTime();
		cooldownElapsed = cooldownElapsed && nowMs >= cooldownUntilMs;
	}
	checks.cooldown = cooldownElapsed;
	if (!checks.cooldown) {
		setDowngrade("advisory");
		reasons.push(`Cooldown active for "${rateKey}"`);
	}

	const idempotencySeen = idempotencyKeyExists(db, idempotencyKey);
	checks.idempotency = !idempotencySeen;
	if (!checks.idempotency) {
		hasHardDenial = true;
		reasons.push(`Duplicate idempotency key: "${idempotencyKey}"`);
	}

	const approved = !hasHardDenial && Object.values(checks).every(Boolean);

	return {
		approved,
		checks,
		downgradeTo: approved ? null : hasHardDenial ? null : downgradeTo,
		reason: approved ? null : reasons.join("; "),
	};
}

function idempotencyKeyExists(
	db: PlanBLedgerDatabase,
	idempotencyKey: string,
): boolean {
	const row = db
		.query(
			"SELECT 1 as found FROM execution_log WHERE idempotency_key = ? LIMIT 1",
		)
		.get(idempotencyKey) as { found: number } | null;
	return row !== null;
}
