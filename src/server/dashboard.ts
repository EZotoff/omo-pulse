import { Database } from "bun:sqlite"
import * as fs from "node:fs"
import { deriveBackgroundTasks } from "../ingest/background-tasks"
import * as boulderModule from "../ingest/boulder"
import { type PlanStep, readBoulderState, readPlanProgress, readPlanSteps, scanUninitiatedPlans } from "../ingest/boulder"
import {
  getMainSessionView,
  getStorageRoots,
  type MainSessionView,
  type OpenCodeStorageRoots,
  pickActiveSessionId,
  readMainSessionMetas,
  type SessionMetadata,
} from "../ingest/session"
import { formatElapsed, formatIsoNoMs, formatTimeline } from "../ingest/format-utils"
import {
  deriveBackgroundTasksSqlite,
  deriveTimeSeriesActivitySqlite,
  deriveTodosSqlite,
  deriveTokenUsageSqlite,
  deriveToolCallsSqlite,
  getMainSessionViewSqlite,
  pickActiveSessionIdSqlite,
} from "../ingest/sqlite-derive"
import type { StorageBackend } from "../ingest/storage-backend"
import { readMainSessionMetasSqlite } from "../ingest/storage-backend"
import { deriveTimeSeriesActivity, type TimeSeriesPayload } from "../ingest/timeseries"
import { deriveTokenUsage } from "../ingest/token-usage"
import { deriveToolCalls } from "../ingest/tool-calls"
import type { PlanHistory, UninitiatedPlan } from "../types"

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export type DashboardPayload = {
  mainSession: {
    agent: string
    currentModel: string | null
    currentTool: string
    lastUpdatedLabel: string
    session: string
    sessionId: string | null
    statusPill: string
  }
  planProgress: {
    name: string
    completed: number
    total: number
    path: string
    statusPill: string
    steps: PlanStep[]
    planStale: boolean
    planComplete: boolean
    boulderStatus?: string
    completedAt?: string
  }
  unintiatedPlans: UninitiatedPlan[]
  planHistory?: PlanHistory
  backgroundTasks: Array<{
    id: string
    description: string
    agent: string
    lastModel: string | null
    status: string
    toolCalls: number
    lastTool: string
    timeline: string
    sessionId: string | null
  }>
  mainSessionTasks: Array<{
    id: string
    description: string
    subline?: string
    agent: string
    lastModel: string | null
    status: string
    toolCalls: number
    lastTool: string
    timeline: string
    sessionId: string | null
  }>
  timeSeries: TimeSeriesPayload
  tokenUsage?: ReturnType<typeof deriveTokenUsage>
  todos: Array<{
    content: string
    status: string
    priority: string
    position: number
  }>
  raw: unknown
}

function readBoulderHistorySafe(projectRoot: string): PlanHistory | undefined {
  const historyReader = Reflect.has(boulderModule, "readBoulderHistory")
    ? Reflect.get(boulderModule, "readBoulderHistory") as ((root: string) => NonNullable<PlanHistory>["entries"])
    : null
  const entries = historyReader ? historyReader(projectRoot) : []
  if (entries.length === 0) return undefined
  return { entries, totalCompleted: entries.length }
}

export type DashboardStore = {
  getSnapshot: () => DashboardPayload
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatIso(ts: number | null): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return ""
  try {
    return new Date(ts).toISOString()
  } catch {
    return ""
  }
}

function planStatusPill(progress: { missing: boolean; isComplete: boolean }): string {
  if (progress.missing) return "not started"
  return progress.isComplete ? "complete" : "in progress"
}

function mainStatusPill(status: string): string {
  if (status === "running_tool") return "running tool"
  if (status === "thinking") return "thinking"
  if (status === "busy") return "busy"
  if (status === "idle") return "idle"
  if (status === "question") return "question"
  if (status === "plan_complete") return "plan complete"
  return "unknown"
}

// ---------------------------------------------------------------------------
// Shared sub-functions for payload builders
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 2_000

const DEFAULT_PLAN_PROGRESS = {
  total: 0,
  completed: 0,
  isComplete: false,
  missing: true,
  planStale: false,
  planComplete: false,
}

type PlanData = ReturnType<typeof derivePlanData>

