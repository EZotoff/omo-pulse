import * as fs from "node:fs"

import { readBoulderState, readPlanProgress, readPlanSteps, type PlanStep } from "../ingest/boulder"
import { deriveBackgroundTasks } from "../ingest/background-tasks"
import { deriveTimeSeriesActivity, type TimeSeriesPayload } from "../ingest/timeseries"
import {
  getMainSessionView,
  getStorageRoots,
  pickActiveSessionId,
  readMainSessionMetas,
  type MainSessionView,
  type OpenCodeStorageRoots,
  type SessionMetadata,
} from "../ingest/session"
import { deriveToolCalls } from "../ingest/tool-calls"
import { deriveTokenUsage } from "../ingest/token-usage"
import type { StorageBackend } from "../ingest/storage-backend"
import {
  deriveBackgroundTasksSqlite,
  deriveTimeSeriesActivitySqlite,
  deriveTodosSqlite,
  deriveTokenUsageSqlite,
  deriveToolCallsSqlite,
  getMainSessionViewSqlite,
  pickActiveSessionIdSqlite,
} from "../ingest/sqlite-derive"
import { readMainSessionMetasSqlite } from "../ingest/storage-backend"

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
  }
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

export type DashboardStore = {
  getSnapshot: () => DashboardPayload
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatIso(ts: number | null): string {
  if (!ts) return "never"
  try {
    return new Date(ts).toISOString()
  } catch {
    return "never"
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
  return "unknown"
}

function formatIsoNoMs(ts: number): string {
  const iso = new Date(ts).toISOString()
  return iso.replace(/\.\d{3}Z$/, "Z")
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)

  if (days > 0) return hours > 0 ? `${days}d${hours}h` : `${days}d`
  if (totalHours > 0) return minutes > 0 ? `${totalHours}h${minutes}m` : `${totalHours}h`
  if (totalMinutes > 0) return seconds > 0 ? `${totalMinutes}m${seconds}s` : `${totalMinutes}m`
  return `${seconds}s`
}

function formatTimeline(startAt: number | null, endAtMs: number): string {
  if (typeof startAt !== "number") return ""
  const start = formatIsoNoMs(startAt)
  const elapsed = formatElapsed(endAtMs - startAt)
  return `${start}: ${elapsed}`
}

// ---------------------------------------------------------------------------
// File-based payload builder
// ---------------------------------------------------------------------------

function buildDashboardPayloadFiles(opts: {
  projectRoot: string
  storage: OpenCodeStorageRoots
  nowMs?: number
}): DashboardPayload {
  const nowMs = opts.nowMs ?? Date.now()

  const boulder = readBoulderState(opts.projectRoot)
  const planName = boulder?.plan_name ?? "(no active plan)"
  const planPath = boulder?.active_plan ?? ""
  const plan = boulder ? readPlanProgress(opts.projectRoot, boulder.active_plan) : { total: 0, completed: 0, isComplete: false, missing: true }
  const planSteps = boulder ? readPlanSteps(opts.projectRoot, boulder.active_plan) : { missing: true, steps: [] as PlanStep[] }

  const sessionId = pickActiveSessionId({
    projectRoot: opts.projectRoot,
    storage: opts.storage,
    boulderSessionIds: boulder?.session_ids,
  })

  let sessionMeta: SessionMetadata | null = null
  if (sessionId) {
    const metas = readMainSessionMetas(opts.storage.session, opts.projectRoot)
    sessionMeta = metas.find((m) => m.id === sessionId) ?? null
  }

  const main = sessionId
    ? getMainSessionView({
        projectRoot: opts.projectRoot,
        sessionId,
        storage: opts.storage,
        sessionMeta,
        nowMs,
      })
    : { agent: "unknown", currentTool: null, lastUpdated: null, sessionLabel: "(no session)", status: "unknown" as const }

  const tasks = sessionId ? deriveBackgroundTasks({ storage: opts.storage, mainSessionId: sessionId, nowMs }) : []
  const timeSeries = deriveTimeSeriesActivity({
    storage: opts.storage,
    mainSessionId: sessionId ?? null,
    nowMs,
  })
  const mainCurrentModel = "currentModel" in main
    ? (main as MainSessionView).currentModel
    : null

  const mainSessionTasks = (() => {
    if (!sessionId) return []

    const mainStatus = main.status
    const status = mainStatus === "running_tool" || mainStatus === "thinking" || mainStatus === "busy"
      ? "running"
      : mainStatus === "idle"
        ? "idle"
        : "unknown"

    const { toolCalls } = deriveToolCalls({
      storage: opts.storage,
      sessionId,
    })

    const startAt = sessionMeta?.time?.created ?? null
    const endAtMs = status === "running" ? nowMs : (main.lastUpdated ?? nowMs)

    return [
      {
        id: "main-session",
        description: "Main session",
        subline: sessionId,
        agent: main.agent,
        lastModel: mainCurrentModel,
        status,
        toolCalls: toolCalls.length,
        lastTool: toolCalls[0]?.tool ?? "-",
        timeline: formatTimeline(startAt, endAtMs),
        sessionId,
      },
    ]
  })()

  const tokenUsage = deriveTokenUsage({
    storage: opts.storage,
    mainSessionId: sessionId ?? null,
    backgroundSessionIds: tasks.map((task) => task.sessionId ?? null),
  })

  const payload: DashboardPayload = {
    mainSession: {
      agent: main.agent,
      currentModel: mainCurrentModel,
      currentTool: main.currentTool ?? "-",
      lastUpdatedLabel: formatIso(main.lastUpdated),
      session: main.sessionLabel,
      sessionId: sessionId ?? null,
      statusPill: mainStatusPill(main.status),
    },
    planProgress: {
      name: planName,
      completed: plan.completed,
      total: plan.total,
      path: planPath,
      statusPill: planStatusPill(plan),
      steps: planSteps.missing ? [] : planSteps.steps,
    },
    backgroundTasks: tasks.map((t) => ({
      id: t.id,
      description: t.description,
      agent: t.agent,
      lastModel: t.lastModel ?? null,
      status: t.status,
      toolCalls: t.toolCalls ?? 0,
      lastTool: t.lastTool ?? "-",
      timeline: typeof t.timeline === "string" ? t.timeline : "",
      sessionId: t.sessionId ?? null,
    })),
    mainSessionTasks,
    timeSeries,
    tokenUsage,
    todos: [],
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
// Legacy storage detection
// ---------------------------------------------------------------------------

function hasLegacyStorageRoots(storage: OpenCodeStorageRoots): boolean {
  return fs.existsSync(storage.session) && fs.existsSync(storage.message) && fs.existsSync(storage.part)
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
    return buildDashboardPayloadFiles({
      projectRoot: opts.projectRoot,
      storage: opts.storage,
      nowMs,
    })
  }

  const boulder = readBoulderState(opts.projectRoot)
  const planName = boulder?.plan_name ?? "(no active plan)"
  const planPath = boulder?.active_plan ?? ""
  const plan = boulder ? readPlanProgress(opts.projectRoot, boulder.active_plan) : { total: 0, completed: 0, isComplete: false, missing: true }
  const planSteps = boulder ? readPlanSteps(opts.projectRoot, boulder.active_plan) : { missing: true, steps: [] as PlanStep[] }

  const active = pickActiveSessionIdSqlite({
    sqlitePath: backend.sqlitePath,
    projectRoot: opts.projectRoot,
    boulderSessionIds: boulder?.session_ids,
  })
  if (!active.ok) {
    if (hasLegacyStorageRoots(opts.storage)) {
      return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
    }
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const sessionId = active.value
  let sessionMeta: SessionMetadata | null = null
  if (sessionId) {
    const metas = readMainSessionMetasSqlite({ sqlitePath: backend.sqlitePath, directoryFilter: opts.projectRoot })
    if (!metas.ok) {
      if (hasLegacyStorageRoots(opts.storage)) {
        return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
      }
      return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
    }
    sessionMeta = metas.rows.find((m) => m.id === sessionId) ?? null
  }

  const main = sessionId
    ? (() => {
        const result = getMainSessionViewSqlite({
          sqlitePath: backend.sqlitePath,
          sessionId,
          sessionMeta,
          nowMs,
        })
        if (!result.ok) return null
        return result.value
      })()
    : { agent: "unknown", currentTool: null, currentModel: null, lastUpdated: null, sessionLabel: "(no session)", status: "unknown" as const }
  if (!main) {
    if (hasLegacyStorageRoots(opts.storage)) {
      return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
    }
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const tasksResult = sessionId
    ? deriveBackgroundTasksSqlite({
        sqlitePath: backend.sqlitePath,
        mainSessionId: sessionId,
        nowMs,
      })
    : { ok: true as const, value: [] }
  if (!tasksResult.ok) {
    if (hasLegacyStorageRoots(opts.storage)) {
      return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
    }
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const timeSeriesResult = deriveTimeSeriesActivitySqlite({
    sqlitePath: backend.sqlitePath,
    mainSessionId: sessionId ?? null,
    nowMs,
  })
  if (!timeSeriesResult.ok) {
    if (hasLegacyStorageRoots(opts.storage)) {
      return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
    }
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const mainCurrentModel = main.currentModel
  const mainSessionTasks = (() => {
    if (!sessionId) return []

    const mainStatus = main.status
    const status = mainStatus === "running_tool" || mainStatus === "thinking" || mainStatus === "busy"
      ? "running"
      : mainStatus === "idle"
        ? "idle"
        : "unknown"

    const callsResult = deriveToolCallsSqlite({ sqlitePath: backend.sqlitePath, sessionId })
    if (!callsResult.ok) {
      return []
    }

    const startAt = sessionMeta?.time?.created ?? null
    const endAtMs = status === "running" ? nowMs : (main.lastUpdated ?? nowMs)

    return [
      {
        id: "main-session",
        description: "Main session",
        subline: sessionId,
        agent: main.agent,
        lastModel: mainCurrentModel,
        status,
        toolCalls: callsResult.value.toolCalls.length,
        lastTool: callsResult.value.toolCalls[0]?.tool ?? "-",
        timeline: formatTimeline(startAt, endAtMs),
        sessionId,
      },
    ]
  })()

  const tokenUsageResult = deriveTokenUsageSqlite({
    sqlitePath: backend.sqlitePath,
    mainSessionId: sessionId ?? null,
    backgroundSessionIds: tasksResult.value.map((task) => task.sessionId ?? null),
  })
  if (!tokenUsageResult.ok) {
    if (hasLegacyStorageRoots(opts.storage)) {
      return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
    }
    return buildDashboardPayloadFiles({ projectRoot: opts.projectRoot, storage: opts.storage, nowMs })
  }

  const todosResult = sessionId
    ? deriveTodosSqlite({
        sqlitePath: backend.sqlitePath,
        sessionId,
      })
    : { ok: true as const, value: [] }
  // Don't fail the entire payload if todos fail, just use empty array
  const todos = todosResult.ok ? todosResult.value : []

  const payload: DashboardPayload = {
    mainSession: {
      agent: main.agent,
      currentModel: mainCurrentModel,
      currentTool: main.currentTool ?? "-",
      lastUpdatedLabel: formatIso(main.lastUpdated),
      session: main.sessionLabel,
      sessionId: sessionId ?? null,
      statusPill: mainStatusPill(main.status),
    },
    planProgress: {
      name: planName,
      completed: plan.completed,
      total: plan.total,
      path: planPath,
      statusPill: planStatusPill(plan),
      steps: planSteps.missing ? [] : planSteps.steps,
    },
    backgroundTasks: tasksResult.value.map((t) => ({
      id: t.id,
      description: t.description,
      agent: t.agent,
      lastModel: t.lastModel ?? null,
      status: t.status,
      toolCalls: t.toolCalls ?? 0,
      lastTool: t.lastTool ?? "-",
      timeline: typeof t.timeline === "string" ? t.timeline : "",
      sessionId: t.sessionId ?? null,
    })),
    mainSessionTasks,
    timeSeries: timeSeriesResult.value,
    tokenUsage: tokenUsageResult.value,
    todos,
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
// DashboardStore — dirty-flag caching with poll interval (read-only, no watchers)
// ---------------------------------------------------------------------------

export function createDashboardStore(opts: {
  projectRoot: string
  storageRoot: string
  storageBackend?: StorageBackend
  pollIntervalMs?: number
}): DashboardStore {
  const storage = getStorageRoots(opts.storageRoot)
  const pollIntervalMs = opts.pollIntervalMs ?? 2000

  let lastComputedAt = 0
  let dirty = true
  let cached: DashboardPayload | null = null

  return {
    getSnapshot() {
      const now = Date.now()
      if (!cached || dirty || now - lastComputedAt > pollIntervalMs) {
        cached = buildDashboardPayload({
          projectRoot: opts.projectRoot,
          storage,
          nowMs: now,
          storageBackend: opts.storageBackend,
        })
        lastComputedAt = now
        dirty = false
      }
      return cached
    },
  }
}
