import {
	appendDriftEvent,
	getExecutionRecord,
	getRateLimitState,
	setRateLimitState,
	withPlanBLedgerTransaction,
	type PlanBLedgerDatabase,
} from "./ledger-sqlite.js";
import {
	reconcileExecutionOutcome,
	transitionToDispatched,
	type ReconcileExecutionOutcomeInput,
} from "./execution-lifecycle.js";
import type { DriftReport, ExecutionState } from "./types.js";

export type PlanBPrimitive =
	| "update_ledger_status"
	| "append_drift_event"
	| "publish_advisory";

const VALID_PRIMITIVES: readonly PlanBPrimitive[] = [
	"update_ledger_status",
	"append_drift_event",
	"publish_advisory",
];

export function validatePrimitive(primitive: string): PlanBPrimitive {
	if ((VALID_PRIMITIVES as readonly string[]).includes(primitive)) {
		return primitive as PlanBPrimitive;
	}
	throw new Error(`Unknown primitive: "${primitive}"`);
}

function isPostDispatchState(state: ExecutionState): boolean {
	return (
		state === "dispatched" ||
		state === "succeeded" ||
		state === "failed" ||
		state === "timed_out"
	);
}

export type DispatchArgs = {
	db: PlanBLedgerDatabase;
	executionId: string;
	decisionType: string;
	targetId: string;
	primitive: string;
	idempotencyKey: string;
	context: Record<string, unknown>;
	driftReport?: DriftReport;
};

export type DispatchResult = {
	noOp: boolean;
	executionId: string;
	state: ExecutionState;
};

export function dispatch(args: DispatchArgs): DispatchResult {
	const {
		db,
		executionId,
		decisionType,
		targetId,
		primitive,
		idempotencyKey,
		context,
		driftReport,
	} = args;

	const validatedPrimitive = validatePrimitive(primitive);

	const execution = getExecutionRecord(db, executionId);
	if (!execution) {
		throw new Error(`Execution "${executionId}" not found`);
	}

	if (execution.idempotencyKey !== idempotencyKey) {
		throw new Error(
			`Idempotency key mismatch for execution "${executionId}": expected "${idempotencyKey}" but stored "${execution.idempotencyKey}"`,
		);
	}

	if (isPostDispatchState(execution.state)) {
		return { noOp: true, executionId, state: execution.state };
	}

	const now = new Date().toISOString();

	withPlanBLedgerTransaction(db, () => {
		switch (validatedPrimitive) {
			case "update_ledger_status": {
				const key = `${decisionType}:${targetId}`;
				const existing = getRateLimitState(db, key);
				const metadata: Record<string, unknown> = {
					primitive,
					decisionType,
					targetId,
					executionId,
					status:
						typeof context.status === "string" ? context.status : "open",
				};
				setRateLimitState(db, {
					key,
					tokensUsed: (existing?.tokensUsed ?? 0) + 1,
					windowStartedAt: existing?.windowStartedAt ?? null,
					lastDecisionAt: now,
					lastExecutionAt: now,
					cooldownUntil: existing?.cooldownUntil ?? null,
					metadata,
				});
				break;
			}
			case "append_drift_event": {
				if (!driftReport) {
					throw new Error(
						`Primitive "append_drift_event" requires driftReport`,
					);
				}
				appendDriftEvent(db, {
					id: crypto.randomUUID(),
					sourceId: driftReport.sourceId,
					fingerprintHash: driftReport.fingerprint.hash,
					previousFingerprintHash:
						driftReport.previousFingerprint?.hash ?? null,
					driftLevel: driftReport.driftLevel,
					recommendedAction: driftReport.recommendedAction,
					stalenessMs: driftReport.stalenessMs,
					report: driftReport,
				});
				break;
			}
			case "publish_advisory": {
				throw new Error(
					`PrimitiveUnavailable: publish_advisory has no sink in current repo`,
				);
			}
		}

		transitionToDispatched({ db, id: executionId });
	});

	return { noOp: false, executionId, state: "dispatched" };
}

export type RecordOutcomeInput = ReconcileExecutionOutcomeInput;

export function recordOutcome(
	args: RecordOutcomeInput,
): import("./types.js").OutcomeRecord {
	return reconcileExecutionOutcome(args);
}
