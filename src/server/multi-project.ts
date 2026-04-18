import { Database } from "bun:sqlite"
import { getGitUncommittedCount } from "../ingest/git-status"
import { getWorktreeInfo } from "../ingest/git-worktrees"
import { derivePerSessionTimeSeries } from "../ingest/per-session-timeseries"
import { findIncludedSessionsSqlite } from "../ingest/session-inclusion"
import { getSourceById, listSources } from "../ingest/sources-registry"
import { getMainSessionViewSqlite } from "../ingest/sqlite-derive"
import { compareSessionsBySeverity, computeAggregateStatus, selectDisplaySession } from "../ingest/status-rollup"
import { getLegacyStorageRootForBackend, type StorageBackend } from "../ingest/storage-backend"
import type {
  BackgroundTaskSummary,
  DashboardMultiProjectPayload,
  PlanStatus,
  ProjectSnapshot,
  SessionStatus,
  SessionSummary,
  SessionTimeSeriesPayload,
  TokenUsageSummary,
} from "../types"
import { createDashboardStore, type DashboardPayload, type DashboardStore } from "./dashboard"

// ---------------------------------------------------------------------------
// Helpers: transform DashboardPayload → ProjectSnapshot
// ---------------------------------------------------------------------------

function mapStatusPillToSessionStatus(pill: string): SessionStatus {
  if (pill === "running tool") return "running_tool"
  if (pill === "thinking") return "thinking"
  if (pill === "busy") return "busy"
  if (pill === "idle") return "idle"
  if (pill === "question") return "question"
  if (pill === "plan complete") return "plan_complete"
  if (pill === "error") return "error"
  return "unknown"
}

function mapPlanStatusPill(pill: string): PlanStatus {
  if (pill === "complete") return "complete"
  if (pill === "in progress") return "in progress"
  return "not started"
}

function mapBackgroundTasks(payload: DashboardPayload): BackgroundTaskSummary[] {
  return payload.backgroundTasks.map((t) => ({
    taskId: t.id,
    sessionId: t.sessionId ?? "",
    status: t.status,
    agent: t.agent,
    model: t.lastModel,
    currentTool: t.lastTool,
    lastUpdated: t.timeline,
  }))
}

function mapTokenUsage(payload: DashboardPayload): TokenUsageSummary | undefined {
  if (!payload.tokenUsage) return undefined
  const totals = payload.tokenUsage.totals
  return {
    inputTokens: totals.input,
    outputTokens: totals.output,
    totalTokens: totals.total,
  }
}

function buildEmptySessionTimeSeries(nowMs: number): SessionTimeSeriesPayload {
  return {
    windowMs: 300_000,
    bucketMs: 2_000,
    buckets: 150,
    anchorMs: Math.floor(nowMs / 2_000) * 2_000,
    serverNowMs: nowMs,
    sessions: [],
  }
}

export const MULTI_PROJECT_PAYLOAD_CACHE_TTL_MS = 5_000
export const SESSION_TIMESERIES_CACHE_TTL_MS = 15_000
export const SESSION_SUMMARY_CACHE_TTL_MS = 10_000
const INCLUDED_SESSION_IDLE_WINDOW_MS = 300_000
const MAX_CACHE_ENTRIES = 100
const DEFAULT_POLL_INTERVAL_MS = 2_000

function evictOldest<K>(map: Map<K, { fetchedAt: number }>, maxSize: number): void {
  if (map.size < maxSize) return
  let oldestKey: K | null = null
  let oldestAt = Infinity
  for (const [key, entry] of map) {
    if (entry.fetchedAt < oldestAt) {
      oldestAt = entry.fetchedAt
      oldestKey = key
    }
  }
  if (oldestKey !== null) map.delete(oldestKey)
}

function buildSessionSummary(projectRoot: string, db: Database, sqlitePath: string, nowMs: number): SessionSummary[] {
  try {
    const includedMetas = findIncludedSessionsSqlite(db, projectRoot, INCLUDED_SESSION_IDLE_WINDOW_MS)
    if (includedMetas.length === 0) return []

    // Only compute full session views for sessions that passed the pre-filter
    const summaries = includedMetas.flatMap((meta) => {
      const result = getMainSessionViewSqlite({
        sqlitePath,
        sessionId: meta.id,
        sessionMeta: meta,
        nowMs,
        db,
      })
      if (!result.ok) return []

      const summary: SessionSummary = {
        sessionId: meta.id,
        sessionLabel: result.value.sessionLabel,
        agent: result.value.agent,
        status: result.value.status,
        currentModel: result.value.currentModel ?? "-",
        currentTool: result.value.currentTool ?? "-",
        lastUpdated: result.value.lastUpdated ? new Date(result.value.lastUpdated).toISOString() : "",
        lastUpdatedMs: result.value.lastUpdated ?? 0,
      }
      return [summary]
    })

    return summaries.sort(compareSessionsBySeverity)
  } catch {
      // Expected: SQLite or data errors during session summary building
      return []
  }
}

