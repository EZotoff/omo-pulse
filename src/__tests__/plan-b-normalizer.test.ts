import { describe, expect, it } from "vitest";
import {
	buildDecisionTargets,
	buildObservationFingerprint,
	inferWorkflowMode,
	normalizePayload,
} from "../server/control-plane/plan-b/normalizer";
import type {
	CanonicalPlanProgress,
	CanonicalProject,
	CanonicalSession,
	DecisionTarget,
	WorkflowMode,
} from "../server/control-plane/plan-b/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSession(overrides: Partial<CanonicalSession> = {}): CanonicalSession {
	return {
		sessionId: "ses-001",
		sessionLabel: "Session 1",
		agent: "sisyphus",
		status: "idle",
		currentModel: "gpt-4",
		currentTool: "read",
		lastUpdated: "2025-01-01T00:00:00.000Z",
		lastUpdatedMs: 1735689600000,
		...overrides,
	};
}

function makeProject(overrides: Partial<CanonicalProject> = {}): CanonicalProject {
	return {
		sourceId: "proj-1",
		label: "Test Project",
		projectRoot: "/home/test/project",
		observedAt: 1735689600000,
		...overrides,
	};
}

function makePlanProgress(overrides: Partial<CanonicalPlanProgress> = {}): CanonicalPlanProgress {
	return {
		name: "test-plan",
		completed: 3,
		total: 10,
		status: "in_progress",
		planStale: false,
		planComplete: false,
		...overrides,
	};
}

// ─── normalizePayload ─────────────────────────────────────────────────

describe("normalizePayload", () => {
	it("returns null for non-object payload", () => {
		expect(normalizePayload(null, "proj-1")).toBeNull();
		expect(normalizePayload(undefined as unknown, "proj-1")).toBeNull();
		expect(normalizePayload("string", "proj-1")).toBeNull();
		expect(normalizePayload(42, "proj-1")).toBeNull();
	});

	it("returns null when sourceId does not match in single-project payload", () => {
		const payload = {
			sourceId: "other-proj",
			mainSession: { sessionId: "s1" },
			sessions: [],
		};
		expect(normalizePayload(payload, "proj-1")).toBeNull();
	});

	it("returns null when single-project payload lacks mainSession", () => {
		const payload = { sourceId: "proj-1", sessions: [] };
		expect(normalizePayload(payload, "proj-1")).toBeNull();
	});

	it("returns null when single-project payload lacks sessions array", () => {
		const payload = { sourceId: "proj-1", mainSession: { sessionId: "s1" } };
		expect(normalizePayload(payload, "proj-1")).toBeNull();
	});

	it("returns null when multi-project payload has no matching project", () => {
		const payload = {
			projects: [{ sourceId: "other-proj", mainSession: { sessionId: "s1" }, sessions: [] }],
			serverNowMs: 1735689600000,
		};
		expect(normalizePayload(payload, "proj-1")).toBeNull();
	});

	it("normalizes a valid single-project payload", () => {
		const result = normalizePayload(
			{
				sourceId: "proj-1",
				label: "My Project",
				projectRoot: "/home/test/project",
				mainSession: {
					sessionId: "ses-001",
					sessionLabel: "Main Session",
					agent: "sisyphus",
					status: "idle",
					currentModel: "gpt-4",
					currentTool: "read",
					lastUpdated: "2025-01-01T00:00:00.000Z",
				},
				sessions: [],
				lastUpdatedMs: 1735689600000,
			},
			"proj-1",
		);

		expect(result).not.toBeNull();
		expect(result!.project.sourceId).toBe("proj-1");
		expect(result!.project.label).toBe("My Project");
		expect(result!.sessions).toHaveLength(1);
		expect(result!.sessions[0].sessionId).toBe("ses-001");
		expect(result!.planProgress).toBeNull();
		expect(result!.workflowMode).toBe("sisyphus_direct");
		expect(result!.fingerprint.hash).toBeTruthy();
	});

	it("normalizes a valid multi-project payload selecting by sourceId", () => {
		const result = normalizePayload(
			{
				projects: [
					{
						sourceId: "proj-1",
						label: "Project One",
						projectRoot: "/home/test/one",
						mainSession: { sessionId: "s1", agent: "sisyphus", status: "idle", lastUpdated: "2025-01-01T00:00:00.000Z" },
						sessions: [],
						lastUpdatedMs: 1735689600000,
					},
					{
						sourceId: "proj-2",
						label: "Project Two",
						projectRoot: "/home/test/two",
						mainSession: { sessionId: "s2", agent: "explore", status: "busy", lastUpdated: "2025-01-01T00:00:00.000Z" },
						sessions: [],
						lastUpdatedMs: 1735689600000,
					},
				],
				serverNowMs: 1735689600000,
			},
			"proj-2",
		);

		expect(result).not.toBeNull();
		expect(result!.project.sourceId).toBe("proj-2");
		expect(result!.project.label).toBe("Project Two");
	});

	it("uses serverNowMs from multi-project payload", () => {
		const result = normalizePayload(
			{
				projects: [
					{
						sourceId: "proj-1",
						mainSession: { sessionId: "s1", agent: "sisyphus", status: "idle", lastUpdated: "2025-01-01T00:00:00.000Z" },
						sessions: [],
					},
				],
				serverNowMs: 1735689600000,
			},
			"proj-1",
		);

		expect(result).not.toBeNull();
		expect(result!.serverNowMs).toBe(1735689600000);
	});
});

