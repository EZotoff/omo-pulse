import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { Hono } from "hono";
import { assertAllowedPath } from "../ingest/paths";
import { getMessageDir, getStorageRoots } from "../ingest/session";
import {
	addOrUpdateSource,
	deleteSourceById,
	getDefaultSourceId,
	listSources,
	updateSourceLabelById,
} from "../ingest/sources-registry";
import { deriveToolCallsSqlite } from "../ingest/sqlite-derive";
import type { StorageBackend } from "../ingest/storage-backend";
import {
	deriveToolCalls,
	MAX_TOOL_CALL_MESSAGES,
	MAX_TOOL_CALLS,
} from "../ingest/tool-calls";
import {
	type AutomationTier,
	approveTierChange,
	createPlanBLedgerSqlite,
	EXECUTION_PHASE_ORDER,
	emergencyDowngrade,
	getExecution,
	getTier,
	listExecutions,
	observeAndRunPlanBControlLoop,
	type PlanBLedgerDatabase,
	requestTierChange,
} from "./control-plane/plan-b";
import { createMultiProjectService } from "./multi-project";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isAutomationTier(value: unknown): value is AutomationTier {
	return value === "shadow" || value === "tier1";
}

export function createApi(opts: {
	storageRoot: string;
	storageBackend: StorageBackend;
	pollIntervalMs?: number;
	version?: string;
}): Hono {
	const api = new Hono();
	const version = opts.version ?? "0.0.0";

	const multiProjectService = createMultiProjectService({
		storageRoot: opts.storageRoot,
		storageBackend: opts.storageBackend,
		pollIntervalMs: opts.pollIntervalMs,
	});
	const invalidateProjects = (): void => {
		multiProjectService.invalidate();
	};

	const planBLedgerPath =
		opts.storageBackend.kind === "sqlite"
			? path.join(
					path.dirname(opts.storageBackend.sqlitePath),
					"plan-b-ledger.db",
				)
			: null;
	let planBLedger: PlanBLedgerDatabase | null = null;

	const getPlanBLedger = ():
		| { ok: true; db: PlanBLedgerDatabase }
		| {
				ok: false;
				error: string;
		  } => {
		if (!planBLedgerPath) {
			return {
				ok: false,
				error: "Plan B control-plane routes require sqlite storage backend",
			};
		}

		if (!planBLedger) {
			try {
				planBLedger = createPlanBLedgerSqlite(planBLedgerPath);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					ok: false,
					error: `Failed to initialize Plan B ledger: ${message}`,
				};
			}
		}

		return { ok: true, db: planBLedger };
	};

	// ---------------------------------------------------------------------------
	// Middleware: no-cache + JSON content type on all API responses
	// ---------------------------------------------------------------------------
	api.use("*", async (c, next) => {
		await next();
		c.header("Cache-Control", "no-cache");
		c.header("Content-Type", "application/json");
	});

	// ---------------------------------------------------------------------------
	// Error handler: catch unhandled errors, return { ok: false, error }
	// ---------------------------------------------------------------------------
	api.onError((err, c) => {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ ok: false, error: message }, 500);
	});

	// ---------------------------------------------------------------------------
	// GET /health
	// ---------------------------------------------------------------------------
	api.get("/health", (c) => {
		return c.json({ ok: true, version });
	});

	// ---------------------------------------------------------------------------
	// GET /sources — list all registered projects
	// ---------------------------------------------------------------------------
	api.get("/sources", (c) => {
		const sources = listSources(opts.storageRoot);
		const defaultSourceId = getDefaultSourceId(opts.storageRoot);
		return c.json({ ok: true, sources, defaultSourceId });
	});

	// ---------------------------------------------------------------------------
	// POST /sources — register a new project source
	// ---------------------------------------------------------------------------
	api.post("/sources", async (c) => {
		const body = await c.req.json<{ projectRoot?: string; label?: string }>();
		const { projectRoot, label } = body;

		if (
			!projectRoot ||
			typeof projectRoot !== "string" ||
			projectRoot.trim() === ""
		) {
			return c.json(
				{
					ok: false,
					error: "projectRoot is required and must be a non-empty string",
				},
				400,
			);
		}

		if (!fs.existsSync(projectRoot)) {
			return c.json(
				{ ok: false, error: "projectRoot directory does not exist" },
				400,
			);
		}

		const sourceId = addOrUpdateSource(opts.storageRoot, projectRoot, label);
		invalidateProjects();
		return c.json({ ok: true, sourceId });
	});

	api.put("/sources/:sourceId", async (c) => {
		const sourceId = c.req.param("sourceId");
		const body = await c.req.json<{ label?: string }>();

		if (body.label !== undefined && typeof body.label !== "string") {
			return c.json(
				{ ok: false, error: "label must be a string when provided" },
				400,
			);
		}

		const updated = updateSourceLabelById(
			opts.storageRoot,
			sourceId,
			body.label,
		);
		if (!updated) {
			return c.json({ ok: false, error: "Source not found", sourceId }, 404);
		}

		invalidateProjects();
		return c.json({ ok: true, sourceId });
	});

	api.delete("/sources/:sourceId", (c) => {
		const sourceId = c.req.param("sourceId");
		const deleted = deleteSourceById(opts.storageRoot, sourceId);
		if (!deleted) {
			return c.json({ ok: false, error: "Source not found", sourceId }, 404);
		}

		invalidateProjects();
		return c.json({ ok: true, sourceId });
	});

	// ---------------------------------------------------------------------------
	// GET /projects — all projects with snapshots
	// ---------------------------------------------------------------------------
	api.get("/projects", async (c) => {
		const payload = await multiProjectService.getMultiProjectPayload();
		return c.json(payload);
	});

	// ---------------------------------------------------------------------------
	// GET /projects/:sourceId — single project detail
	// ---------------------------------------------------------------------------
	api.get("/projects/:sourceId", async (c) => {
		const sourceId = c.req.param("sourceId");
		const payload = await multiProjectService.getMultiProjectPayload();
		const project = payload.projects.find((p) => p.sourceId === sourceId);
		if (!project) {
			return c.json({ ok: false, error: "Source not found", sourceId }, 404);
		}
		return c.json(project);
	});

	// ---------------------------------------------------------------------------
	// GET /tool-calls/:sessionId — tool call details per session
	// ---------------------------------------------------------------------------
	api.get("/tool-calls/:sessionId", (c) => {
		const sessionId = c.req.param("sessionId");
		if (!SESSION_ID_PATTERN.test(sessionId)) {
			return c.json({ ok: false, sessionId, toolCalls: [] }, 400);
		}

		const sqliteBackend =
			opts.storageBackend.kind === "sqlite" ? opts.storageBackend : null;

		if (sqliteBackend) {
			assertAllowedPath({
				candidatePath: sqliteBackend.sqlitePath,
				allowedRoots: [
					sqliteBackend.sqlitePath,
					path.dirname(sqliteBackend.sqlitePath),
				],
			});

			const sqliteResult = deriveToolCallsSqlite({
				sqlitePath: sqliteBackend.sqlitePath,
				sessionId,
			});
			if (sqliteResult.ok) {
				if (!sqliteResult.value.sessionExists) {
					return c.json({ ok: false, sessionId, toolCalls: [] }, 404);
				}
				return c.json({
					ok: true,
					sessionId,
					toolCalls: sqliteResult.value.toolCalls,
					caps: {
						maxMessages: MAX_TOOL_CALL_MESSAGES,
						maxToolCalls: MAX_TOOL_CALLS,
					},
					truncated: sqliteResult.value.truncated,
				});
			}
		}

		// File-based fallback
		const legacyStorageRoot =
			opts.storageBackend.kind === "files"
				? opts.storageBackend.storageRoot
				: null;
		if (!legacyStorageRoot) {
			return c.json({ ok: false, sessionId, toolCalls: [] }, 500);
		}

		const storage = getStorageRoots(legacyStorageRoot);
		const messageDir = getMessageDir(storage.message, sessionId);
		if (!messageDir) {
			return c.json({ ok: false, sessionId, toolCalls: [] }, 404);
		}

		assertAllowedPath({
			candidatePath: messageDir,
			allowedRoots: [legacyStorageRoot],
		});

		const { toolCalls, truncated } = deriveToolCalls({
			storage,
			sessionId,
			allowedRoots: [legacyStorageRoot],
		});

		return c.json({
			ok: true,
			sessionId,
			toolCalls,
			caps: {
				maxMessages: MAX_TOOL_CALL_MESSAGES,
				maxToolCalls: MAX_TOOL_CALLS,
			},
			truncated,
		});
	});

	// ---------------------------------------------------------------------------
	// GET /control-plane/executions — list recent Plan B executions
	// ---------------------------------------------------------------------------
	api.get("/control-plane/executions", (c) => {
		const ledger = getPlanBLedger();
		if (!ledger.ok) {
			return c.json({ ok: false, error: ledger.error }, 500);
		}

		const executions = listExecutions(ledger.db, { limit: 100 });
		return c.json({ ok: true, executions });
	});

	// ---------------------------------------------------------------------------
	// GET /control-plane/executions/:id — read one Plan B execution
	// ---------------------------------------------------------------------------
	api.get("/control-plane/executions/:id", (c) => {
		const ledger = getPlanBLedger();
		if (!ledger.ok) {
			return c.json({ ok: false, error: ledger.error }, 500);
		}

		const id = c.req.param("id");
		const execution = getExecution(ledger.db, id);
		if (!execution) {
			return c.json(
				{ ok: false, error: "Execution not found", executionId: id },
				404,
			);
		}

		return c.json({ ok: true, execution, phases: EXECUTION_PHASE_ORDER });
	});

	// ---------------------------------------------------------------------------
	// GET /control-plane/tier — read current automation tier
	// ---------------------------------------------------------------------------
	api.get("/control-plane/tier", (c) => {
		const ledger = getPlanBLedger();
		if (!ledger.ok) {
			return c.json({ ok: false, error: ledger.error }, 500);
		}

		const tier = getTier(ledger.db);
		return c.json({ ok: true, tier });
	});

	// ---------------------------------------------------------------------------
	// POST /control-plane/tier — operator-controlled tier transitions
	// ---------------------------------------------------------------------------
	api.post("/control-plane/tier", async (c) => {
		const ledger = getPlanBLedger();
		if (!ledger.ok) {
			return c.json({ ok: false, error: ledger.error }, 500);
		}

		let body: { tier?: unknown; approved?: unknown; reason?: unknown };
		try {
			body = await c.req.json<{
				tier?: unknown;
				approved?: unknown;
				reason?: unknown;
			}>();
		} catch {
			return c.json({ ok: false, error: "Invalid JSON body" }, 400);
		}

		if (!isAutomationTier(body.tier)) {
			return c.json(
				{ ok: false, error: 'tier must be "shadow" or "tier1"' },
				400,
			);
		}

		const reason = typeof body.reason === "string" ? body.reason : undefined;

		if (body.tier === "shadow") {
			const tier = emergencyDowngrade({ db: ledger.db, reason });
			return c.json({ ok: true, tier });
		}

		if (body.approved !== true) {
			return c.json(
				{
					ok: false,
					error: "approved: true is required for tier1 promotion",
				},
				400,
			);
		}

		const currentTier = getTier(ledger.db);
		if (currentTier === "tier1") {
			return c.json({ ok: true, tier: currentTier });
		}

		try {
			requestTierChange({
				db: ledger.db,
				requestedTier: "tier1",
				reason,
			});
			const tier = approveTierChange({
				db: ledger.db,
				approvedTier: "tier1",
				reason,
			});
			return c.json({ ok: true, tier });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ ok: false, error: message }, 400);
		}
	});

	// ---------------------------------------------------------------------------
	// POST /control-plane/execute — run Plan B orchestrator for one source
	// ---------------------------------------------------------------------------
	api.post("/control-plane/execute", async (c) => {
		const ledger = getPlanBLedger();
		if (!ledger.ok) {
			return c.json({ ok: false, error: ledger.error }, 500);
		}

		let body: {
			sourceId?: unknown;
			decisionType?: unknown;
			targetId?: unknown;
			target?: unknown;
		};
		try {
			body = await c.req.json<{
				sourceId?: unknown;
				decisionType?: unknown;
				targetId?: unknown;
				target?: unknown;
			}>();
		} catch {
			return c.json({ ok: false, error: "Invalid JSON body" }, 400);
		}

		const sourceId =
			typeof body.sourceId === "string" && body.sourceId.trim().length > 0
				? body.sourceId.trim()
				: null;
		const decisionType =
			typeof body.decisionType === "string" &&
			body.decisionType.trim().length > 0
				? body.decisionType.trim()
				: null;
		const targetId =
			typeof body.targetId === "string" && body.targetId.trim().length > 0
				? body.targetId.trim()
				: typeof body.target === "string" && body.target.trim().length > 0
					? body.target.trim()
					: null;

		if (!sourceId || !decisionType || !targetId) {
			return c.json(
				{
					ok: false,
					error:
						"sourceId, decisionType, and targetId (or target) are required non-empty strings",
				},
				400,
			);
		}

		const tier = getTier(ledger.db);
		const result = await observeAndRunPlanBControlLoop({
			getMultiProjectPayload: () =>
				multiProjectService.getMultiProjectPayload(),
			sourceId,
			db: ledger.db,
			currentTier: tier,
			decisionFilter: { decisionType, targetId },
		});

		if (!result.normalized) {
			return c.json({ ok: false, error: "Source not found", sourceId }, 404);
		}

		const decision = result.decisions[0] ?? null;

		if (!decision) {
			return c.json({
				ok: true,
				sourceId: result.sourceId,
				tier: result.tier,
				executionId: null,
				status: "advisory_only",
				result: {
					decisionType,
					targetId,
					action: "advisory_only",
					reason:
						"Requested decision target not present in current observation",
					preflightResult: null,
				},
			});
		}

		return c.json({
			ok: true,
			sourceId: result.sourceId,
			tier: result.tier,
			executionId: decision.executionId,
			status: decision.action,
			result: decision,
		});
	});

	// ---------------------------------------------------------------------------
	// GET /service/status — check systemd service state
	// ---------------------------------------------------------------------------
	api.get("/service/status", async (c) => {
		const servicePath = `${homedir()}/.config/systemd/user/ez-omo-dash.service`;
		const installed = await Bun.file(servicePath).exists();

		let enabled = false;
		let active = false;

		if (installed) {
			try {
				const enabledResult = Bun.spawnSync([
					"systemctl",
					"--user",
					"is-enabled",
					"ez-omo-dash",
				]);
				enabled = enabledResult.exitCode === 0;
			} catch {
				/* not available */
			}

			try {
				const activeResult = Bun.spawnSync([
					"systemctl",
					"--user",
					"is-active",
					"ez-omo-dash",
				]);
				active = activeResult.exitCode === 0;
			} catch {
				/* not available */
			}
		}

		return c.json({ ok: true, installed, enabled, active });
	});

	// ---------------------------------------------------------------------------
	// POST /service/enable — enable and start the systemd service
	// ---------------------------------------------------------------------------
	api.post("/service/enable", async (c) => {
		try {
			const result = Bun.spawnSync([
				"systemctl",
				"--user",
				"enable",
				"--now",
				"ez-omo-dash",
			]);
			if (result.exitCode !== 0) {
				return c.json({ ok: false, error: "Failed to enable service" }, 500);
			}
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ ok: false, error: String(err) }, 500);
		}
	});

	// ---------------------------------------------------------------------------
	// POST /service/disable — disable and stop the systemd service
	// ---------------------------------------------------------------------------
	api.post("/service/disable", async (c) => {
		try {
			const result = Bun.spawnSync([
				"systemctl",
				"--user",
				"disable",
				"--now",
				"ez-omo-dash",
			]);
			if (result.exitCode !== 0) {
				return c.json({ ok: false, error: "Failed to disable service" }, 500);
			}
			return c.json({ ok: true });
		} catch (err) {
			return c.json({ ok: false, error: String(err) }, 500);
		}
	});

	return api;
}
