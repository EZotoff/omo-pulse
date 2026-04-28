/**
 * Plan B — Canonical Types and Entities
 *
 * Narrow-scope types for single-project, single-session, Tier 1 automation.
 * No cross-session coordination, no TaskWave/DelegationEdge graph, no external primitives.
 *
 * @see /home/ezotoff/omo-hub/.sisyphus/plans/plan-b-implementation.md
 */

// ─── Workflow & Execution ────────────────────────────────────────────

/**
 * Workflow family inferred from observation payload.
 *
 * These are the operational modes that determine how decisions are evaluated
 * and dispatched — not session-level status. Used by the normalizer (Task 3)
 * and preflight guard (Task 5) for policy routing.
 */
export type WorkflowMode =
  | "sisyphus_direct"       // Sisyphus agent working directly on a plan
  | "prometheus_atlas"      // Prometheus plans, Atlas acts (plan-act loop)
  | "ulw_policy"            // Ultrawork loop with policy-driven execution
  | "delegation"            // Agent delegates to sub-agents
  | "unknown"               // Cannot determine from available data

/** Execution lifecycle phase */
export type ExecutionPhase =
  | "select_executable"
  | "preflight"
  | "dispatch"
  | "monitor"
  | "reconcile"

/** Current state of a single execution attempt */
export type ExecutionState =
  | "pending"
  | "preflighting"
  | "approved"
  | "denied"
  | "dispatched"
  | "succeeded"
  | "failed"
  | "timed_out"

// ─── Automation Tier & Risk ──────────────────────────────────────────

/** Automation tier — controls how aggressively decisions are auto-executed */
export type AutomationTier =
  | "shadow"       // Advisory only — no auto-execution
  | "tier1"        // Low-risk decisions may auto-execute

/** Risk classification for a decision type */
export type RiskClass =
  | "low"
  | "medium"
  | "high"
  | "critical"

// ─── Decision & Capability ───────────────────────────────────────────

/** A single decision target identified from a normalized observation */
export type DecisionTarget = {
  /** Unique identifier for this decision instance */
  id: string
  /** The type of decision (e.g. "mark_plan_stale", "log_session_stalled") */
  decisionType: string
  /** Human-readable label */
  label: string
  /** Risk class assigned by the capability registry */
  riskClass: RiskClass
  /** Minimum automation tier required to execute */
  requiredTier: AutomationTier
  /** Target entity identifier (e.g. sourceId, sessionId) */
  targetId: string
  /** Arbitrary context payload for the dispatcher */
  context: Record<string, unknown>
}

/** A registered capability mapping a decision type to an executable primitive */
export type CapabilityEntry = {
  /** Decision type key (e.g. "mark_plan_stale") */
  decisionType: string
  /** Internal primitive name (e.g. "update_ledger_status") */
  primitive: string
  /** Risk classification */
  riskClass: RiskClass
  /** Minimum automation tier required */
  minTier: AutomationTier
  /** Human-readable description */
  description: string
}

// ─── Observation & Fingerprint ───────────────────────────────────────

/** Deterministic fingerprint of a canonical observation for drift detection */
export type ObservationFingerprint = {
  /** Hash of the canonical project state */
  hash: string
  /** Timestamp when the observation was captured (ms) */
  observedAt: number
  /** The source identifier this fingerprint applies to */
  sourceId: string
}

// ─── Preflight ───────────────────────────────────────────────────────

/** Result of a preflight guard evaluation */
export type PreflightResult = {
  /** Whether execution is approved */
  approved: boolean
  /** Per-check results keyed by check name */
  checks: Record<string, boolean>
  /** If not approved, suggested fallback mode */
  downgradeTo: "advisory" | "human_review" | null
  /** Human-readable reason for denial or downgrade */
  reason: string | null
}

// ─── Records (Ledger) ────────────────────────────────────────────────

