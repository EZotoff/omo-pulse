import { createHash } from "node:crypto";
import type {
	DashboardMultiProjectPayload,
	ProjectSnapshot,
} from "../../../types.js";
import type {
	CanonicalPlanProgress,
	CanonicalProject,
	CanonicalSession,
	CanonicalState,
	DecisionTarget,
	ObservationFingerprint,
	WorkflowMode,
} from "./types.js";

const SESSION_STALLED_THRESHOLD_MS = 10 * 60 * 1000;

type NormalizerProjectView = {
	sourceId?: unknown;
	label?: unknown;
	projectRoot?: unknown;
	mainSession?: {
		agent?: unknown;
		currentModel?: unknown;
		currentTool?: unknown;
		lastUpdated?: unknown;
		sessionLabel?: unknown;
		sessionId?: unknown;
		status?: unknown;
	};
	sessions?: unknown[];
	planProgress?: {
		name?: unknown;
		completed?: unknown;
		total?: unknown;
		status?: unknown;
		planStale?: unknown;
		planComplete?: unknown;
	};
	lastUpdatedMs?: unknown;
	backgroundTasks?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTimestampMs(value: unknown): number {
	const direct = toNumberOrNull(value);
	if (direct !== null && direct > 0) return direct;

	if (typeof value !== "string") return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toIsoStringFromMs(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "";
	return new Date(ms).toISOString();
}

function normalizeModel(value: unknown): string | null {
	const model = toNonEmptyString(value);
	if (!model || model === "-") return null;
	return model;
}

function normalizeTool(value: unknown): string {
	return toNonEmptyString(value) ?? "-";
}

function normalizeStatus(value: unknown): string {
	return toNonEmptyString(value) ?? "unknown";
}

function resolveObservedAt(
	projectView: NormalizerProjectView,
	serverNowMs: number,
): number {
	const fromSnapshot = toNumberOrNull(projectView.lastUpdatedMs);
	if (fromSnapshot !== null && fromSnapshot > 0) return fromSnapshot;

	const fromMain = parseTimestampMs(projectView.mainSession?.lastUpdated);
	if (fromMain > 0) return fromMain;

	return serverNowMs;
}

function normalizeProject(
	projectView: NormalizerProjectView,
	sourceId: string,
	serverNowMs: number,
): CanonicalProject {
	const label =
		toNonEmptyString(projectView.label) ??
		toNonEmptyString(projectView.projectRoot) ??
		sourceId;
	const projectRoot = toNonEmptyString(projectView.projectRoot) ?? sourceId;

	return {
		sourceId,
		label,
		projectRoot,
		observedAt: resolveObservedAt(projectView, serverNowMs),
	};
}

type SessionCandidate = CanonicalSession & {
	origin: "sessions" | "main";
};

function candidateFromSessionSummary(
	summary: unknown,
): SessionCandidate | null {
	if (!isRecord(summary)) return null;
	const sessionId = toNonEmptyString(summary.sessionId);
	if (!sessionId) return null;

	const lastUpdatedMs = parseTimestampMs(
		summary.lastUpdatedMs ?? summary.lastUpdated,
	);
	const lastUpdatedRaw = toNonEmptyString(summary.lastUpdated);

	return {
		sessionId,
		sessionLabel: toNonEmptyString(summary.sessionLabel) ?? sessionId,
		agent: toNonEmptyString(summary.agent) ?? "unknown",
		status: normalizeStatus(summary.status),
		currentModel: normalizeModel(summary.currentModel),
		currentTool: normalizeTool(summary.currentTool),
		lastUpdated: lastUpdatedRaw ?? toIsoStringFromMs(lastUpdatedMs),
		lastUpdatedMs,
		origin: "sessions",
	};
}

function candidateFromMainSession(
	mainSession: unknown,
): SessionCandidate | null {
	if (!isRecord(mainSession)) return null;
	const sessionId = toNonEmptyString(mainSession.sessionId);
	if (!sessionId) return null;

	const lastUpdatedMs = parseTimestampMs(mainSession.lastUpdated);
	const lastUpdatedRaw = toNonEmptyString(mainSession.lastUpdated);

	return {
		sessionId,
		sessionLabel: toNonEmptyString(mainSession.sessionLabel) ?? sessionId,
		agent: toNonEmptyString(mainSession.agent) ?? "unknown",
		status: normalizeStatus(mainSession.status),
		currentModel: normalizeModel(mainSession.currentModel),
		currentTool: normalizeTool(mainSession.currentTool),
		lastUpdated: lastUpdatedRaw ?? toIsoStringFromMs(lastUpdatedMs),
		lastUpdatedMs,
		origin: "main",
	};
}

function sessionRichness(session: SessionCandidate): number {
	let score = 0;
	if (session.sessionLabel && session.sessionLabel !== session.sessionId)
		score += 1;
	if (session.agent !== "unknown") score += 1;
	if (session.status !== "unknown") score += 1;
	if (session.currentModel !== null) score += 1;
	if (session.currentTool !== "-") score += 1;
	if (session.lastUpdatedMs > 0) score += 1;
	if (session.lastUpdated.length > 0) score += 1;
	return score;
}

function pickPreferredSession(
	a: SessionCandidate,
	b: SessionCandidate,
): SessionCandidate {
	const richnessDiff = sessionRichness(a) - sessionRichness(b);
	if (richnessDiff !== 0) return richnessDiff > 0 ? a : b;

	if (a.lastUpdatedMs !== b.lastUpdatedMs) {
		return a.lastUpdatedMs > b.lastUpdatedMs ? a : b;
	}

	if (a.origin !== b.origin) {
		return a.origin === "sessions" ? a : b;
	}

	const aTieBreaker = `${a.agent}|${a.currentTool}|${a.currentModel ?? ""}|${a.sessionLabel}`;
	const bTieBreaker = `${b.agent}|${b.currentTool}|${b.currentModel ?? ""}|${b.sessionLabel}`;
	return aTieBreaker.localeCompare(bTieBreaker) <= 0 ? a : b;
}

function normalizeSessions(
	projectView: NormalizerProjectView,
): CanonicalSession[] {
	const deduped = new Map<string, SessionCandidate>();

	const sessions = Array.isArray(projectView.sessions)
		? projectView.sessions
		: [];
	for (const summary of sessions) {
		const candidate = candidateFromSessionSummary(summary);
		if (!candidate) continue;

		const existing = deduped.get(candidate.sessionId);
		deduped.set(
			candidate.sessionId,
			existing ? pickPreferredSession(existing, candidate) : candidate,
		);
	}

	const mainCandidate = candidateFromMainSession(projectView.mainSession);
	if (mainCandidate) {
		const existing = deduped.get(mainCandidate.sessionId);
		deduped.set(
			mainCandidate.sessionId,
			existing ? pickPreferredSession(existing, mainCandidate) : mainCandidate,
		);
	}

	return Array.from(deduped.values())
		.map(({ origin: _origin, ...session }) => session)
		.sort((a, b) => {
			const byId = a.sessionId.localeCompare(b.sessionId);
			if (byId !== 0) return byId;
			return b.lastUpdatedMs - a.lastUpdatedMs;
		});
}

function normalizePlanProgress(
	projectView: NormalizerProjectView,
): CanonicalPlanProgress | null {
	const raw = projectView.planProgress;
	if (!isRecord(raw)) return null;

	const completed = toNumberOrNull(raw.completed) ?? 0;
	const total = toNumberOrNull(raw.total) ?? 0;

	return {
		name: toNonEmptyString(raw.name) ?? "unknown",
		completed,
		total,
		status: toNonEmptyString(raw.status) ?? "not started",
		planStale: raw.planStale === true,
		planComplete: raw.planComplete === true,
	};
}

type WorkflowInferenceInput = {
	sessions: CanonicalSession[];
	projectView: NormalizerProjectView;
};

const SPECIALIST_AGENTS = new Set([
	"oracle",
	"hephaestus",
	"explore",
	"librarian",
	"metis",
	"momus",
]);

export function inferWorkflowMode(input: WorkflowInferenceInput): WorkflowMode {
	const textChunks: string[] = [];

	for (const session of input.sessions) {
		textChunks.push(session.agent, session.sessionLabel, session.currentTool);
	}

	const main = input.projectView.mainSession;
	if (main) {
		textChunks.push(
			toNonEmptyString(main.agent) ?? "",
			toNonEmptyString(main.sessionLabel) ?? "",
			toNonEmptyString(main.currentTool) ?? "",
		);
	}

	const rawText = textChunks.join(" ").toLowerCase();

	const hasUlw = /\bultrawork\b|\bulw\b|\/ulw\b/.test(rawText);
	if (hasUlw) return "ulw_policy";

	const hasPrometheus = input.sessions.some((session) =>
		session.agent.toLowerCase().includes("prometheus"),
	);
	const hasAtlas = input.sessions.some((session) =>
		session.agent.toLowerCase().includes("atlas"),
	);
	if (hasPrometheus && hasAtlas) return "prometheus_atlas";

	const hasSisyphus = input.sessions.some((session) =>
		session.agent.toLowerCase().includes("sisyphus"),
	);
	const hasSpecialist = input.sessions.some((session) => {
		const normalizedAgent = session.agent.trim().toLowerCase();
		return SPECIALIST_AGENTS.has(normalizedAgent);
	});

	if (hasSisyphus && hasSpecialist) return "delegation";
	if (hasSisyphus) return "sisyphus_direct";

	return "unknown";
}

type DecisionInput = {
	sourceId: string;
	observedAt: number;
	sessions: CanonicalSession[];
	planProgress: CanonicalPlanProgress | null;
};

function makeDecisionId(
	sourceId: string,
	decisionType: string,
	targetId: string,
): string {
	return `${decisionType}:${sourceId}:${targetId}`;
}

export function buildDecisionTargets(input: DecisionInput): DecisionTarget[] {
	const decisions = new Map<string, DecisionTarget>();

	if (
		input.planProgress?.planStale === true &&
		input.planProgress.planComplete !== true
	) {
		const targetId = input.sourceId;
		const id = makeDecisionId(input.sourceId, "mark_plan_stale", targetId);
		decisions.set(id, {
			id,
			decisionType: "mark_plan_stale",
			label: "Plan appears stale",
			riskClass: "low",
			requiredTier: "tier1",
			targetId,
			context: {
				planName: input.planProgress.name,
				completed: input.planProgress.completed,
				total: input.planProgress.total,
				status: input.planProgress.status,
				planStale: input.planProgress.planStale,
				planComplete: input.planProgress.planComplete,
			},
		});
	}

	for (const session of input.sessions) {
		if (session.status === "question") {
			const id = makeDecisionId(
				input.sourceId,
				"notify_question_pending",
				session.sessionId,
			);
			decisions.set(id, {
				id,
				decisionType: "notify_question_pending",
				label: "Session awaiting answer",
				riskClass: "low",
				requiredTier: "tier1",
				targetId: session.sessionId,
				context: {
					sessionLabel: session.sessionLabel,
					status: session.status,
					lastUpdatedMs: session.lastUpdatedMs,
				},
			});
			continue;
		}

		const isActiveStatus =
			session.status === "busy" ||
			session.status === "thinking" ||
			session.status === "running_tool";
		if (!isActiveStatus) continue;

		const inactiveMs = Math.max(0, input.observedAt - session.lastUpdatedMs);
		if (inactiveMs < SESSION_STALLED_THRESHOLD_MS) continue;

		const id = makeDecisionId(
			input.sourceId,
			"log_session_stalled",
			session.sessionId,
		);
		decisions.set(id, {
			id,
			decisionType: "log_session_stalled",
			label: "Session appears stalled",
			riskClass: "low",
			requiredTier: "tier1",
			targetId: session.sessionId,
			context: {
				sessionLabel: session.sessionLabel,
				status: session.status,
				inactiveMs,
				thresholdMs: SESSION_STALLED_THRESHOLD_MS,
			},
		});
	}

	return Array.from(decisions.values()).sort((a, b) => {
		const byType = a.decisionType.localeCompare(b.decisionType);
		if (byType !== 0) return byType;

		const byTarget = a.targetId.localeCompare(b.targetId);
		if (byTarget !== 0) return byTarget;

		return a.id.localeCompare(b.id);
	});
}

function sortForStableJson(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortForStableJson);
	}

	if (!isRecord(value)) {
		return value;
	}

	const sortedEntries = Object.keys(value)
		.sort((a, b) => a.localeCompare(b))
		.flatMap((key) => {
			const nested = sortForStableJson(value[key]);
			return nested === undefined ? [] : [[key, nested] as const];
		});

	return Object.fromEntries(sortedEntries);
}