function derivePlanData(projectRoot: string, nowMs: number) {
  const boulder = readBoulderState(projectRoot)
  const planName = boulder?.plan_name ?? "(no active plan)"
  const planPath = boulder?.active_plan ?? ""
  const plan = boulder
    ? readPlanProgress(projectRoot, boulder.active_plan, nowMs)
    : DEFAULT_PLAN_PROGRESS
  const planSteps = boulder
    ? readPlanSteps(projectRoot, boulder.active_plan)
    : { missing: true, steps: [] as PlanStep[] }
  const unintiatedPlans = scanUninitiatedPlans(projectRoot, boulder?.active_plan ?? null)
  const planHistory = readBoulderHistorySafe(projectRoot)
  return { boulder, planName, planPath, plan, planSteps, unintiatedPlans, planHistory }
}

function classifyTaskStatus(mainStatus: string): "running" | "idle" | "unknown" {
  if (mainStatus === "running_tool" || mainStatus === "thinking" || mainStatus === "busy") return "running"
  if (mainStatus === "idle") return "idle"
  return "unknown"
}

type MainSessionTaskEntry = DashboardPayload["mainSessionTasks"][number]

function buildMainSessionTaskEntry(opts: {
  sessionId: string
  agent: string
  currentModel: string | null
  mainStatus: string
  lastUpdated: number | null
  sessionMeta: SessionMetadata | null
  nowMs: number
  toolCallsCount: number
  lastTool: string
}): MainSessionTaskEntry {
  const status = classifyTaskStatus(opts.mainStatus)
  const startAt = opts.sessionMeta?.time?.created ?? null
  const endAtMs = status === "running" ? opts.nowMs : (opts.lastUpdated ?? opts.nowMs)
  return {
    id: "main-session",
    description: "Main session",
    subline: opts.sessionId,
    agent: opts.agent,
    lastModel: opts.currentModel,
    status,
    toolCalls: opts.toolCallsCount,
    lastTool: opts.lastTool,
    timeline: formatTimeline(startAt, endAtMs),
    sessionId: opts.sessionId,
  }
}

function formatBackgroundTaskForPayload(t: {
  id: string
  description: string
  agent: string
  lastModel?: string | null
  status: string
  toolCalls?: number
  lastTool?: string
  timeline: string | unknown
  sessionId?: string | null
}): DashboardPayload["backgroundTasks"][number] {
  return {
    id: t.id,
    description: t.description,
    agent: t.agent,
    lastModel: t.lastModel ?? null,
    status: t.status,
    toolCalls: t.toolCalls ?? 0,
    lastTool: t.lastTool ?? "-",
    timeline: typeof t.timeline === "string" ? t.timeline : "",
    sessionId: t.sessionId ?? null,
  }
}

type MainView = { agent: string; currentTool: string | null; currentModel: string | null; lastUpdated: number | null; sessionLabel: string; status: string }

function assemblePayload(opts: {
  main: MainView
  sessionId: string | null
  planData: PlanData
  backgroundTasks: DashboardPayload["backgroundTasks"]
  mainSessionTasks: DashboardPayload["mainSessionTasks"]
  timeSeries: TimeSeriesPayload
  tokenUsage?: ReturnType<typeof deriveTokenUsage>
  todos: DashboardPayload["todos"]
}): DashboardPayload {
  const { main, sessionId, planData: pd } = opts
  const payload: DashboardPayload = {
    mainSession: {
      agent: main.agent,
      currentModel: main.currentModel,
      currentTool: main.currentTool ?? "-",
      lastUpdatedLabel: formatIso(main.lastUpdated),
      session: main.sessionLabel,
      sessionId: sessionId ?? null,
      statusPill: pd.plan.planComplete && main.status === "idle"
        ? mainStatusPill("plan_complete")
        : mainStatusPill(main.status),
    },
    planProgress: {
      name: pd.planName,
      completed: pd.plan.completed,
      total: pd.plan.total,
      path: pd.planPath,
      statusPill: planStatusPill(pd.plan),
      steps: pd.planSteps.missing ? [] : pd.planSteps.steps,
      planStale: pd.plan.planStale,
      planComplete: pd.plan.planComplete,
      boulderStatus: pd.boulder?.status,
      completedAt: pd.boulder?.completed_at,
    },
    unintiatedPlans: pd.unintiatedPlans,
    planHistory: pd.planHistory,
    backgroundTasks: opts.backgroundTasks,
    mainSessionTasks: opts.mainSessionTasks,
    timeSeries: opts.timeSeries,
    tokenUsage: opts.tokenUsage,
    todos: opts.todos,
    raw: null,
  }
  payload.raw = {
    mainSession: payload.mainSession,
    planProgress: payload.planProgress,
    backgroundTasks: payload.backgroundTasks,
    mainSessionTasks: payload.mainSessionTasks,
    timeSeries: payload.timeSeries,
  }
  return payload
}

