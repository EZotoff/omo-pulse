import { Database, type SQLQueryBindings } from "bun:sqlite";
import type {
	DecisionRecord,
	DriftReport,
	ExecutionPhase,
	ExecutionRecord,
	ExecutionState,
	OutcomeRecord,
	PreflightResult,
	RiskClass,
	StalenessLevel,
} from "./types.js";

export const PLAN_B_LEDGER_TABLES = [
	"decision_log",
	"execution_log",
	"outcome_log",
	"drift_events",
	"safety_suppressions",
	"rate_limit_state",
] as const;

export type PlanBLedgerDatabase = Database;

export type LedgerDecisionRecord = DecisionRecord & {
	updatedAt: string;
};

export type CreateDecisionRecordInput = Omit<DecisionRecord, "createdAt"> & {
	createdAt?: string;
	updatedAt?: string;
};

export type UpdateDecisionRecordInput = {
	id: string;
	decisionType?: string;
	sourceId?: string;
	sessionId?: string | null;
	riskClass?: RiskClass;
	approved?: boolean;
	preflightResult?: PreflightResult | null;
	updatedAt?: string;
};

export type CreateExecutionRecordInput = Omit<
	ExecutionRecord,
	"createdAt" | "updatedAt"
> & {
	createdAt?: string;
	updatedAt?: string;
};

export type UpdateExecutionRecordInput = {
	id: string;
	decisionId?: string;
	state?: ExecutionState;
	phase?: ExecutionPhase;
	idempotencyKey?: string;
	error?: string | null;
	updatedAt?: string;
};

export type CreateOutcomeRecordInput = Omit<OutcomeRecord, "createdAt"> & {
	createdAt?: string;
};