export function buildObservationFingerprint(input: {
	project: CanonicalProject;
	sessions: CanonicalSession[];
	planProgress: CanonicalPlanProgress | null;
	workflowMode: WorkflowMode;
	decisionTargets: DecisionTarget[];
}): ObservationFingerprint {
	const canonical = sortForStableJson({
		sourceId: input.project.sourceId,
		project: {
			label: input.project.label,
			projectRoot: input.project.projectRoot,
		},
		workflowMode: input.workflowMode,
		planProgress: input.planProgress,
		sessions: input.sessions.map((session) => ({
			sessionId: session.sessionId,
			sessionLabel: session.sessionLabel,
			agent: session.agent,
			status: session.status,
			currentModel: session.currentModel,
			currentTool: session.currentTool,
			lastUpdatedMs: session.lastUpdatedMs,
		})),
		decisionTargets: input.decisionTargets.map((decision) => ({
			decisionType: decision.decisionType,
			targetId: decision.targetId,
			riskClass: decision.riskClass,
			requiredTier: decision.requiredTier,
			context: decision.context,
		})),
	});

	const digest = createHash("sha256")
		.update(JSON.stringify(canonical))
		.digest("hex");

	return {
		hash: digest,
		observedAt: input.project.observedAt,
		sourceId: input.project.sourceId,
	};
}