/** Record of a decision being evaluated */
export type DecisionRecord = {
  /** Unique decision instance ID */
  id: string
  /** Decision type */
  decisionType: string
  /** Source identifier */
  sourceId: string
  /** Session identifier */
  sessionId: string | null
  /** Risk class assigned */
  riskClass: RiskClass
  /** Whether preflight approved execution */
  approved: boolean
  /** Preflight result details */
  preflightResult: PreflightResult | null
  /** ISO timestamp */
  createdAt: string
}

/** Record of an execution attempt */
export type ExecutionRecord = {
  /** Unique execution ID */
  id: string
  /** Decision instance ID this execution corresponds to */
  decisionId: string
  /** Current execution state */
  state: ExecutionState
  /** Current lifecycle phase */
  phase: ExecutionPhase
  /** Idempotency key for deduplication */
  idempotencyKey: string
  /** ISO timestamp of creation */
  createdAt: string
  /** ISO timestamp of last phase transition */
  updatedAt: string
  /** Error message if failed */
  error: string | null
}

/** Record of an execution outcome after reconciliation */
export type OutcomeRecord = {
  /** Unique outcome ID */
  id: string
  /** Execution ID this outcome corresponds to */
  executionId: string
  /** Whether the outcome matched expectations */
  matched: boolean
  /** Expected state description */
  expected: string
  /** Actual state description */
  actual: string
  /** ISO timestamp */
  createdAt: string
}

// ─── Canonical Entities ──────────────────────────────────────────────

/** Canonical representation of a single project at a point in time */
export type CanonicalProject = {
  /** Source registry identifier */
  sourceId: string
  /** Human-readable label */
  label: string
  /** Project root path */
  projectRoot: string
  /** Timestamp when this observation was captured (ms) */
  observedAt: number
}

/** Canonical representation of a single session */
export type CanonicalSession = {
  /** Session identifier */
  sessionId: string
  /** Session label */
  sessionLabel: string
  /** Agent name */
  agent: string
  /** Current status */
  status: string
  /** Current model in use */
  currentModel: string | null
  /** Current tool being executed */
  currentTool: string
  /** ISO timestamp of last update */
  lastUpdated: string
  /** Unix ms timestamp of last update */
  lastUpdatedMs: number
}

/** Canonical representation of plan progress */
export type CanonicalPlanProgress = {
  /** Plan name */
  name: string
  /** Completed task count */
  completed: number
  /** Total task count */
  total: number
  /** Plan status */
  status: string
  /** Whether the plan is stale */
  planStale: boolean
  /** Whether the plan is complete */
  planComplete: boolean
}

/** Fully normalized canonical state derived from a raw dashboard payload */
export type CanonicalState = {
  /** Canonical project info */
  project: CanonicalProject
  /** Deduplicated sessions (mainSession merged into sessions[]) */
  sessions: CanonicalSession[]
  /** Plan progress */
  planProgress: CanonicalPlanProgress | null
  /** Inferred workflow mode */
  workflowMode: WorkflowMode
  /** Decision targets identified from this observation */
  decisionTargets: DecisionTarget[]
  /** Observation fingerprint for drift detection */
  fingerprint: ObservationFingerprint
  /** Raw server timestamp from the payload (ms) */
  serverNowMs: number
}

// ─── Drift ───────────────────────────────────────────────────────────

/** Severity level of detected drift */
export type StalenessLevel = "none" | "mild" | "moderate" | "severe"

/** Report generated by the drift detector */
export type DriftReport = {
  /** Source identifier */
  sourceId: string
  /** Current observation fingerprint */
  fingerprint: ObservationFingerprint
  /** Previous fingerprint from the ledger (null if first observation) */
  previousFingerprint: ObservationFingerprint | null
  /** Milliseconds since last observation */
  stalenessMs: number
  /** Classified drift level */
  driftLevel: StalenessLevel
  /** Recommended action based on drift severity */
  recommendedAction: "none" | "refresh" | "downgrade" | "alert"
  /** ISO timestamp */
  reportedAt: string
}
