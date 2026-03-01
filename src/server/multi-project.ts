import type {
  DashboardMultiProjectPayload,
  ProjectSnapshot,
  SessionStatus,
  PlanStatus,
  BackgroundTaskSummary,
  TokenUsageSummary,
  SessionTimeSeriesPayload,
} from "../types"
import { listSources, getSourceById } from "../ingest/sources-registry"
import { getLegacyStorageRootForBackend, type StorageBackend } from "../ingest/storage-backend"
import { createDashboardStore, type DashboardStore, type DashboardPayload } from "./dashboard"
import { derivePerSessionTimeSeries } from "../ingest/per-session-timeseries"

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

function transformPayloadToSnapshot(
  sourceId: string,
  label: string,
  projectRoot: string,
  payload: DashboardPayload,
  nowMs: number,
  sqlitePath?: string,
): ProjectSnapshot {
  return {
    sourceId,
    label,
    projectRoot,
    mainSession: {
      agent: payload.mainSession.agent,
      currentModel: payload.mainSession.currentModel,
      currentTool: payload.mainSession.currentTool,
      lastUpdated: payload.mainSession.lastUpdatedLabel,
      sessionLabel: payload.mainSession.session,
      sessionId: payload.mainSession.sessionId,
      status: mapStatusPillToSessionStatus(payload.mainSession.statusPill),
    },
    planProgress: {
      name: payload.planProgress.name,
      completed: payload.planProgress.completed,
      total: payload.planProgress.total,
      path: payload.planProgress.path,
      status: mapPlanStatusPill(payload.planProgress.statusPill),
      steps: payload.planProgress.steps,
      planStale: payload.planProgress.planStale,
      planComplete: payload.planProgress.planComplete,
    },
    timeSeries: payload.timeSeries,
    backgroundTasks: mapBackgroundTasks(payload),
    sessionTimeSeries: (() => {
      if (sqlitePath) {
        try {
          const result = derivePerSessionTimeSeries({ sqlitePath, projectRoot, nowMs })
          if (result.ok) return result.value
        } catch {
          // Per-source error isolation: fall back to empty on unexpected errors
        }
      }
      return buildEmptySessionTimeSeries(nowMs)
    })(),
    tokenUsage: mapTokenUsage(payload),
    lastUpdatedMs: nowMs,
  }
}

// ---------------------------------------------------------------------------
// Multi-project service
// ---------------------------------------------------------------------------

export function createMultiProjectService(opts: {
  storageRoot: string
  storageBackend: StorageBackend
  pollIntervalMs?: number
}): { getMultiProjectPayload: () => DashboardMultiProjectPayload } {
  const pollIntervalMs = opts.pollIntervalMs ?? 2000
  const storeBySourceId = new Map<string, DashboardStore>()
  const storeByProjectRoot = new Map<string, DashboardStore>()

  const legacyStorageRoot = getLegacyStorageRootForBackend(opts.storageBackend)

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

  function getMultiProjectPayload(): DashboardMultiProjectPayload {
    const nowMs = Date.now()
    const sources = listSources(opts.storageRoot)
    const projects: ProjectSnapshot[] = []

    for (const source of sources) {
      try {
        const entry = getSourceById(opts.storageRoot, source.id)
        if (!entry) continue

        const store = getOrCreateStore(source.id, entry.projectRoot)
        const payload = store.getSnapshot()
        const label = source.label ?? entry.projectRoot
        const sqlitePath = opts.storageBackend.kind === "sqlite" ? opts.storageBackend.sqlitePath : undefined
        const snapshot = transformPayloadToSnapshot(source.id, label, entry.projectRoot, payload, nowMs, sqlitePath)
        projects.push(snapshot)
      } catch {
        // Per-source error isolation: if one source fails, others still return
        continue
      }
    }

    return {
      projects,
      serverNowMs: nowMs,
      pollIntervalMs,
    }
  }

  return { getMultiProjectPayload }
}