function extractProjectView(
	payload: DashboardMultiProjectPayload | ProjectSnapshot | unknown,
	sourceId: string,
): { projectView: NormalizerProjectView; serverNowMs: number } | null {
	if (!isRecord(payload)) return null;

	const maybeProjects = payload.projects;
	if (Array.isArray(maybeProjects)) {
		const projectMatch = maybeProjects.find(
			(project): project is ProjectSnapshot => {
				if (!isRecord(project)) return false;
				return toNonEmptyString(project.sourceId) === sourceId;
			},
		);
		if (!projectMatch) return null;

		return {
			projectView: projectMatch,
			serverNowMs:
				toNumberOrNull(payload.serverNowMs) ?? projectMatch.lastUpdatedMs,
		};
	}

	const payloadSourceId = toNonEmptyString(payload.sourceId);
	if (payloadSourceId && payloadSourceId !== sourceId) return null;
	if (!isRecord(payload.mainSession)) return null;
	if (!Array.isArray(payload.sessions)) return null;

	return {
		projectView: payload,
		serverNowMs:
			toNumberOrNull(payload.serverNowMs) ??
			toNumberOrNull(payload.lastUpdatedMs) ??
			Date.now(),
	};
}

/**
 * Normalize a single raw project payload into Plan B canonical entities.
 *
 * Accepts either:
 * - full `DashboardMultiProjectPayload` + `sourceId` selector, or
 * - a single `ProjectSnapshot`/raw project view for that `sourceId`.
 */
export function normalizePayload(
	payload: DashboardMultiProjectPayload | ProjectSnapshot | unknown,
	sourceId: string,
): CanonicalState | null {
	const extracted = extractProjectView(payload, sourceId);
	if (!extracted) return null;

	const project = normalizeProject(
		extracted.projectView,
		sourceId,
		extracted.serverNowMs,
	);
	const sessions = normalizeSessions(extracted.projectView);
	const planProgress = normalizePlanProgress(extracted.projectView);
	const workflowMode = inferWorkflowMode({
		sessions,
		projectView: extracted.projectView,
	});
	const decisionTargets = buildDecisionTargets({
		sourceId: project.sourceId,
		observedAt: project.observedAt,
		sessions,
		planProgress,
	});
	const fingerprint = buildObservationFingerprint({
		project,
		sessions,
		planProgress,
		workflowMode,
		decisionTargets,
	});

	return {
		project,
		sessions,
		planProgress,
		workflowMode,
		decisionTargets,
		fingerprint,
		serverNowMs: extracted.serverNowMs,
	};
}

export type { DecisionInput, NormalizerProjectView, WorkflowInferenceInput };
