/**
 * Plan B — Bounded Automation
 *
 * Narrow-scope automatic execution of low-risk decisions through a fail-closed system.
 * Single-project, single-session, Tier 1 only.
 *
 * @see /home/ezotoff/omo-hub/.sisyphus/plans/plan-b-implementation.md
 */

export {
	getCapability,
	isAllowed,
	listCapabilities,
} from "./capability-registry.js";
export {
	calculateStalenessMs,
	classifyStalenessLevel,
	DEFAULT_EXPECTED_INTERVAL_MS,
	detectDrift,
} from "./drift-detector.js";
export {
	type CreateExecutionInput,
	createExecution,
	EXECUTION_PHASE_ORDER,
	getExecution,
	type ListExecutionsOptions,
	listExecutions,
	type ReconcileExecutionOutcomeInput,
	reconcileExecutionOutcome,
	type TransitionPhaseInput,
	transitionPhase,
} from "./execution-lifecycle.js";
export {
	type DispatchArgs,
	type DispatchResult,
	dispatch,
	type PlanBPrimitive,
	type RecordOutcomeInput,
	recordOutcome,
	validatePrimitive,
} from "./harness-adapter.js";
export {
	type AppendDriftEventInput,
	appendDriftEvent,
	type CreateDecisionRecordInput,
	type CreateExecutionRecordInput,
	type CreateOutcomeRecordInput,
	createPlanBLedgerSqlite,
	type DriftEventRecord,
	getDecisionRecord,
	getExecutionRecord,
	getOutcomeRecord,
	getRateLimitState,
	getSafetySuppression,
	initializePlanBLedgerSchema,
	insertDecisionRecord,
	insertExecutionRecord,
	insertOutcomeRecord,
	type LedgerDecisionRecord,
	listActiveSafetySuppressions,
	listDecisionRecords,
	listDriftEvents,
	listExecutionRecords,
	listOutcomeRecords,
	openPlanBLedgerSqlite,
	PLAN_B_LEDGER_TABLES,
	type PlanBLedgerDatabase,
	type PutSafetySuppressionInput,
	putSafetySuppression,
	type RateLimitStateRecord,
	type SafetySuppressionRecord,
	type SetRateLimitStateInput,
	setRateLimitState,
	type UpdateDecisionRecordInput,
	type UpdateExecutionRecordInput,
	updateDecisionRecord,
	updateExecutionRecord,
	withPlanBLedgerTransaction,
} from "./ledger-sqlite.js";
export {
	buildDecisionTargets,
	buildObservationFingerprint,
	type DecisionInput,
	inferWorkflowMode,
	type NormalizerProjectView,
	normalizePayload,
	type WorkflowInferenceInput,
} from "./normalizer.js";
export {
	type ObserveAndRunPlanBControlLoopArgs,
	observeAndRunPlanBControlLoop,
	type PlanBControlLoopDecisionResult,
	type PlanBControlLoopResult,
	PRIMITIVE_UNAVAILABLE_REASON,
	type RunPlanBControlLoopArgs,
	runPlanBControlLoop,
} from "./orchestrator.js";
export {
	DEFAULT_COOLDOWN_MS,
	DEFAULT_FRESHNESS_THRESHOLD_MS,
	type EvaluatePreflightArgs,
	evaluatePreflight,
} from "./preflight-guard.js";
export {
	type ApproveTierChangeArgs,
	approveTierChange,
	autoDowngradeOnInstability,
	type AutoDowngradeOnInstabilityArgs,
	emergencyDowngrade,
	type EmergencyDowngradeArgs,
	getTier,
	type RequestTierChangeArgs,
	requestTierChange,
} from "./tier-controller.js";

export type {
	AutomationTier,
	CanonicalPlanProgress,
	CanonicalProject,
	CanonicalSession,
	CanonicalState,
	CapabilityEntry,
	DecisionRecord,
	DecisionTarget,
	DriftReport,
	ExecutionPhase,
	ExecutionRecord,
	ExecutionState,
	ObservationFingerprint,
	OutcomeRecord,
	PreflightResult,
	RiskClass,
	StalenessLevel,
	WorkflowMode,
} from "./types.js";