// ─── Deduplication: mainSession vs sessions[] ─────────────────────────

describe("normalizePayload — deduplication", () => {
	it("deduplicates mainSession when same sessionId exists in sessions[]", () => {
		const result = normalizePayload(
			{
				sourceId: "proj-1",
				mainSession: {
					sessionId: "ses-001",
					sessionLabel: "Main Session",
					agent: "sisyphus",
					status: "busy",
					currentModel: "gpt-4",
					currentTool: "write",
					lastUpdated: "2025-01-01T00:01:00.000Z",
				},
				sessions: [
					{
						sessionId: "ses-001",
						sessionLabel: "Old Session",
						agent: "sisyphus",
						status: "idle",
						currentModel: "gpt-4",
						currentTool: "read",
						lastUpdated: "2025-01-01T00:00:00.000Z",
						lastUpdatedMs: 1735689600000,
					},
				],
				lastUpdatedMs: 1735689660000,
			},
			"proj-1",
		);

		expect(result).not.toBeNull();
		expect(result!.sessions).toHaveLength(1);
		// The richer session (mainSession with more info) should be preferred
		expect(result!.sessions[0].sessionLabel).toBe("Main Session");
		expect(result!.sessions[0].status).toBe("busy");
	});

	it("prefers richer session when deduplicating", () => {
		const result = normalizePayload(
			{
				sourceId: "proj-1",
				mainSession: {
					sessionId: "ses-001",
					sessionLabel: "ses-001",
					agent: "unknown",
					status: "unknown",
					currentModel: "-",
					currentTool: "-",
					lastUpdated: "2025-01-01T00:00:00.000Z",
				},
				sessions: [
					{
						sessionId: "ses-001",
						sessionLabel: "Rich Session",
						agent: "sisyphus",
						status: "busy",
						currentModel: "gpt-4",
						currentTool: "write",
						lastUpdated: "2025-01-01T00:01:00.000Z",
						lastUpdatedMs: 1735689660000,
					},
				],
				lastUpdatedMs: 1735689660000,
			},
			"proj-1",
		);

		expect(result).not.toBeNull();
		expect(result!.sessions).toHaveLength(1);
		// sessions[] entry is richer, should be preferred
		expect(result!.sessions[0].sessionLabel).toBe("Rich Session");
		expect(result!.sessions[0].agent).toBe("sisyphus");
	});

	it("includes both mainSession and sessions[] when they have different sessionIds", () => {
		const result = normalizePayload(
			{
				sourceId: "proj-1",
				mainSession: {
					sessionId: "ses-main",
					sessionLabel: "Main",
					agent: "sisyphus",
					status: "idle",
					lastUpdated: "2025-01-01T00:00:00.000Z",
				},
				sessions: [
					{
						sessionId: "ses-sub",
						sessionLabel: "Sub",
						agent: "explore",
						status: "busy",
						lastUpdated: "2025-01-01T00:00:00.000Z",
						lastUpdatedMs: 1735689600000,
					},
				],
				lastUpdatedMs: 1735689600000,
			},
			"proj-1",
		);

		expect(result).not.toBeNull();
		expect(result!.sessions).toHaveLength(2);
		const ids = result!.sessions.map((s) => s.sessionId).sort();
		expect(ids).toEqual(["ses-main", "ses-sub"]);
	});
});