// ---------------------------------------------------------------------------
// File-based payload builder
// ---------------------------------------------------------------------------

const NO_SESSION_VIEW = { agent: "unknown", currentTool: null, currentModel: null, lastUpdated: null, sessionLabel: "(no session)", status: "unknown" as const } satisfies MainView

function buildDashboardPayloadFiles(opts: {
  projectRoot: string
  storage: OpenCodeStorageRoots
  nowMs?: number
}): DashboardPayload {
  const nowMs = opts.nowMs ?? Date.now()
  const planData = derivePlanData(opts.projectRoot, nowMs)

  const sessionId = pickActiveSessionId({
    projectRoot: opts.projectRoot,
    storage: opts.storage,
    boulderSessionIds: planData.boulder?.session_ids,
  })

  let sessionMeta: SessionMetadata | null = null
  if (sessionId) {
    const metas = readMainSessionMetas(opts.storage.session, opts.projectRoot)
    sessionMeta = metas.find((m) => m.id === sessionId) ?? null
  }

  const main = sessionId
    ? getMainSessionView({ projectRoot: opts.projectRoot, sessionId, storage: opts.storage, sessionMeta, nowMs })
    : NO_SESSION_VIEW
  const mainCurrentModel = main.currentModel ?? null

  const tasks = sessionId ? deriveBackgroundTasks({ storage: opts.storage, mainSessionId: sessionId, nowMs }) : []
  const timeSeries = deriveTimeSeriesActivity({ storage: opts.storage, mainSessionId: sessionId ?? null, nowMs })

  const mainSessionTasks = (() => {
    if (!sessionId) return []
    const { toolCalls } = deriveToolCalls({ storage: opts.storage, sessionId })
    return [buildMainSessionTaskEntry({
      sessionId, agent: main.agent, currentModel: mainCurrentModel, mainStatus: main.status,
      lastUpdated: main.lastUpdated, sessionMeta, nowMs,
      toolCallsCount: toolCalls.length, lastTool: toolCalls[0]?.tool ?? "-",
    })]
  })()

  const tokenUsage = deriveTokenUsage({
    storage: opts.storage,
    mainSessionId: sessionId ?? null,
    backgroundSessionIds: tasks.map((task) => task.sessionId ?? null),
  })

  return assemblePayload({
    main: { ...main, currentModel: mainCurrentModel },
    sessionId,
    planData,
    backgroundTasks: tasks.map(formatBackgroundTaskForPayload),
    mainSessionTasks,
    timeSeries,
    tokenUsage,
    todos: [],
  })
}

// ---------------------------------------------------------------------------
// Legacy storage detection
// ---------------------------------------------------------------------------

function hasLegacyStorageRoots(storage: OpenCodeStorageRoots): boolean {
  return fs.existsSync(storage.session) && fs.existsSync(storage.message) && fs.existsSync(storage.part)
}

// ---------------------------------------------------------------------------
// SQLite session resolution
// ---------------------------------------------------------------------------

function resolveSqliteSession(db: Database, sqlitePath: string, projectRoot: string, boulderSessionIds: string[] | undefined, nowMs: number):
  | { ok: true; sessionId: string | null; sessionMeta: SessionMetadata | null; main: MainView }
  | { ok: false } {
  const active = pickActiveSessionIdSqlite({ sqlitePath, projectRoot, boulderSessionIds, db })
  if (!active.ok) return { ok: false }

  const sessionId = active.value
  let sessionMeta: SessionMetadata | null = null
  if (sessionId) {
    const metas = readMainSessionMetasSqlite({ sqlitePath, directoryFilter: projectRoot, db })
    if (!metas.ok) return { ok: false }
    sessionMeta = metas.rows.find((m) => m.id === sessionId) ?? null
  }

  if (!sessionId) {
    return { ok: true, sessionId: null, sessionMeta: null, main: NO_SESSION_VIEW }
  }

  const result = getMainSessionViewSqlite({ sqlitePath, sessionId, sessionMeta, nowMs, db })
  if (!result.ok) return { ok: false }
  return { ok: true, sessionId, sessionMeta, main: result.value }
}

// ---------------------------------------------------------------------------
// SQLite payload data derivation
// ---------------------------------------------------------------------------