function resolveSnapshotLastUpdatedMs(payload: DashboardPayload, sessions: SessionSummary[], nowMs: number): number {
  const values = sessions
    .map((session) => session.lastUpdatedMs)
    .filter((value) => Number.isFinite(value) && value > 0)

  if (values.length > 0) return Math.max(...values)
  const fallback = Date.parse(payload.mainSession.lastUpdatedLabel)
  return Number.isFinite(fallback) ? fallback : nowMs
}

function transformPayloadToSnapshot(
  sourceId: string,
  label: string,
  projectRoot: string,
  payload: DashboardPayload,
  sessions: SessionSummary[],
  nowMs: number,
  sessionTimeSeries: SessionTimeSeriesPayload,
): ProjectSnapshot {
  const displaySession = selectDisplaySession(sessions)
  const mainSessionStatus = mapStatusPillToSessionStatus(payload.mainSession.statusPill)
  const mainSession = displaySession
    ? {
        agent: displaySession.agent,
        currentModel: displaySession.currentModel,
        currentTool: displaySession.currentTool ?? "-",
        lastUpdated: displaySession.lastUpdated,
        sessionLabel: displaySession.sessionLabel,
        sessionId: displaySession.sessionId,
        status: displaySession.status,
      }
    : {
        agent: payload.mainSession.agent,
        currentModel: payload.mainSession.currentModel,
        currentTool: payload.mainSession.currentTool,
        lastUpdated: payload.mainSession.lastUpdatedLabel,
        sessionLabel: payload.mainSession.session,
        sessionId: payload.mainSession.sessionId,
        status: mainSessionStatus,
      }

  return {
    sourceId,
    label,
    projectRoot,
    mainSession,
    sessions,
    aggregateStatus: sessions.length > 0 ? computeAggregateStatus(sessions) : mainSession.status,
    planProgress: {
      name: payload.planProgress.name,
      completed: payload.planProgress.completed,
      total: payload.planProgress.total,
      path: payload.planProgress.path,
      status: mapPlanStatusPill(payload.planProgress.statusPill),
      steps: payload.planProgress.steps,
      planStale: payload.planProgress.planStale,
      planComplete: payload.planProgress.planComplete,
      boulderStatus: payload.planProgress.boulderStatus,
      completedAt: payload.planProgress.completedAt,
    },
    unintiatedPlans: payload.unintiatedPlans,
    planHistory: payload.planHistory,
    timeSeries: payload.timeSeries,
    backgroundTasks: mapBackgroundTasks(payload),
    sessionTimeSeries,
    tokenUsage: mapTokenUsage(payload),
    lastUpdatedMs: resolveSnapshotLastUpdatedMs(payload, sessions, nowMs),
  }
}

// ---------------------------------------------------------------------------
// Multi-project service
// ---------------------------------------------------------------------------