// ─── Stable fingerprint behavior ──────────────────────────────────────

describe("buildObservationFingerprint — stability", () => {
	it("produces identical hash for identical inputs", () => {
		const project = makeProject();
		const sessions = [makeSession()];
		const planProgress = makePlanProgress();
		const workflowMode: WorkflowMode = "sisyphus_direct";
		const decisionTargets: DecisionTarget[] = [];

		const fp1 = buildObservationFingerprint({ project, sessions, planProgress, workflowMode, decisionTargets });
		const fp2 = buildObservationFingerprint({ project, sessions, planProgress, workflowMode, decisionTargets });

		expect(fp1.hash).toBe(fp2.hash);
	});

	it("produces different hash when sessions change", () => {
		const project = makeProject();
		const sessions1 = [makeSession({ sessionId: "ses-a" })];
		const sessions2 = [makeSession({ sessionId: "ses-b" })];
		const planProgress = makePlanProgress();
		const workflowMode: WorkflowMode = "sisyphus_direct";

		const fp1 = buildObservationFingerprint({
			project, sessions: sessions1, planProgress, workflowMode, decisionTargets: [],
		});
		const fp2 = buildObservationFingerprint({
			project, sessions: sessions2, planProgress, workflowMode, decisionTargets: [],
		});

		expect(fp1.hash).not.toBe(fp2.hash);
	});

	it("produces different hash when planProgress changes", () => {
		const project = makeProject();
		const sessions = [makeSession()];
		const workflowMode: WorkflowMode = "sisyphus_direct";

		const fp1 = buildObservationFingerprint({
			project, sessions, planProgress: makePlanProgress({ completed: 3 }), workflowMode, decisionTargets: [],
		});
		const fp2 = buildObservationFingerprint({
			project, sessions, planProgress: makePlanProgress({ completed: 7 }), workflowMode, decisionTargets: [],
		});

		expect(fp1.hash).not.toBe(fp2.hash);
	});

	it("includes observedAt and sourceId in fingerprint", () => {
		const project = makeProject({ sourceId: "proj-x", observedAt: 1000 });
		const sessions = [makeSession()];
		const planProgress = makePlanProgress();
		const workflowMode: WorkflowMode = "unknown";

		const fp = buildObservationFingerprint({ project, sessions, planProgress, workflowMode, decisionTargets: [] });

		expect(fp.sourceId).toBe("proj-x");
		expect(fp.observedAt).toBe(1000);
		expect(fp.hash).toBeTruthy();
		expect(fp.hash.length).toBe(64); // sha256 hex
	});
});

// ─── workflowMode inference ───────────────────────────────────────────