export type RateLimitStateRecord = {
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

export type SetRateLimitStateInput = Omit<
	RateLimitStateRecord,
	"createdAt" | "updatedAt"
> & {
	createdAt?: string;
	updatedAt?: string;
};

export type SafetySuppressionRecord = {
	id: string;
	scope: string;
	scopeId: string;
	reason: string;
	active: boolean;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
	expiresAt: string | null;
};

export type PutSafetySuppressionInput = Omit<
	SafetySuppressionRecord,
	"createdAt" | "updatedAt"
> & {
	createdAt?: string;
	updatedAt?: string;
};

export type DriftEventRecord = {
	id: string;
	sourceId: string;
	fingerprintHash: string;
	previousFingerprintHash: string | null;
	driftLevel: StalenessLevel;
	recommendedAction: DriftReport["recommendedAction"];
	stalenessMs: number;
	report: DriftReport | null;
	createdAt: string;
};

export type AppendDriftEventInput = {
	id: string;
	sourceId: string;
	fingerprintHash: string;
	previousFingerprintHash?: string | null;
	driftLevel: StalenessLevel;
	recommendedAction: DriftReport["recommendedAction"];
	stalenessMs: number;
	report?: DriftReport | null;
	createdAt?: string;
};

const DEFAULT_LIST_LIMIT = 100;

const PLAN_B_LEDGER_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS decision_log (
	id TEXT PRIMARY KEY NOT NULL,
	decision_type TEXT NOT NULL,
	source_id TEXT NOT NULL,
	session_id TEXT,
	risk_class TEXT NOT NULL,
	approved INTEGER NOT NULL,
	preflight_result_json TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_log (
	id TEXT PRIMARY KEY NOT NULL,
	decision_id TEXT NOT NULL,
	state TEXT NOT NULL,
	phase TEXT NOT NULL,
	idempotency_key TEXT NOT NULL UNIQUE,
	error TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (decision_id) REFERENCES decision_log(id)
);

CREATE TABLE IF NOT EXISTS outcome_log (
	id TEXT PRIMARY KEY NOT NULL,
	execution_id TEXT NOT NULL,
	matched INTEGER NOT NULL,
	expected TEXT NOT NULL,
	actual TEXT NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (execution_id) REFERENCES execution_log(id)
);

CREATE TABLE IF NOT EXISTS drift_events (
	id TEXT PRIMARY KEY NOT NULL,
	source_id TEXT NOT NULL,
	fingerprint_hash TEXT NOT NULL,
	previous_fingerprint_hash TEXT,
	drift_level TEXT NOT NULL,
	recommended_action TEXT NOT NULL,
	staleness_ms INTEGER NOT NULL,
	report_json TEXT,
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS safety_suppressions (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	scope_id TEXT NOT NULL,
	reason TEXT NOT NULL,
	active INTEGER NOT NULL,
	metadata_json TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	expires_at TEXT
);

CREATE TABLE IF NOT EXISTS rate_limit_state (
	key TEXT PRIMARY KEY NOT NULL,
	tokens_used INTEGER NOT NULL,
	window_started_at TEXT,
	last_decision_at TEXT,
	last_execution_at TEXT,
	cooldown_until TEXT,
	metadata_json TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_log_source_created_at
	ON decision_log(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_log_decision_created_at
	ON execution_log(decision_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcome_log_execution_created_at
	ON outcome_log(execution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drift_events_source_created_at
	ON drift_events(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_suppressions_scope_active
	ON safety_suppressions(scope, scope_id, active, expires_at);
`;

type DecisionLogRow = {
	id: unknown;
	decision_type: unknown;
	source_id: unknown;
	session_id: unknown;
	risk_class: unknown;
	approved: unknown;
	preflight_result_json: unknown;
	created_at: unknown;
	updated_at: unknown;
};

type ExecutionLogRow = {
	id: unknown;
	decision_id: unknown;
	state: unknown;
	phase: unknown;
	idempotency_key: unknown;
	error: unknown;
	created_at: unknown;
	updated_at: unknown;
};

type OutcomeLogRow = {
	id: unknown;
	execution_id: unknown;
	matched: unknown;
	expected: unknown;
	actual: unknown;
	created_at: unknown;
};

type RateLimitStateRow = {
	key: unknown;
	tokens_used: unknown;
	window_started_at: unknown;
	last_decision_at: unknown;
	last_execution_at: unknown;
	cooldown_until: unknown;
	metadata_json: unknown;
	created_at: unknown;
	updated_at: unknown;
};

type SafetySuppressionRow = {
	id: unknown;
	scope: unknown;
	scope_id: unknown;
	reason: unknown;
	active: unknown;
	metadata_json: unknown;
	created_at: unknown;
	updated_at: unknown;
	expires_at: unknown;
};

type DriftEventRow = {
	id: unknown;
	source_id: unknown;
	fingerprint_hash: unknown;
	previous_fingerprint_hash: unknown;
	drift_level: unknown;
	recommended_action: unknown;
	staleness_ms: unknown;
	report_json: unknown;
	created_at: unknown;
};

function asFiniteNumber(value: unknown): number | null {
	if (typeof value !== "number") return null;
	return Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
	return value === 1 || value === true;
}

function toJson(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return JSON.stringify(value);
}

function fromJson<T>(value: unknown): T | null {
	if (typeof value !== "string" || value.length === 0) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function normalizeIsoTimestamp(value?: string | null): string {
	if (typeof value === "string" && value.length > 0) return value;
	return new Date().toISOString();
}

function normalizeNullableIsoTimestamp(value: unknown): string | null {
	const stringValue = asString(value);
	return stringValue && stringValue.length > 0 ? stringValue : null;
}

function normalizeListLimit(limit?: number): number {
	if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
		return DEFAULT_LIST_LIMIT;
	}
	return Math.floor(limit);
}

function hasOwn(object: object, key: string): boolean {
	return Object.hasOwn(object, key);
}

function readDecisionRecord(
	row: DecisionLogRow | null | undefined,
): LedgerDecisionRecord | null {
	if (!row) return null;
	const id = asString(row.id);
	const decisionType = asString(row.decision_type);
	const sourceId = asString(row.source_id);
	const riskClass = asString(row.risk_class) as RiskClass | null;
	const createdAt = asString(row.created_at);
	const updatedAt = asString(row.updated_at);
	if (
		!id ||
		!decisionType ||
		!sourceId ||
		!riskClass ||
		!createdAt ||
		!updatedAt
	) {
		return null;
	}

	return {
		id,
		decisionType,
		sourceId,
		sessionId:
			normalizeNullableIsoTimestamp(row.session_id) ?? asString(row.session_id),
		riskClass,
		approved: asBoolean(row.approved),
		preflightResult: fromJson<PreflightResult>(row.preflight_result_json),
		createdAt,
		updatedAt,
	};
}

function readExecutionRecord(
	row: ExecutionLogRow | null | undefined,
): ExecutionRecord | null {
	if (!row) return null;
	const id = asString(row.id);
	const decisionId = asString(row.decision_id);
	const state = asString(row.state) as ExecutionState | null;
	const phase = asString(row.phase) as ExecutionPhase | null;
	const idempotencyKey = asString(row.idempotency_key);
	const createdAt = asString(row.created_at);
	const updatedAt = asString(row.updated_at);
	if (
		!id ||
		!decisionId ||
		!state ||
		!phase ||
		!idempotencyKey ||
		!createdAt ||
		!updatedAt
	) {
		return null;
	}

	return {
		id,
		decisionId,
		state,
		phase,
		idempotencyKey,
		createdAt,
		updatedAt,
		error: asString(row.error),
	};
}

function readOutcomeRecord(
	row: OutcomeLogRow | null | undefined,
): OutcomeRecord | null {
	if (!row) return null;
	const id = asString(row.id);
	const executionId = asString(row.execution_id);
	const expected = asString(row.expected);
	const actual = asString(row.actual);
	const createdAt = asString(row.created_at);
	if (!id || !executionId || !expected || !actual || !createdAt) return null;

	return {
		id,
		executionId,
		matched: asBoolean(row.matched),
		expected,
		actual,
		createdAt,
	};
}

function readRateLimitState(
	row: RateLimitStateRow | null | undefined,
): RateLimitStateRecord | null {
	if (!row) return null;
	const key = asString(row.key);
	const tokensUsed = asFiniteNumber(row.tokens_used);
	const createdAt = asString(row.created_at);
	const updatedAt = asString(row.updated_at);
	if (!key || tokensUsed === null || !createdAt || !updatedAt) return null;

	return {
		key,
		tokensUsed,
		windowStartedAt: asString(row.window_started_at),
		lastDecisionAt: asString(row.last_decision_at),
		lastExecutionAt: asString(row.last_execution_at),
		cooldownUntil: asString(row.cooldown_until),
		metadata: fromJson<Record<string, unknown>>(row.metadata_json),
		createdAt,
		updatedAt,
	};
}

function readSafetySuppression(
	row: SafetySuppressionRow | null | undefined,
): SafetySuppressionRecord | null {
	if (!row) return null;
	const id = asString(row.id);
	const scope = asString(row.scope);
	const scopeId = asString(row.scope_id);
	const reason = asString(row.reason);
	const createdAt = asString(row.created_at);
	const updatedAt = asString(row.updated_at);
	if (!id || !scope || !scopeId || !reason || !createdAt || !updatedAt)
		return null;

	return {
		id,
		scope,
		scopeId,
		reason,
		active: asBoolean(row.active),
		metadata: fromJson<Record<string, unknown>>(row.metadata_json),
		createdAt,
		updatedAt,
		expiresAt: asString(row.expires_at),
	};
}

function readDriftEvent(
	row: DriftEventRow | null | undefined,
): DriftEventRecord | null {
	if (!row) return null;
	const id = asString(row.id);
	const sourceId = asString(row.source_id);
	const fingerprintHash = asString(row.fingerprint_hash);
	const driftLevel = asString(row.drift_level) as StalenessLevel | null;
	const recommendedAction = asString(row.recommended_action) as
		| DriftReport["recommendedAction"]
		| null;
	const stalenessMs = asFiniteNumber(row.staleness_ms);
	const createdAt = asString(row.created_at);
	if (
		!id ||
		!sourceId ||
		!fingerprintHash ||
		!driftLevel ||
		!recommendedAction ||
		stalenessMs === null ||
		!createdAt
	) {
		return null;
	}

	return {
		id,
		sourceId,
		fingerprintHash,
		previousFingerprintHash: asString(row.previous_fingerprint_hash),
		driftLevel,
		recommendedAction,
		stalenessMs,
		report: fromJson<DriftReport>(row.report_json),
		createdAt,
	};
}

export function openPlanBLedgerSqlite(
	filename = ":memory:",
): PlanBLedgerDatabase {
	return new Database(filename);
}

export function initializePlanBLedgerSchema(
	db: PlanBLedgerDatabase,
): PlanBLedgerDatabase {
	db.run(PLAN_B_LEDGER_SCHEMA_SQL);
	return db;
}

export function createPlanBLedgerSqlite(
	filename = ":memory:",
): PlanBLedgerDatabase {
	const db = openPlanBLedgerSqlite(filename);
	return initializePlanBLedgerSchema(db);
}

export function withPlanBLedgerTransaction<T>(
	db: PlanBLedgerDatabase,
	fn: () => T,
): T {
	return db.transaction(fn)();
}

export function insertDecisionRecord(
	db: PlanBLedgerDatabase,
	input: CreateDecisionRecordInput,
): LedgerDecisionRecord {
	const createdAt = normalizeIsoTimestamp(input.createdAt);
	const updatedAt = normalizeIsoTimestamp(input.updatedAt ?? createdAt);
	withPlanBLedgerTransaction(db, () => {
		db.query(
			`INSERT INTO decision_log (
					id, decision_type, source_id, session_id, risk_class, approved,
					preflight_result_json, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			input.id,
			input.decisionType,
			input.sourceId,
			input.sessionId,
			input.riskClass,
			input.approved ? 1 : 0,
			toJson(input.preflightResult),
			createdAt,
			updatedAt,
		);
	});

	return {
		id: input.id,
		decisionType: input.decisionType,
		sourceId: input.sourceId,
		sessionId: input.sessionId,
		riskClass: input.riskClass,
		approved: input.approved,
		preflightResult: input.preflightResult,
		createdAt,
		updatedAt,
	};
}

export function getDecisionRecord(
	db: PlanBLedgerDatabase,
	id: string,
): LedgerDecisionRecord | null {
	const row = db
		.query(
			`SELECT id, decision_type, source_id, session_id, risk_class, approved,
			preflight_result_json, created_at, updated_at
			FROM decision_log WHERE id = ? LIMIT 1`,
		)
		.get(id) as DecisionLogRow | null;
	return readDecisionRecord(row);
}

export function updateDecisionRecord(
	db: PlanBLedgerDatabase,
	patch: UpdateDecisionRecordInput,
): LedgerDecisionRecord | null {
	const current = getDecisionRecord(db, patch.id);
	if (!current) return null;

	const next: LedgerDecisionRecord = {
		...current,
		decisionType:
			hasOwn(patch, "decisionType") && patch.decisionType
				? patch.decisionType
				: current.decisionType,
		sourceId:
			hasOwn(patch, "sourceId") && patch.sourceId
				? patch.sourceId
				: current.sourceId,
		sessionId: hasOwn(patch, "sessionId")
			? (patch.sessionId ?? null)
			: current.sessionId,
		riskClass:
			hasOwn(patch, "riskClass") && patch.riskClass
				? patch.riskClass
				: current.riskClass,
		approved: hasOwn(patch, "approved")
			? Boolean(patch.approved)
			: current.approved,
		preflightResult: hasOwn(patch, "preflightResult")
			? (patch.preflightResult ?? null)
			: current.preflightResult,
		updatedAt: normalizeIsoTimestamp(patch.updatedAt),
	};

	withPlanBLedgerTransaction(db, () => {
		db.query(
			`UPDATE decision_log
				SET decision_type = ?, source_id = ?, session_id = ?, risk_class = ?, approved = ?,
				preflight_result_json = ?, updated_at = ?
				WHERE id = ?`,
		).run(
			next.decisionType,
			next.sourceId,
			next.sessionId,
			next.riskClass,
			next.approved ? 1 : 0,
			toJson(next.preflightResult),
			next.updatedAt,
			next.id,
		);
	});

	return next;
}

export function listDecisionRecords(
	db: PlanBLedgerDatabase,
	opts?: { sourceId?: string; sessionId?: string; limit?: number },
): LedgerDecisionRecord[] {
	const clauses: string[] = [];
	const args: SQLQueryBindings[] = [];
	if (opts?.sourceId) {
		clauses.push("source_id = ?");
		args.push(opts.sourceId);
	}
	if (opts?.sessionId) {
		clauses.push("session_id = ?");
		args.push(opts.sessionId);
	}

	const sql = `SELECT id, decision_type, source_id, session_id, risk_class, approved,
		preflight_result_json, created_at, updated_at
		FROM decision_log${clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : ""}
		ORDER BY created_at DESC, id DESC LIMIT ?`;
	const rows = db
		.query(sql)
		.all(...args, normalizeListLimit(opts?.limit)) as DecisionLogRow[];
	return rows
		.map((row) => readDecisionRecord(row))
		.filter((row): row is LedgerDecisionRecord => row !== null);
}

export function insertExecutionRecord(
	db: PlanBLedgerDatabase,
	input: CreateExecutionRecordInput,
): ExecutionRecord {
	const createdAt = normalizeIsoTimestamp(input.createdAt);
	const updatedAt = normalizeIsoTimestamp(input.updatedAt ?? createdAt);
	withPlanBLedgerTransaction(db, () => {
		db.query(
			`INSERT INTO execution_log (
					id, decision_id, state, phase, idempotency_key, error, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			input.id,
			input.decisionId,
			input.state,
			input.phase,
			input.idempotencyKey,
			input.error,
			createdAt,
			updatedAt,
		);
	});

	return {
		id: input.id,
		decisionId: input.decisionId,
		state: input.state,
		phase: input.phase,
		idempotencyKey: input.idempotencyKey,
		createdAt,
		updatedAt,
		error: input.error,
	};
}

export function getExecutionRecord(
	db: PlanBLedgerDatabase,
	id: string,
): ExecutionRecord | null {
	const row = db
		.query(
			`SELECT id, decision_id, state, phase, idempotency_key, error, created_at, updated_at
			FROM execution_log WHERE id = ? LIMIT 1`,
		)
		.get(id) as ExecutionLogRow | null;
	return readExecutionRecord(row);
}

export function updateExecutionRecord(
	db: PlanBLedgerDatabase,
	patch: UpdateExecutionRecordInput,
): ExecutionRecord | null {
	const current = getExecutionRecord(db, patch.id);
	if (!current) return null;

	const next: ExecutionRecord = {
		...current,
		decisionId:
			hasOwn(patch, "decisionId") && patch.decisionId
				? patch.decisionId
				: current.decisionId,
		state: hasOwn(patch, "state") && patch.state ? patch.state : current.state,
		phase: hasOwn(patch, "phase") && patch.phase ? patch.phase : current.phase,
		idempotencyKey:
			hasOwn(patch, "idempotencyKey") && patch.idempotencyKey
				? patch.idempotencyKey
				: current.idempotencyKey,
		error: hasOwn(patch, "error") ? (patch.error ?? null) : current.error,
		updatedAt: normalizeIsoTimestamp(patch.updatedAt),
	};

	withPlanBLedgerTransaction(db, () => {
		db.query(
			`UPDATE execution_log
				SET decision_id = ?, state = ?, phase = ?, idempotency_key = ?, error = ?, updated_at = ?
				WHERE id = ?`,
		).run(
			next.decisionId,
			next.state,
			next.phase,
			next.idempotencyKey,
			next.error,
			next.updatedAt,
			next.id,
		);
	});

	return next;
}

export function listExecutionRecords(
	db: PlanBLedgerDatabase,
	opts?: { decisionId?: string; state?: ExecutionState; limit?: number },
): ExecutionRecord[] {
	const clauses: string[] = [];
	const args: SQLQueryBindings[] = [];
	if (opts?.decisionId) {
		clauses.push("decision_id = ?");
		args.push(opts.decisionId);
	}
	if (opts?.state) {
		clauses.push("state = ?");
		args.push(opts.state);
	}

	const sql = `SELECT id, decision_id, state, phase, idempotency_key, error, created_at, updated_at
		FROM execution_log${clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : ""}
		ORDER BY updated_at DESC, id DESC LIMIT ?`;
	const rows = db
		.query(sql)
		.all(...args, normalizeListLimit(opts?.limit)) as ExecutionLogRow[];
	return rows
		.map((row) => readExecutionRecord(row))
		.filter((row): row is ExecutionRecord => row !== null);
}

export function insertOutcomeRecord(
	db: PlanBLedgerDatabase,
	input: CreateOutcomeRecordInput,
): OutcomeRecord {
	const createdAt = normalizeIsoTimestamp(input.createdAt);
	withPlanBLedgerTransaction(db, () => {
		db.query(
			`INSERT INTO outcome_log (id, execution_id, matched, expected, actual, created_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
		).run(
			input.id,
			input.executionId,
			input.matched ? 1 : 0,
			input.expected,
			input.actual,
			createdAt,
		);
	});

	return {
		id: input.id,
		executionId: input.executionId,
		matched: input.matched,
		expected: input.expected,
		actual: input.actual,
		createdAt,
	};
}

export function getOutcomeRecord(
	db: PlanBLedgerDatabase,
	id: string,
): OutcomeRecord | null {
	const row = db
		.query(
			"SELECT id, execution_id, matched, expected, actual, created_at FROM outcome_log WHERE id = ? LIMIT 1",
		)
		.get(id) as OutcomeLogRow | null;
	return readOutcomeRecord(row);
}

export function listOutcomeRecords(
	db: PlanBLedgerDatabase,
	opts?: { executionId?: string; limit?: number },
): OutcomeRecord[] {
	const clauses: string[] = [];
	const args: SQLQueryBindings[] = [];
	if (opts?.executionId) {
		clauses.push("execution_id = ?");
		args.push(opts.executionId);
	}

	const sql = `SELECT id, execution_id, matched, expected, actual, created_at
		FROM outcome_log${clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : ""}
		ORDER BY created_at DESC, id DESC LIMIT ?`;
	const rows = db
		.query(sql)
		.all(...args, normalizeListLimit(opts?.limit)) as OutcomeLogRow[];
	return rows
		.map((row) => readOutcomeRecord(row))
		.filter((row): row is OutcomeRecord => row !== null);
}

export function getRateLimitState(
	db: PlanBLedgerDatabase,
	key: string,
): RateLimitStateRecord | null {
	const row = db
		.query(
			`SELECT key, tokens_used, window_started_at, last_decision_at, last_execution_at,
			cooldown_until, metadata_json, created_at, updated_at
			FROM rate_limit_state WHERE key = ? LIMIT 1`,
		)
		.get(key) as RateLimitStateRow | null;
	return readRateLimitState(row);
}

export function setRateLimitState(
	db: PlanBLedgerDatabase,
	input: SetRateLimitStateInput,
): RateLimitStateRecord {
	const existing = getRateLimitState(db, input.key);
	const createdAt = normalizeIsoTimestamp(
		input.createdAt ?? existing?.createdAt,
	);
	const updatedAt = normalizeIsoTimestamp(input.updatedAt);
	withPlanBLedgerTransaction(db, () => {
		db.query(
			`INSERT INTO rate_limit_state (
					key, tokens_used, window_started_at, last_decision_at, last_execution_at,
					cooldown_until, metadata_json, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(key) DO UPDATE SET
					tokens_used = excluded.tokens_used,
					window_started_at = excluded.window_started_at,
					last_decision_at = excluded.last_decision_at,
					last_execution_at = excluded.last_execution_at,
					cooldown_until = excluded.cooldown_until,
					metadata_json = excluded.metadata_json,
					updated_at = excluded.updated_at`,
		).run(
			input.key,
			input.tokensUsed,
			input.windowStartedAt,
			input.lastDecisionAt,
			input.lastExecutionAt,
			input.cooldownUntil,
			toJson(input.metadata),
			createdAt,
			updatedAt,
		);
	});

	return {
		key: input.key,
		tokensUsed: input.tokensUsed,
		windowStartedAt: input.windowStartedAt,
		lastDecisionAt: input.lastDecisionAt,
		lastExecutionAt: input.lastExecutionAt,
		cooldownUntil: input.cooldownUntil,
		metadata: input.metadata,
		createdAt,
		updatedAt,
	};
}

export function getSafetySuppression(
	db: PlanBLedgerDatabase,
	id: string,
): SafetySuppressionRecord | null {
	const row = db
		.query(
			`SELECT id, scope, scope_id, reason, active, metadata_json, created_at, updated_at, expires_at
			FROM safety_suppressions WHERE id = ? LIMIT 1`,
		)
		.get(id) as SafetySuppressionRow | null;
	return readSafetySuppression(row);
}

export function putSafetySuppression(
	db: PlanBLedgerDatabase,
	input: PutSafetySuppressionInput,
): SafetySuppressionRecord {
	const existing = getSafetySuppression(db, input.id);
	const createdAt = normalizeIsoTimestamp(
		input.createdAt ?? existing?.createdAt,
	);
	const updatedAt = normalizeIsoTimestamp(input.updatedAt);
	withPlanBLedgerTransaction(db, () => {
		db.query(
			`INSERT INTO safety_suppressions (
					id, scope, scope_id, reason, active, metadata_json, created_at, updated_at, expires_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					scope = excluded.scope,
					scope_id = excluded.scope_id,
					reason = excluded.reason,
					active = excluded.active,
					metadata_json = excluded.metadata_json,
					updated_at = excluded.updated_at,
					expires_at = excluded.expires_at`,
		).run(
			input.id,
			input.scope,
			input.scopeId,
			input.reason,
			input.active ? 1 : 0,
			toJson(input.metadata),
			createdAt,
			updatedAt,
			input.expiresAt,
		);
	});

	return {
		id: input.id,
		scope: input.scope,
		scopeId: input.scopeId,
		reason: input.reason,
		active: input.active,
		metadata: input.metadata,
		createdAt,
		updatedAt,
		expiresAt: input.expiresAt,
	};
}

export function listActiveSafetySuppressions(
	db: PlanBLedgerDatabase,
	opts?: { scope?: string; scopeId?: string; asOf?: string; limit?: number },
): SafetySuppressionRecord[] {
	const clauses = ["active = 1", "(expires_at IS NULL OR expires_at > ?)"];
	const args: SQLQueryBindings[] = [normalizeIsoTimestamp(opts?.asOf)];
	if (opts?.scope) {
		clauses.push("scope = ?");
		args.push(opts.scope);
	}
	if (opts?.scopeId) {
		clauses.push("scope_id = ?");
		args.push(opts.scopeId);
	}

	const sql = `SELECT id, scope, scope_id, reason, active, metadata_json, created_at, updated_at, expires_at
		FROM safety_suppressions WHERE ${clauses.join(" AND ")}
		ORDER BY updated_at DESC, id DESC LIMIT ?`;
	const rows = db
		.query(sql)
		.all(...args, normalizeListLimit(opts?.limit)) as SafetySuppressionRow[];
	return rows
		.map((row) => readSafetySuppression(row))
		.filter((row): row is SafetySuppressionRecord => row !== null);
}

export function appendDriftEvent(
	db: PlanBLedgerDatabase,
	input: AppendDriftEventInput,
): DriftEventRecord {
	const createdAt = normalizeIsoTimestamp(input.createdAt);
	withPlanBLedgerTransaction(db, () => {
		db.query(
			`INSERT INTO drift_events (
					id, source_id, fingerprint_hash, previous_fingerprint_hash, drift_level,
					recommended_action, staleness_ms, report_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			input.id,
			input.sourceId,
			input.fingerprintHash,
			input.previousFingerprintHash ?? null,
			input.driftLevel,
			input.recommendedAction,
			input.stalenessMs,
			toJson(input.report),
			createdAt,
		);
	});

	return {
		id: input.id,
		sourceId: input.sourceId,
		fingerprintHash: input.fingerprintHash,
		previousFingerprintHash: input.previousFingerprintHash ?? null,
		driftLevel: input.driftLevel,
		recommendedAction: input.recommendedAction,
		stalenessMs: input.stalenessMs,
		report: input.report ?? null,
		createdAt,
	};
}

export function listDriftEvents(
	db: PlanBLedgerDatabase,
	opts?: { sourceId?: string; limit?: number },
): DriftEventRecord[] {
	const clauses: string[] = [];
	const args: SQLQueryBindings[] = [];
	if (opts?.sourceId) {
		clauses.push("source_id = ?");
		args.push(opts.sourceId);
	}

	const sql = `SELECT id, source_id, fingerprint_hash, previous_fingerprint_hash, drift_level,
		recommended_action, staleness_ms, report_json, created_at
		FROM drift_events${clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : ""}
		ORDER BY created_at DESC, id DESC LIMIT ?`;
	const rows = db
		.query(sql)
		.all(...args, normalizeListLimit(opts?.limit)) as DriftEventRow[];
	return rows
		.map((row) => readDriftEvent(row))
		.filter((row): row is DriftEventRecord => row !== null);
}