export function createMultiProjectService(opts: {
  storageRoot: string
  storageBackend: StorageBackend
  pollIntervalMs?: number
}): { getMultiProjectPayload: () => Promise<DashboardMultiProjectPayload>; invalidate: () => void } {
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const storeBySourceId = new Map<string, DashboardStore>()
  const storeByProjectRoot = new Map<string, DashboardStore>()
  const sessionTimeSeriesByProjectRoot = new Map<string, { value: SessionTimeSeriesPayload; fetchedAt: number }>()
  const sessionSummaryByProjectRoot = new Map<string, { value: SessionSummary[]; fetchedAt: number }>()
  let cachedPayload: DashboardMultiProjectPayload | null = null
  let cachedPayloadAt = 0

  const legacyStorageRoot = getLegacyStorageRootForBackend(opts.storageBackend)

  function getCachedSessionTimeSeries(projectRoot: string, sqlitePath: string | undefined, nowMs: number): SessionTimeSeriesPayload {
    const cached = sessionTimeSeriesByProjectRoot.get(projectRoot)
    if (cached && nowMs - cached.fetchedAt < SESSION_TIMESERIES_CACHE_TTL_MS) {
      return cached.value
    }

    if (!sqlitePath) {
      const empty = buildEmptySessionTimeSeries(nowMs)
      evictOldest(sessionTimeSeriesByProjectRoot, MAX_CACHE_ENTRIES)
      sessionTimeSeriesByProjectRoot.set(projectRoot, { value: empty, fetchedAt: nowMs })
      return empty
    }

    try {
      const result = derivePerSessionTimeSeries({ sqlitePath, projectRoot, nowMs })
      if (result.ok) {
        evictOldest(sessionTimeSeriesByProjectRoot, MAX_CACHE_ENTRIES)
        sessionTimeSeriesByProjectRoot.set(projectRoot, { value: result.value, fetchedAt: nowMs })
        return result.value
      }
    } catch {
      // Per-source error isolation: fall back to empty on unexpected errors
    }

    const empty = buildEmptySessionTimeSeries(nowMs)
    evictOldest(sessionTimeSeriesByProjectRoot, MAX_CACHE_ENTRIES)
    sessionTimeSeriesByProjectRoot.set(projectRoot, { value: empty, fetchedAt: nowMs })
    return empty
  }

  function getCachedSessionSummary(projectRoot: string, db: Database, sqlitePath: string, nowMs: number): SessionSummary[] {
    const cached = sessionSummaryByProjectRoot.get(projectRoot)
    if (cached && nowMs - cached.fetchedAt < SESSION_SUMMARY_CACHE_TTL_MS) {
      return cached.value
    }
    const value = buildSessionSummary(projectRoot, db, sqlitePath, nowMs)
    evictOldest(sessionSummaryByProjectRoot, MAX_CACHE_ENTRIES)
    sessionSummaryByProjectRoot.set(projectRoot, { value, fetchedAt: nowMs })
    return value
  }

  function getOrCreateStore(sourceId: string, projectRoot: string): DashboardStore {
    const existing = storeBySourceId.get(sourceId)
    if (existing) return existing

    const byRoot = storeByProjectRoot.get(projectRoot)
    if (byRoot) {
      storeBySourceId.set(sourceId, byRoot)
      return byRoot
    }

    const created = createDashboardStore({
      projectRoot,
      storageRoot: legacyStorageRoot,
      storageBackend: opts.storageBackend,
      pollIntervalMs,
    })
    storeBySourceId.set(sourceId, created)
    storeByProjectRoot.set(projectRoot, created)
    return created
  }

  async function getMultiProjectPayload(): Promise<DashboardMultiProjectPayload> {
    const nowMs = Date.now()
    if (cachedPayload && nowMs - cachedPayloadAt < MULTI_PROJECT_PAYLOAD_CACHE_TTL_MS) {
      return {
        ...cachedPayload,
        serverNowMs: nowMs,
      }
    }

    const sources = listSources(opts.storageRoot)
    const snapshots: Array<{ snapshot: ProjectSnapshot; projectRoot: string }> = []
    const sqlitePath = opts.storageBackend.kind === "sqlite" ? opts.storageBackend.sqlitePath : undefined

    let sharedDb: Database | null = null
    if (sqlitePath) {
      try {
        sharedDb = new Database(sqlitePath, { readonly: true })
      } catch {
      }
    }

    try {
      for (const source of sources) {
        try {
          const entry = getSourceById(opts.storageRoot, source.id)
          if (!entry) continue

          const store = getOrCreateStore(source.id, entry.projectRoot)
          const payload = store.getSnapshot()
          const label = source.label ?? entry.projectRoot
          const sessionTimeSeries = getCachedSessionTimeSeries(entry.projectRoot, sqlitePath, nowMs)
          const sessions = sharedDb && sqlitePath
            ? getCachedSessionSummary(entry.projectRoot, sharedDb, sqlitePath, nowMs)
            : []
          const snapshot = transformPayloadToSnapshot(source.id, label, entry.projectRoot, payload, sessions, nowMs, sessionTimeSeries)
          snapshots.push({ snapshot, projectRoot: entry.projectRoot })
        } catch {
          // Per-source error isolation: if one source fails, others still return
        }
      }
    } finally {
      try { sharedDb?.close() } catch {}
    }

    // Phase 2: Parallel async git operations across all sources
    await Promise.all(snapshots.map(async ({ snapshot, projectRoot }) => {
      try {
        const [gitCount, worktrees] = await Promise.all([
          getGitUncommittedCount(projectRoot),
          getWorktreeInfo(projectRoot),
        ])
        snapshot.gitUncommittedCount = gitCount
        snapshot.worktrees = worktrees
      } catch {
        // Git failures are isolated per-source
      }
    }))

    const projects = snapshots.map((s) => s.snapshot)

    const payload = {
      projects,
      serverNowMs: nowMs,
      pollIntervalMs,
    }

    cachedPayload = payload
    cachedPayloadAt = Date.now()
    return payload
  }

  function invalidate(): void {
    cachedPayload = null
    cachedPayloadAt = 0
    sessionTimeSeriesByProjectRoot.clear()
    sessionSummaryByProjectRoot.clear()
  }

  return { getMultiProjectPayload, invalidate }
}