describe("inferWorkflowMode", () => {
	it("returns sisyphus_direct when only sisyphus agent is present", () => {
		const sessions = [makeSession({ agent: "sisyphus" })];
		const projectView = { mainSession: { sessionId: "s1", agent: "sisyphus" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("sisyphus_direct");
	});

	it("returns delegation when sisyphus + specialist agents present", () => {
		const sessions = [
			makeSession({ sessionId: "s1", agent: "sisyphus" }),
			makeSession({ sessionId: "s2", agent: "oracle" }),
		];
		const projectView = { mainSession: { sessionId: "s1", agent: "sisyphus" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("delegation");
	});

	it("returns delegation for all specialist agents", () => {
		const specialists = ["oracle", "hephaestus", "explore", "librarian", "metis", "momus"];
		for (const specialist of specialists) {
			const sessions = [
				makeSession({ sessionId: "s1", agent: "sisyphus" }),
				makeSession({ sessionId: "s2", agent: specialist }),
			];
			const projectView = { mainSession: { sessionId: "s1", agent: "sisyphus" } };
			expect(inferWorkflowMode({ sessions, projectView })).toBe("delegation");
		}
	});

	it("returns ulw_policy when ultrawork keywords present in session labels", () => {
		const sessions = [makeSession({ sessionLabel: "running /ulw loop" })];
		const projectView = { mainSession: { sessionId: "s1" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("ulw_policy");
	});

	it("returns ulw_policy when 'ultrawork' appears in tool name", () => {
		const sessions = [makeSession({ currentTool: "ultrawork-mode" })];
		const projectView = { mainSession: { sessionId: "s1" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("ulw_policy");
	});

	it("returns ulw_policy when 'ulw' appears in mainSession agent", () => {
		const sessions: CanonicalSession[] = [];
		const projectView = { mainSession: { sessionId: "s1", agent: "ulw-agent" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("ulw_policy");
	});

	it("returns prometheus_atlas when both prometheus and atlas agents present", () => {
		const sessions = [
			makeSession({ sessionId: "s1", agent: "prometheus" }),
			makeSession({ sessionId: "s2", agent: "atlas" }),
		];
		const projectView = { mainSession: { sessionId: "s1", agent: "prometheus" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("prometheus_atlas");
	});

	it("returns unknown when no recognizable agent pattern", () => {
		const sessions = [makeSession({ agent: "some-random-agent" })];
		const projectView = { mainSession: { sessionId: "s1", agent: "some-random-agent" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("unknown");
	});

	it("returns unknown for empty sessions with no mainSession", () => {
		const sessions: CanonicalSession[] = [];
		const projectView = {};

		expect(inferWorkflowMode({ sessions, projectView })).toBe("unknown");
	});

	it("ulw_policy takes precedence over prometheus_atlas", () => {
		const sessions = [
			makeSession({ sessionId: "s1", agent: "prometheus", sessionLabel: "running /ulw" }),
			makeSession({ sessionId: "s2", agent: "atlas" }),
		];
		const projectView = { mainSession: { sessionId: "s1", agent: "prometheus" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("ulw_policy");
	});

	it("ulw_policy takes precedence over delegation", () => {
		const sessions = [
			makeSession({ sessionId: "s1", agent: "sisyphus", currentTool: "ultrawork" }),
			makeSession({ sessionId: "s2", agent: "oracle" }),
		];
		const projectView = { mainSession: { sessionId: "s1", agent: "sisyphus" } };

		expect(inferWorkflowMode({ sessions, projectView })).toBe("ulw_policy");
	});
});

// ─── buildDecisionTargets ─────────────────────────────────────────────

describe("buildDecisionTargets", () => {
	it("generates mark_plan_stale when plan is stale but not complete", () => {
		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: 1735689600000,
			sessions: [],
			planProgress: makePlanProgress({ planStale: true, planComplete: false }),
		});

		expect(decisions).toHaveLength(1);
		expect(decisions[0].decisionType).toBe("mark_plan_stale");
		expect(decisions[0].targetId).toBe("proj-1");
		expect(decisions[0].riskClass).toBe("low");
		expect(decisions[0].requiredTier).toBe("tier1");
	});

	it("does NOT generate mark_plan_stale when plan is also complete", () => {
		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: 1735689600000,
			sessions: [],
			planProgress: makePlanProgress({ planStale: true, planComplete: true }),
		});

		const staleDecisions = decisions.filter((d) => d.decisionType === "mark_plan_stale");
		expect(staleDecisions).toHaveLength(0);
	});

	it("does NOT generate mark_plan_stale when plan is not stale", () => {
		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: 1735689600000,
			sessions: [],
			planProgress: makePlanProgress({ planStale: false }),
		});

		const staleDecisions = decisions.filter((d) => d.decisionType === "mark_plan_stale");
		expect(staleDecisions).toHaveLength(0);
	});

	it("generates notify_question_pending for sessions with status 'question'", () => {
		const sessions = [
			makeSession({ sessionId: "ses-001", status: "question" }),
			makeSession({ sessionId: "ses-002", status: "idle" }),
		];

		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: 1735689600000,
			sessions,
			planProgress: null,
		});

		const questionDecisions = decisions.filter((d) => d.decisionType === "notify_question_pending");
		expect(questionDecisions).toHaveLength(1);
		expect(questionDecisions[0].targetId).toBe("ses-001");
	});

	it("generates log_session_stalled for active sessions past threshold", () => {
		const now = 1735690200000; // 600s after base (threshold is 600000ms = 10min)
		const sessions = [
			makeSession({
				sessionId: "ses-001",
				status: "busy",
				lastUpdatedMs: 1735689600000, // 600s ago
			}),
		];

		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: now,
			sessions,
			planProgress: null,
		});

		const stalledDecisions = decisions.filter((d) => d.decisionType === "log_session_stalled");
		expect(stalledDecisions).toHaveLength(1);
		expect(stalledDecisions[0].targetId).toBe("ses-001");
	});

	it("does NOT generate log_session_stalled for recently active sessions", () => {
		const now = 1735689605000; // only 5s after
		const sessions = [
			makeSession({
				sessionId: "ses-001",
				status: "busy",
				lastUpdatedMs: 1735689600000,
			}),
		];

		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: now,
			sessions,
			planProgress: null,
		});

		const stalledDecisions = decisions.filter((d) => d.decisionType === "log_session_stalled");
		expect(stalledDecisions).toHaveLength(0);
	});

	it("does NOT generate log_session_stalled for non-active statuses", () => {
		const now = 1735690000000;
		const sessions = [
			makeSession({ sessionId: "ses-001", status: "idle", lastUpdatedMs: 1735689600000 }),
		];

		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: now,
			sessions,
			planProgress: null,
		});

		const stalledDecisions = decisions.filter((d) => d.decisionType === "log_session_stalled");
		expect(stalledDecisions).toHaveLength(0);
	});

	it("generates all three decision types simultaneously when conditions met", () => {
		const now = 1735690200000; // 600s after base (threshold is 600000ms = 10min)
		const sessions = [
			makeSession({ sessionId: "ses-001", status: "question" }),
			makeSession({ sessionId: "ses-002", status: "busy", lastUpdatedMs: 1735689600000 }), // 600s ago
		];

		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: now,
			sessions,
			planProgress: makePlanProgress({ planStale: true, planComplete: false }),
		});

		const types = decisions.map((d) => d.decisionType).sort();
		expect(types).toContain("mark_plan_stale");
		expect(types).toContain("notify_question_pending");
		expect(types).toContain("log_session_stalled");
	});

	it("returns empty array when no conditions met", () => {
		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: 1735689600000,
			sessions: [makeSession({ status: "idle" })],
			planProgress: null,
		});

		expect(decisions).toHaveLength(0);
	});

	it("returns decisions sorted by type then targetId", () => {
		const now = 1735690200000; // 600s after base (threshold is 600000ms = 10min)
		const sessions = [
			makeSession({ sessionId: "ses-b", status: "question" }),
			makeSession({ sessionId: "ses-a", status: "busy", lastUpdatedMs: 1735689600000 }), // 600s ago
		];

		const decisions = buildDecisionTargets({
			sourceId: "proj-1",
			observedAt: now,
			sessions,
			planProgress: makePlanProgress({ planStale: true, planComplete: false }),
		});

		// Expected order: log_session_stalled:ses-a, mark_plan_stale:proj-1, notify_question_pending:ses-b
		expect(decisions[0].decisionType).toBe("log_session_stalled");
		expect(decisions[0].targetId).toBe("ses-a");
		expect(decisions[1].decisionType).toBe("mark_plan_stale");
		expect(decisions[2].decisionType).toBe("notify_question_pending");
	});
});