function deriveSqlitePayloadData(db: Database, opts: {
  sqlitePath: string
  sessionId: string | null
  main: MainView
  sessionMeta: SessionMetadata | null
  nowMs: number
}): { ok: true; value: { backgroundTasks: DashboardPayload["backgroundTasks"]; mainSessionTasks: MainSessionTaskEntry[]; timeSeries: TimeSeriesPayload; tokenUsage: ReturnType<typeof deriveTokenUsage>; todos: DashboardPayload["todos"] } } | { ok: false } {
  const { sqlitePath, sessionId, main, sessionMeta, nowMs } = opts

  const tasksResult = sessionId
    ? deriveBackgroundTasksSqlite({ sqlitePath, mainSessionId: sessionId, nowMs, db })
    : { ok: true as const, value: [] }
  if (!tasksResult.ok) return { ok: false }

  const timeSeriesResult = deriveTimeSeriesActivitySqlite({ sqlitePath, mainSessionId: sessionId ?? null, nowMs, db })
  if (!timeSeriesResult.ok) return { ok: false }

  const mainSessionTasks: MainSessionTaskEntry[] = (() => {
    if (!sessionId) return []
    const callsResult = deriveToolCallsSqlite({ sqlitePath, sessionId, db })
    if (!callsResult.ok) return []
    return [buildMainSessionTaskEntry({
      sessionId, agent: main.agent, currentModel: main.currentModel, mainStatus: main.status,
      lastUpdated: main.lastUpdated, sessionMeta, nowMs,
      toolCallsCount: callsResult.value.toolCalls.length, lastTool: callsResult.value.toolCalls[0]?.tool ?? "-",
    })]
  })()

  const tokenUsageResult = deriveTokenUsageSqlite({
    sqlitePath,
    mainSessionId: sessionId ?? null,
    backgroundSessionIds: tasksResult.value.map((task) => task.sessionId ?? null),
    db,
  })
  if (!tokenUsageResult.ok) return { ok: false }

  const todosResult = sessionId
    ? deriveTodosSqlite({ sqlitePath, sessionId, db })
    : { ok: true as const, value: [] }

  return {
    ok: true,
    value: {
      backgroundTasks: tasksResult.value.map(formatBackgroundTaskForPayload),
      mainSessionTasks,
      timeSeries: timeSeriesResult.value,
      tokenUsage: tokenUsageResult.value,
      todos: todosResult.ok ? todosResult.value : [],
    },
  }
}

// ---------------------------------------------------------------------------
// Main payload builder (SQLite-first with file fallback)
// ---------------------------------------------------------------------------

export function buildDashboardPayload(opts: {
  projectRoot: string
  storage: OpenCodeStorageRoots
  nowMs?: number
  storageBackend?: StorageBackend
}): DashboardPayload {
  const nowMs = opts.nowMs ?? Date.now()
  const backend = opts.storageBackend
  if (!backend || backend.kind !== "sqlite") {
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const planData = derivePlanData(opts.projectRoot, nowMs)

  let db: Database
  try {
    db = new Database(backend.sqlitePath, { readonly: true })
  } catch {
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const fallback = (): DashboardPayload => {
    try { db.close() } catch {}
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  try {
    const session = resolveSqliteSession(db, backend.sqlitePath, opts.projectRoot, planData.boulder?.session_ids, nowMs)
    if (!session.ok) return fallback()

    const data = deriveSqlitePayloadData(db, {
      sqlitePath: backend.sqlitePath,
      sessionId: session.sessionId,
      main: session.main,
      sessionMeta: session.sessionMeta,
      nowMs,
    })
    if (!data.ok) return fallback()

    return assemblePayload({
      main: session.main,
      sessionId: session.sessionId,
      planData,
      ...data.value,
    })
  } finally {
    try { db.close() } catch {}
  }
}

// ---------------------------------------------------------------------------
// DashboardStore — poll-interval caching (read-only, no watchers)
// ---------------------------------------------------------------------------

export function createDashboardStore(opts: {
  projectRoot: string
  storageRoot: string
  storageBackend?: StorageBackend
  pollIntervalMs?: number
}): DashboardStore {
  const storage = getStorageRoots(opts.storageRoot)
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

  let lastComputedAt = 0
  let cached: DashboardPayload | null = null

  return {
    getSnapshot() {
      const now = Date.now()
      if (!cached || now - lastComputedAt > pollIntervalMs) {
        cached = buildDashboardPayload({
          projectRoot: opts.projectRoot,
          storage,
          nowMs: now,
          storageBackend: opts.storageBackend,
        })
        lastComputedAt = now
      }
      return cached
    },
  }
}
