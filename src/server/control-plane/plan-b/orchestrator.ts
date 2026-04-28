import type { DashboardMultiProjectPayload, ProjectSnapshot } from "../../../types.js";
import { getCapability } from "./capability-registry.js";
import { detectDrift } from "./drift-detector.js";
import { createExecution, transitionPhase } from "./execution-lifecycle.js";
import { dispatch, recordOutcome } from "./harness-adapter.js";
import {
	insertDecisionRecord,
	listDriftEvents,
	type PlanBLedgerDatabase,
	withPlanBLedgerTransaction,
} from "./ledger-sqlite.js";
import { normalizePayload } from "./normalizer.js";
import { evaluatePreflight } from "./preflight-guard.js";
import { autoDowngradeOnInstability } from "./tier-controller.js";
import type {
	AutomationTier,
	CanonicalState,
	DriftReport,
	ObservationFingerprint,
	PreflightResult,
} from "./types.js";

const PRIMITIVE_UNAVAILABLE_REASON =
	"PrimitiveUnavailable: publish_advisory has no sink in current repo";

const SUPPORTED_PRIMITIVES = new Set<string>([
	"update_ledger_status",
	"append_drift_event",
]);

const DECISION_SCOPE_BY_TYPE: Record<string, "project" | "session"> = {
	mark_plan_stale: "project",
	log_session_stalled: "session",
	notify_question_pending: "session",
};

export type PlanBControlLoopDecisionResult = {
	decisionId: string;
	decisionType: string;
	targetId: string;
	primitive: string | null;
	preflightResult: PreflightResult | null;
	action: "advisory_only" | "dispatched";
	reason: string | null;
	executionId: string | null;
	outcomeMatched: boolean | null;
};

export type PlanBControlLoopResult = {
	sourceId: string;
	tier: AutomationTier;
	normalized: CanonicalState | null;
	driftReport: DriftReport | null;
	decisions: PlanBControlLoopDecisionResult[];
};

export type RunPlanBControlLoopArgs = {
	payload: DashboardMultiProjectPayload | ProjectSnapshot | unknown;
	sourceId: string;
	db: PlanBLedgerDatabase;
	currentTier: AutomationTier;
	decisionFilter?: {
		decisionType: string;
		targetId: string;
	};
	nowMs?: number;
};

export type ObserveAndRunPlanBControlLoopArgs = {
	getMultiProjectPayload:
		| (() => Promise<DashboardMultiProjectPayload>)
		| (() => DashboardMultiProjectPayload);
	sourceId: string;
	db: PlanBLedgerDatabase;
	currentTier: AutomationTier;
	decisionFilter?: {
		decisionType: string;
		targetId: string;
	};
	nowMs?: number;
};

function buildIdempotencyKey(args: {
	decisionType: string;
	targetId: string;
	fingerprintHash: string;
}): string {
	return `${args.decisionType}:${args.targetId}:${args.fingerprintHash}`;
}

function extractPreviousFingerprint(
	sourceId: string,
	latestEvent: ReturnType<typeof listDriftEvents>[number] | null,
): ObservationFingerprint | null {
	if (!latestEvent) return null;

	if (latestEvent.report?.fingerprint) {
		return latestEvent.report.fingerprint;
	}

	const observedAt = Date.parse(latestEvent.createdAt);
	return {
		hash: latestEvent.fingerprintHash,
		sourceId,
		observedAt: Number.isFinite(observedAt) ? observedAt : 0,
	};
}

function scopeForDecisionType(decisionType: string): "project" | "session" | undefined {
	return DECISION_SCOPE_BY_TYPE[decisionType];
}

function sessionIdForDecision(args: {
	decisionType: string;
	targetId: string;
}): string | null {
	return scopeForDecisionType(args.decisionType) === "session"
		? args.targetId
		: null;
}

