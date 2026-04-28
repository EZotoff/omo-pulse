import {
	getExecutionRecord,
	insertExecutionRecord,
	insertOutcomeRecord,
	listExecutionRecords,
	type PlanBLedgerDatabase,
	updateExecutionRecord,
} from "./ledger-sqlite.js";
import type { ExecutionPhase, ExecutionRecord, ExecutionState } from "./types.js";

export const EXECUTION_PHASE_ORDER: readonly ExecutionPhase[] = [
	"select_executable",
	"preflight",
	"dispatch",
	"monitor",
	"reconcile",
] as const;

const PHASE_INDEX = new Map<ExecutionPhase, number>(
	EXECUTION_PHASE_ORDER.map((phase, index) => [phase, index]),
);

function randomId(): string {
	return crypto.randomUUID();
}

function nowIso(): string {
	return new Date().toISOString();
}

function validatePhaseTransition(
	currentPhase: ExecutionPhase,
	nextPhase: ExecutionPhase,
): void {
	const currentIndex = PHASE_INDEX.get(currentPhase);
	const nextIndex = PHASE_INDEX.get(nextPhase);

	if (currentIndex === undefined) {
		throw new Error(
			`Invalid current phase "${currentPhase}" — not in EXECUTION_PHASE_ORDER`,
		);
	}
	if (nextIndex === undefined) {
		throw new Error(
			`Invalid next phase "${nextPhase}" — not in EXECUTION_PHASE_ORDER`,
		);
	}
	if (nextIndex !== currentIndex + 1) {
		throw new Error(
			`Invalid phase transition from "${currentPhase}" to "${nextPhase}" ` +
				`— phases cannot be skipped or reversed`,
		);
	}
}

export type CreateExecutionInput = {
	db: PlanBLedgerDatabase;
	decisionId: string;
	idempotencyKey: string;
	id?: string;
};

export function createExecution(
	args: CreateExecutionInput,
): ExecutionRecord {
	const { db, decisionId, idempotencyKey } = args;
	const id = args.id ?? randomId();
	const now = nowIso();

	return insertExecutionRecord(db, {
		id,
		decisionId,
		state: "pending",
		phase: "select_executable",
		idempotencyKey,
		error: null,
		createdAt: now,
		updatedAt: now,
	});
}

export type TransitionPhaseInput = {
	db: PlanBLedgerDatabase;
	id: string;
	phase: ExecutionPhase;
	state?: ExecutionState;
	error?: string | null;
};

export function transitionPhase(
	args: TransitionPhaseInput,
): ExecutionRecord {
	const { db, id, phase: nextPhase, state: nextState, error: nextError } = args;

	const current = getExecutionRecord(db, id);
	if (!current) {
		throw new Error(`Execution "${id}" not found`);
	}

	validatePhaseTransition(current.phase, nextPhase);

	const patch: Parameters<typeof updateExecutionRecord>[1] = {
		id,
		phase: nextPhase,
		updatedAt: nowIso(),
	};

	if (nextState !== undefined) {
		patch.state = nextState;
	}
	if (nextError !== undefined) {
		patch.error = nextError;
	}

	const updated = updateExecutionRecord(db, patch);
	if (!updated) {
		throw new Error(`Failed to update execution "${id}" — record disappeared`);
	}

	return updated;
}

export function getExecution(
	db: PlanBLedgerDatabase,
	id: string,
): ExecutionRecord | null {
	return getExecutionRecord(db, id);
}

export type ListExecutionsOptions = {
	decisionId?: string;
	state?: ExecutionState;
	limit?: number;
};

export function listExecutions(
	db: PlanBLedgerDatabase,
	options?: ListExecutionsOptions,
): ExecutionRecord[] {
	return listExecutionRecords(db, options);
}

export type TransitionToDispatchedInput = {
	db: PlanBLedgerDatabase;
	id: string;
};

/**
 * Validated lifecycle transition to the "dispatch" phase.
 * Requires the current phase to be "preflight" (enforced by transitionPhase).
 * Sets state to "dispatched".
 */
export function transitionToDispatched(
	args: TransitionToDispatchedInput,
): ExecutionRecord {
	return transitionPhase({
		db: args.db,
		id: args.id,
		phase: "dispatch",
		state: "dispatched",
	});
}

export type ReconcileExecutionOutcomeInput = {
	db: PlanBLedgerDatabase;
	executionId: string;
	expected: string;
	actual: string;
	id?: string;
};

export function reconcileExecutionOutcome(
	args: ReconcileExecutionOutcomeInput,
): import("./types.js").OutcomeRecord {
	const { db, executionId, expected, actual } = args;
	const id = args.id ?? randomId();
	const matched = expected === actual;

	return insertOutcomeRecord(db, {
		id,
		executionId,
		matched,
		expected,
		actual,
		createdAt: nowIso(),
	});
}