export function runPlanBControlLoop(
	args: RunPlanBControlLoopArgs,
): PlanBControlLoopResult {
	const normalized = normalizePayload(args.payload, args.sourceId);
	if (!normalized) {
		return {
			sourceId: args.sourceId,
			tier: args.currentTier,
			normalized: null,
			driftReport: null,
			decisions: [],
		};
	}

	const nowMs = args.nowMs ?? Date.now();
	const latestDriftEvent =
		listDriftEvents(args.db, { sourceId: args.sourceId, limit: 1 })[0] ?? null;
	const previousFingerprint = extractPreviousFingerprint(
		args.sourceId,
		latestDriftEvent,
	);
	const driftReport = detectDrift({
		sourceId: args.sourceId,
		current: normalized.fingerprint,
		previous: previousFingerprint,
		nowMs,
	});

	const effectiveTier = autoDowngradeOnInstability({
		db: args.db,
		currentTier: args.currentTier,
		driftReport,
	});

	const decisionTargets = args.decisionFilter
		? normalized.decisionTargets.filter(
				(decisionTarget) =>
					decisionTarget.decisionType === args.decisionFilter?.decisionType &&
					decisionTarget.targetId === args.decisionFilter?.targetId,
			)
		: normalized.decisionTargets;

	const decisions: PlanBControlLoopDecisionResult[] = [];

	for (const decisionTarget of decisionTargets) {
		const capability = getCapability(decisionTarget.decisionType);
		const primitive = capability?.primitive ?? null;
		const idempotencyKey = buildIdempotencyKey({
			decisionType: decisionTarget.decisionType,
			targetId: decisionTarget.targetId,
			fingerprintHash: normalized.fingerprint.hash,
		});

		let preflightResult: PreflightResult | null = null;
		let approved = false;
		let action: PlanBControlLoopDecisionResult["action"] = "advisory_only";
		let reason: string | null = null;
		let executionId: string | null = null;
		let outcomeMatched: boolean | null = null;

		if (effectiveTier === "shadow") {
			approved = false;
			reason = `Automation tier "shadow" is advisory-only`;
		} else {
			preflightResult = evaluatePreflight({
				db: args.db,
				decisionType: decisionTarget.decisionType,
				targetId: decisionTarget.targetId,
				currentTier: effectiveTier,
				observedAtMs: normalized.fingerprint.observedAt,
				nowMs,
				driftReport,
				idempotencyKey,
				scope: scopeForDecisionType(decisionTarget.decisionType),
			});

			approved = preflightResult.approved;

			if (!approved) {
				reason = preflightResult.reason;
			} else if (!primitive || !SUPPORTED_PRIMITIVES.has(primitive)) {
				reason = PRIMITIVE_UNAVAILABLE_REASON;
			}
		}

		const decisionId = crypto.randomUUID();
		insertDecisionRecord(args.db, {
			id: decisionId,
			decisionType: decisionTarget.decisionType,
			sourceId: args.sourceId,
			sessionId: sessionIdForDecision({
				decisionType: decisionTarget.decisionType,
				targetId: decisionTarget.targetId,
			}),
			riskClass: decisionTarget.riskClass,
			approved,
			preflightResult,
		});

		if (approved && primitive && SUPPORTED_PRIMITIVES.has(primitive)) {
			withPlanBLedgerTransaction(args.db, () => {
				const execution = createExecution({
					db: args.db,
					decisionId,
					idempotencyKey,
				});
				executionId = execution.id;

				transitionPhase({
					db: args.db,
					id: execution.id,
					phase: "preflight",
					state: "preflighting",
				});

				dispatch({
					db: args.db,
					executionId: execution.id,
					decisionType: decisionTarget.decisionType,
					targetId: decisionTarget.targetId,
					primitive,
					idempotencyKey,
					context: decisionTarget.context,
					driftReport,
				});

				transitionPhase({
					db: args.db,
					id: execution.id,
					phase: "monitor",
					state: "dispatched",
				});

				const outcome = recordOutcome({
					db: args.db,
					executionId: execution.id,
					expected: "dispatched",
					actual: "dispatched",
				});

				outcomeMatched = outcome.matched;
				action = "dispatched";

				transitionPhase({
					db: args.db,
					id: execution.id,
					phase: "reconcile",
					state: outcome.matched ? "succeeded" : "failed",
				});
			});
		}

		decisions.push({
			decisionId,
			decisionType: decisionTarget.decisionType,
			targetId: decisionTarget.targetId,
			primitive,
			preflightResult,
			action,
			reason,
			executionId,
			outcomeMatched,
		});
	}

	return {
		sourceId: args.sourceId,
		tier: effectiveTier,
		normalized,
		driftReport,
		decisions,
	};
}

export async function observeAndRunPlanBControlLoop(
	args: ObserveAndRunPlanBControlLoopArgs,
): Promise<PlanBControlLoopResult> {
	const payload = await Promise.resolve(args.getMultiProjectPayload());
	return runPlanBControlLoop({
		payload,
		sourceId: args.sourceId,
		db: args.db,
		currentTier: args.currentTier,
		decisionFilter: args.decisionFilter,
		nowMs: args.nowMs,
	});
}

export { PRIMITIVE_UNAVAILABLE_REASON };
