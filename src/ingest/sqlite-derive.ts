import type { Database } from "bun:sqlite"
import {
  ACTIVE_BUSY_WINDOW_MS,
  BACKGROUND_RUNNING_WINDOW_MS,
  ERROR_STALE_MS,
  hasFreshMainSessionActivity,
  resolveLastUpdatedTime,
  shouldSuppressStaleToolActivity,
  shouldKeepQueuedBackgroundTaskActive,
} from "./activity-status"
import type { BackgroundTaskRow } from "./background-tasks"
import { canonicalizeAgent, formatElapsed, formatIsoNoMs, formatTimeline, normalizeSessionIds } from "./format-utils"
import { pickLatestModelString } from "./model"
import type { MainSessionView, SessionMetadata, StoredMessageMeta, StoredToolPart } from "./session"
import {
  readAllSessionMetasSqlite,
  readMainSessionMetasSqlite,
  readRecentMessageMetasSqlite,
  readSessionExistsSqlite,
  readTodosSqlite,
  readTodosSqliteForSessionIds,
  readToolPartsForMessagesSqlite,
  type SqliteReadFailureReason,
  type TodoItem,
} from "./storage-backend"
import { findBackgroundSessionId, findTaskSessionId } from "./sqlite-utils"
import { aggregateTokenUsage } from "./token-usage-core"
import { MAX_TOOL_CALL_MESSAGES, MAX_TOOL_CALLS, type ToolCallSummaryResult } from "./tool-calls"
import { isPendingQuestionTool, TASK_TOOL_NAMES } from "./tool-names"
import type { TimeSeriesPayload, TimeSeriesSeries } from "./timeseries"

type SqliteDeriveResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: SqliteReadFailureReason }

const DESCRIPTION_MAX = 120
const AGENT_MAX = 30
const SESSION_ID_MAX = 200
const TOKEN_USAGE_MESSAGE_LIMIT = 10_000

const SERIES_ORDER: Array<Pick<TimeSeriesSeries, "id" | "label" | "tone">> = [
  { id: "overall-main", label: "Overall", tone: "muted" },
  { id: "agent:sisyphus", label: "Sisyphus", tone: "teal" },
  { id: "agent:prometheus", label: "Prometheus", tone: "red" },
  { id: "agent:atlas", label: "Atlas", tone: "green" },
  { id: "background-total", label: "Background tasks (total)", tone: "muted" },
]

function createEmptyTimeSeriesPayload(opts: {
  nowMs: number
  windowMs: number
  bucketMs: number
}): TimeSeriesPayload {
  const buckets = Math.floor(opts.windowMs / opts.bucketMs)

  return {
    windowMs: opts.windowMs,
    bucketMs: opts.bucketMs,
    buckets,
    anchorMs: Math.floor(opts.nowMs / opts.bucketMs) * opts.bucketMs,
    serverNowMs: opts.nowMs,
    series: SERIES_ORDER.map((series) => ({
      ...series,
      values: zeroBuckets(buckets),
    })),
  }
}

function mergeTimeSeriesPayload(target: TimeSeriesPayload, source: TimeSeriesPayload): void {
  const targetSeries = new Map(target.series.map((series) => [series.id, series] as const))

  for (const series of source.series) {
    const existing = targetSeries.get(series.id)
    if (!existing) continue

    const limit = Math.min(existing.values.length, series.values.length)
    for (let index = 0; index < limit; index += 1) {
      existing.values[index] += series.values[index] ?? 0
    }
  }
}

function readStartTimeFromToolPart(part: unknown): number | null {
  if (!part || typeof part !== "object") return null
  const rec = part as Record<string, unknown>
  const state = rec.state
  if (!state || typeof state !== "object") return null
  const time = (state as Record<string, unknown>).time
  if (!time || typeof time !== "object") return null
  const start = (time as Record<string, unknown>).start
  return typeof start === "number" && Number.isFinite(start) ? start : null
}

function clampString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null
  const s = value.trim()
  if (!s) return null
  return s.length <= maxLen ? s : s.slice(0, maxLen)
}

function readSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const s = value.trim()
  if (!s) return null
  if (s.length > SESSION_ID_MAX) return null
  if (s === "pending") return null
  return s
}

function readToolStateTitle(part: unknown): string | null {
  if (!part || typeof part !== "object") return null
  const rec = part as Record<string, unknown>
  const state = rec.state
  if (!state || typeof state !== "object") return null
  return clampString((state as Record<string, unknown>).title, DESCRIPTION_MAX)
}

function readToolStateSessionId(part: unknown): string | null {
  if (!part || typeof part !== "object") return null
  const rec = part as Record<string, unknown>
  const state = rec.state
  if (!state || typeof state !== "object") return null
  const meta = (state as Record<string, unknown>).metadata
  if (!meta || typeof meta !== "object") return null
  const m = meta as Record<string, unknown>
  return (
    readSessionId(m.sessionId) ??
    readSessionId(m.sessionID) ??
    readSessionId(m.session_id)
  )
}

function stripSessionTitlePrefix(title: string): string {
  const trimmed = title.trim()
  const stripped = trimmed.startsWith("Background: ")
    ? trimmed.slice("Background: ".length).trimStart()
    : trimmed.startsWith("Task: ")
      ? trimmed.slice("Task: ".length).trimStart()
      : trimmed
  return /^(undefined|null)(\b|\s)/i.test(stripped) ? "" : stripped
}

function isTaskTool(toolName: string): boolean {
  return TASK_TOOL_NAMES.has(toolName)
}

function mapToolPartsByMessage(parts: StoredToolPart[]): Map<string, StoredToolPart[]> {
  const out = new Map<string, StoredToolPart[]>()
  for (const part of parts) {
    const list = out.get(part.messageID)
    if (list) {
      list.push(part)
    } else {
      out.set(part.messageID, [part])
    }
  }
  return out
}

function findPendingQuestionTool(
  metas: StoredMessageMeta[],
  partsByMessage: Map<string, StoredToolPart[]>,
): string | null {
  for (const meta of metas) {
    const parts = partsByMessage.get(meta.id) ?? []
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (isPendingQuestionTool(part.tool, part.state.status)) {
        return part.tool
      }
    }
  }
  return null
}

function readSessionMessagesAndParts(opts: {
  sqlitePath: string
  sessionId: string
  limit: number
  db?: Database
}): SqliteDeriveResult<{ metas: StoredMessageMeta[]; partsByMessage: Map<string, StoredToolPart[]> }> {
  const metasResult = readRecentMessageMetasSqlite({
    sqlitePath: opts.sqlitePath,
    sessionId: opts.sessionId,
    limit: opts.limit,
    db: opts.db,
  })
  if (!metasResult.ok) return metasResult
  const messageIds = metasResult.rows.map((meta) => meta.id)
  const partsResult = readToolPartsForMessagesSqlite({
    sqlitePath: opts.sqlitePath,
    messageIds,
    db: opts.db,
  })
  if (!partsResult.ok) return partsResult

  return {
    ok: true,
    value: {
      metas: metasResult.rows,
      partsByMessage: mapToolPartsByMessage(partsResult.rows),
    },
  }
}

function addToBucket(values: number[], bucketIndex: number, count: number): void {
  if (bucketIndex < 0 || bucketIndex >= values.length) return
  values[bucketIndex] += count
}

function getCreated(meta: StoredMessageMeta): number {
  const created = meta.time?.created
  return typeof created === "number" ? created : -Infinity
}

function zeroBuckets(size: number): number[] {
  return Array.from({ length: size }, () => 0)
}

export function pickActiveSessionIdSqlite(opts: {
  sqlitePath: string
  projectRoot: string
  boulderSessionIds?: string[]
  db?: Database
}): SqliteDeriveResult<string | null> {
  const metasResult = readMainSessionMetasSqlite({
    sqlitePath: opts.sqlitePath,
    directoryFilter: opts.projectRoot,
    db: opts.db,
  })
  if (!metasResult.ok) return metasResult

  const metas = metasResult.rows
  const metaById = new Map(metas.map((m) => [m.id, m] as const))

  let bestId: string | null = metas[0]?.id ?? null
  let bestUpdated = bestId ? (metaById.get(bestId)?.time.updated ?? -Infinity) : -Infinity
  let bestIsBoulder = false

  const consider = (candidateId: string, updatedAt: number, isBoulder: boolean): void => {
    if (!bestId) {
      bestId = candidateId
      bestUpdated = updatedAt
      bestIsBoulder = isBoulder
      return
    }
    if (updatedAt > bestUpdated) {
      bestId = candidateId
      bestUpdated = updatedAt
      bestIsBoulder = isBoulder
      return
    }
    if (updatedAt === bestUpdated && isBoulder && !bestIsBoulder) {
      bestId = candidateId
      bestUpdated = updatedAt
      bestIsBoulder = true
    }
  }

  const ids = opts.boulderSessionIds ?? []
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i]
    const messages = readRecentMessageMetasSqlite({ sqlitePath: opts.sqlitePath, sessionId: id, limit: 1, db: opts.db })
    if (!messages.ok) return messages
    if (messages.rows.length === 0) continue

    const meta = metaById.get(id)
    if (meta) {
      consider(id, meta.time.updated ?? meta.time.created ?? 0, true)
      continue
    }

    if (metas.length === 0) {
      const created = typeof messages.rows[0]?.time?.created === "number" ? messages.rows[0].time.created : 0
      consider(id, created, true)
    }
  }

  return { ok: true, value: bestId }
}

export function getMainSessionViewSqlite(opts: {
  sqlitePath: string
  sessionId: string
  sessionMeta?: SessionMetadata | null
  nowMs?: number
  db?: Database
}): SqliteDeriveResult<MainSessionView> {
  const nowMs = opts.nowMs ?? Date.now()
  const session = readSessionMessagesAndParts({
    sqlitePath: opts.sqlitePath,
    sessionId: opts.sessionId,
    limit: 200,
    db: opts.db,
  })
  if (!session.ok) return session

  const recent = session.value.metas[0] ?? null
  const lastUpdated = resolveLastUpdatedTime(recent?.time?.created ?? null, opts.sessionMeta?.time.updated ?? null)
  const sessionLabel = opts.sessionMeta?.title ?? opts.sessionId
  const agent = recent?.agent ?? "unknown"
  const currentModel = pickLatestModelString(session.value.metas)

  let activeTool: { tool: string; status: string } | null = null
  for (const meta of session.value.metas) {
    const parts = session.value.partsByMessage.get(meta.id) ?? []
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (part.state.status === "pending" || part.state.status === "running") {
        activeTool = { tool: part.tool, status: part.state.status }
        break
      }
    }
    if (activeTool) break
  }

  let latestTerminalStatus: "error" | "completed" | null = null
  let latestTerminalAt: number | null = null
  if (!activeTool) {
    findLastTerminal: for (const meta of session.value.metas) {
      const parts = session.value.partsByMessage.get(meta.id) ?? []
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const status = parts[i]?.state.status
        if (status === "error" || status === "completed") {
          latestTerminalStatus = status
          latestTerminalAt = typeof meta.time?.created === "number" ? meta.time.created : null
          break findLastTerminal
        }
      }
    }
  }

  const hasFreshActivity = hasFreshMainSessionActivity(lastUpdated, nowMs)
  const isStaleActivity = typeof lastUpdated === "number" && !hasFreshActivity
  const isTerminalErrorStale = typeof latestTerminalAt !== "number" || (nowMs - latestTerminalAt > ERROR_STALE_MS)

  let status: MainSessionView["status"] = "unknown"
  if (activeTool?.status === "pending" || activeTool?.status === "running") {
    if (shouldSuppressStaleToolActivity(activeTool.tool, activeTool.status, hasFreshActivity)) {
      activeTool = null
    } else {
      status = isPendingQuestionTool(activeTool.tool, activeTool.status) ? "question" : "running_tool"
    }
  }

  if (status === "unknown" && !isStaleActivity && latestTerminalStatus === "error" && !isTerminalErrorStale) {
    status = "error"
  } else if (status === "unknown" && !isStaleActivity && recent?.role === "assistant" && typeof recent.time?.created === "number" && typeof recent.time?.completed !== "number") {
    status = "thinking"
  } else if (status === "unknown" && typeof lastUpdated === "number") {
    status = nowMs - lastUpdated <= ACTIVE_BUSY_WINDOW_MS ? "busy" : "idle"
  }

  if (status === "idle" || status === "busy" || status === "unknown") {
    const bgResult = deriveBackgroundTasksSqlite({
      sqlitePath: opts.sqlitePath,
      mainSessionId: opts.sessionId,
      nowMs,
    })
    if (bgResult.ok) {
      const questionTask = bgResult.value.find((t) => t.status === "question")
      if (questionTask) {
        status = "question"
        if (!activeTool) activeTool = { tool: questionTask.lastTool ?? "question", status: "running" }
      } else if (bgResult.value.some((t) => t.status === "running" || t.status === "queued")) {
        status = "running_tool"
        if (!activeTool) activeTool = { tool: "task", status: "running" }
      }
    }
  }

  return {
    ok: true,
    value: {
      agent,
      currentTool: activeTool?.tool ?? null,
      currentModel,
      lastUpdated,
      sessionLabel,
      status,
    },
  }
}

export function deriveBackgroundTasksSqlite(opts: {
  sqlitePath: string
  mainSessionId: string
  nowMs?: number
  db?: Database
  allSessionMetas?: SessionMetadata[]
}): SqliteDeriveResult<BackgroundTaskRow[]> {
  const nowMs = opts.nowMs ?? Date.now()
  const main = readSessionMessagesAndParts({
    sqlitePath: opts.sqlitePath,
    sessionId: opts.mainSessionId,
    limit: 200,
    db: opts.db,
  })
  if (!main.ok) return main

  const allSessionMetasResult = opts.allSessionMetas
    ? { ok: true as const, rows: opts.allSessionMetas }
    : readAllSessionMetasSqlite({ sqlitePath: opts.sqlitePath, db: opts.db })
  if (!allSessionMetasResult.ok) return allSessionMetasResult
  const allSessionMetas = allSessionMetasResult.rows
  const sessionMetaById = new Map(allSessionMetas.map((m) => [m.id, m] as const))

  const backgroundMessageCache = new Map<string, StoredMessageMeta[]>()
  const backgroundPartsCache = new Map<string, Map<string, StoredToolPart[]>>()

  const readBackgroundSession = (sessionId: string): SqliteDeriveResult<{ metas: StoredMessageMeta[]; partsByMessage: Map<string, StoredToolPart[]> }> => {
    const existingMetas = backgroundMessageCache.get(sessionId)
    const existingParts = backgroundPartsCache.get(sessionId)
    if (existingMetas && existingParts) {
      return { ok: true, value: { metas: existingMetas, partsByMessage: existingParts } }
    }

    const loaded = readSessionMessagesAndParts({
      sqlitePath: opts.sqlitePath,
      sessionId,
      limit: 200,
      db: opts.db,
    })
    if (!loaded.ok) return loaded
    backgroundMessageCache.set(sessionId, loaded.value.metas)
    backgroundPartsCache.set(sessionId, loaded.value.partsByMessage)
    return loaded
  }

  const rows: BackgroundTaskRow[] = []
  const ordered = [...main.value.metas].sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0))
  for (const meta of ordered) {
    const messageCreatedAt = meta.time?.created ?? null
    if (typeof messageCreatedAt !== "number") continue
    const parts = main.value.partsByMessage.get(meta.id) ?? []

    for (const part of parts) {
      if (!isTaskTool(part.tool)) continue
      if (!part.state || typeof part.state !== "object") continue
      const input = part.state.input ?? {}
      if (typeof input !== "object" || input === null) continue

      const rec = input as Record<string, unknown>
      const runInBackground = part.tool === "background_task" ? true : rec.run_in_background
      if (runInBackground !== true && runInBackground !== false) continue

      const rawDescription = typeof rec.description === "string" ? rec.description.trim() : ""

      const subagentType = clampString(rec.subagent_type ?? rec.agent, AGENT_MAX)
      const category = clampString(rec.category, AGENT_MAX)
      const agent = subagentType ?? (category ? `sisyphus-junior (${category})` : "unknown")

      let backgroundSessionId: string | null = null
      const startedAt = readStartTimeFromToolPart(part) ?? messageCreatedAt

      backgroundSessionId = readToolStateSessionId(part)

      if (runInBackground) {
        if (!backgroundSessionId && rawDescription) {
          backgroundSessionId = findBackgroundSessionId({
            allSessionMetas,
            parentSessionId: opts.mainSessionId,
            description: rawDescription,
            subagentType,
            category,
            startedAt,
          })
        }
      } else {
        const resume = typeof rec.resume === "string" ? rec.resume.trim() : ""
        if (resume) {
          const resumed = readBackgroundSession(resume)
          if (!resumed.ok) return resumed
          if (resumed.value.metas.length > 0) backgroundSessionId = resume
        }
        if (!backgroundSessionId && rawDescription) {
          backgroundSessionId = findBackgroundSessionId({
            allSessionMetas,
            parentSessionId: opts.mainSessionId,
            description: rawDescription,
            subagentType,
            category,
            startedAt,
          })
          if (!backgroundSessionId) {
            backgroundSessionId = findTaskSessionId({
              allSessionMetas,
              parentSessionId: opts.mainSessionId,
              description: rawDescription,
              subagentType,
              category,
              startedAt,
            })
          }
        }
      }

      const description = (
        clampString(rawDescription, DESCRIPTION_MAX) ??
        readToolStateTitle(part) ??
        (() => {
          const t = sessionMetaById.get(backgroundSessionId ?? "")?.title
          if (typeof t !== "string") return null
          return clampString(stripSessionTitlePrefix(t), DESCRIPTION_MAX)
        })() ??
        (subagentType ? `${subagentType} task` : category ? `${category} task` : "Task")
      )

      const background = backgroundSessionId ? readBackgroundSession(backgroundSessionId) : null
      if (background && !background.ok) return background
      const backgroundMetas = background && background.ok ? background.value.metas : []
      const backgroundPartsByMessage = background && background.ok ? background.value.partsByMessage : new Map<string, StoredToolPart[]>()
      const pendingQuestionTool = findPendingQuestionTool(backgroundMetas, backgroundPartsByMessage)

      let toolCalls = 0
      let lastTool: string | null = null
      let lastUpdateAt: number | null = null

      const statsOrdered = [...backgroundMetas].sort((a, b) => {
        const at = a.time?.created ?? 0
        const bt = b.time?.created ?? 0
        if (at !== bt) return at - bt
        return String(a.id).localeCompare(String(b.id))
      })
      for (const backgroundMeta of statsOrdered) {
        const created = backgroundMeta.time?.created
        if (typeof created === "number") lastUpdateAt = created
        const backgroundParts = backgroundPartsByMessage.get(backgroundMeta.id) ?? []
        for (const backgroundPart of backgroundParts) {
          toolCalls += 1
          lastTool = backgroundPart.tool
        }
      }

      const lastModel = backgroundMetas.length > 0 ? pickLatestModelString(backgroundMetas) : null
      let status: BackgroundTaskRow["status"] = "unknown"
      if (!backgroundSessionId) {
        status = shouldKeepQueuedBackgroundTaskActive(startedAt, nowMs) ? "queued" : "unknown"
      } else if (toolCalls === 0 && lastUpdateAt === null) {
        status = shouldKeepQueuedBackgroundTaskActive(startedAt, nowMs) ? "queued" : "unknown"
      } else if (pendingQuestionTool) {
        status = "question"
      } else if (lastUpdateAt && nowMs - lastUpdateAt <= BACKGROUND_RUNNING_WINDOW_MS) {
        status = "running"
      } else if (toolCalls > 0) {
        status = "completed"
      }

      const timelineEndMs = status === "completed" ? (lastUpdateAt ?? nowMs) : nowMs

      rows.push({
        id: part.callID,
        description,
        agent,
        status,
        toolCalls: backgroundSessionId ? toolCalls : null,
        lastTool: pendingQuestionTool ?? lastTool,
        lastModel,
        timeline: status === "unknown" ? "" : formatTimeline(startedAt, timelineEndMs),
        sessionId: backgroundSessionId,
      })
    }

    if (rows.length >= 50) break
  }

  return { ok: true, value: rows }
}

export function deriveBackgroundTasksSqliteForSessions(opts: {
  sqlitePath: string
  mainSessionIds?: Array<string | null | undefined>
  nowMs?: number
  db?: Database
}): SqliteDeriveResult<BackgroundTaskRow[]> {
  const sessionIds = normalizeSessionIds(opts.mainSessionIds ?? [])
  if (sessionIds.length === 0) return { ok: true, value: [] }

  const allSessionMetasResult = readAllSessionMetasSqlite({ sqlitePath: opts.sqlitePath, db: opts.db })
  if (!allSessionMetasResult.ok) return allSessionMetasResult

  const rows: BackgroundTaskRow[] = []
  for (const sessionId of sessionIds) {
    const result = deriveBackgroundTasksSqlite({
      sqlitePath: opts.sqlitePath,
      mainSessionId: sessionId,
      nowMs: opts.nowMs,
      db: opts.db,
      allSessionMetas: allSessionMetasResult.rows,
    })
    if (!result.ok) return result
    rows.push(...result.value)
  }

  return { ok: true, value: rows }
}

export function deriveTimeSeriesActivitySqlite(opts: {
  sqlitePath: string
  mainSessionId: string | null
  nowMs?: number
  windowMs?: number
  bucketMs?: number
  db?: Database
  allSessionMetas?: SessionMetadata[]
}): SqliteDeriveResult<TimeSeriesPayload> {
  const windowMs = opts.windowMs ?? 300_000
  const bucketMs = opts.bucketMs ?? 2_000
  const buckets = Math.floor(windowMs / bucketMs)
  const nowMs = opts.nowMs ?? Date.now()
  const anchorMs = Math.floor(nowMs / bucketMs) * bucketMs
  const startMs = anchorMs - windowMs

  const overall = zeroBuckets(buckets)
  const sisyphus = zeroBuckets(buckets)
  const prometheus = zeroBuckets(buckets)
  const atlas = zeroBuckets(buckets)
  const background = zeroBuckets(buckets)

  const allSessionMetasResult = opts.allSessionMetas
    ? { ok: true as const, rows: opts.allSessionMetas }
    : readAllSessionMetasSqlite({ sqlitePath: opts.sqlitePath, db: opts.db })
  if (!allSessionMetasResult.ok) return allSessionMetasResult

  const perSessionCache = new Map<string, { metas: StoredMessageMeta[]; partsByMessage: Map<string, StoredToolPart[]> }>()
  const loadSession = (sessionId: string): SqliteDeriveResult<{ metas: StoredMessageMeta[]; partsByMessage: Map<string, StoredToolPart[]> }> => {
    const cached = perSessionCache.get(sessionId)
    if (cached) return { ok: true, value: cached }
    const loaded = readSessionMessagesAndParts({
      sqlitePath: opts.sqlitePath,
      sessionId,
      limit: 200,
      db: opts.db,
    })
    if (!loaded.ok) return loaded
    perSessionCache.set(sessionId, loaded.value)
    return loaded
  }

  const bucketSession = (sessionId: string, includePerAgent: boolean, isBackground: boolean): SqliteDeriveResult<void> => {
    const session = loadSession(sessionId)
    if (!session.ok) return session
    const ordered = [...session.value.metas].sort((a, b) => {
      const at = getCreated(a)
      const bt = getCreated(b)
      if (bt !== at) return bt - at
      return String(a.id).localeCompare(String(b.id))
    })

    for (const meta of ordered) {
      const created = getCreated(meta)
      if (created < startMs) break
      if (created >= anchorMs) continue
      const bucketIndex = Math.floor((created - startMs) / bucketMs)
      const toolCount = (session.value.partsByMessage.get(meta.id) ?? []).length
      if (toolCount <= 0) continue
      addToBucket(overall, bucketIndex, toolCount)
      if (isBackground) {
        addToBucket(background, bucketIndex, toolCount)
      }
      if (includePerAgent) {
        const agent = canonicalizeAgent(meta.agent)
        if (agent === "sisyphus") addToBucket(sisyphus, bucketIndex, toolCount)
        if (agent === "prometheus") addToBucket(prometheus, bucketIndex, toolCount)
        if (agent === "atlas") addToBucket(atlas, bucketIndex, toolCount)
      }
    }

    return { ok: true, value: undefined }
  }

  if (opts.mainSessionId) {
    const mainResult = bucketSession(opts.mainSessionId, true, false)
    if (!mainResult.ok) return mainResult

    const childSessions = allSessionMetasResult.rows
      .filter((meta) => meta.parentID === opts.mainSessionId)
      .sort((a, b) => {
        const at = a.time?.updated ?? 0
        const bt = b.time?.updated ?? 0
        if (bt !== at) return bt - at
        return String(a.id).localeCompare(String(b.id))
      })
      .slice(0, 25)
      .map((meta) => meta.id)

    for (const childSessionId of childSessions) {
      const childResult = bucketSession(childSessionId, false, true)
      if (!childResult.ok) return childResult
    }
  }

  return {
    ok: true,
    value: {
      windowMs,
      bucketMs,
      buckets,
      anchorMs,
      serverNowMs: nowMs,
      series: [
        { ...SERIES_ORDER[0], values: overall },
        { ...SERIES_ORDER[1], values: sisyphus },
        { ...SERIES_ORDER[2], values: prometheus },
        { ...SERIES_ORDER[3], values: atlas },
        { ...SERIES_ORDER[4], values: background },
      ],
    },
  }
}

export function deriveTimeSeriesActivitySqliteForSessions(opts: {
  sqlitePath: string
  mainSessionIds?: Array<string | null | undefined>
  nowMs?: number
  windowMs?: number
  bucketMs?: number
  db?: Database
}): SqliteDeriveResult<TimeSeriesPayload> {
  const nowMs = opts.nowMs ?? Date.now()
  const windowMs = opts.windowMs ?? 300_000
  const bucketMs = opts.bucketMs ?? 2_000
  const payload = createEmptyTimeSeriesPayload({ nowMs, windowMs, bucketMs })
  const sessionIds = normalizeSessionIds(opts.mainSessionIds ?? [])
  if (sessionIds.length === 0) return { ok: true, value: payload }

  const allSessionMetasResult = readAllSessionMetasSqlite({ sqlitePath: opts.sqlitePath, db: opts.db })
  if (!allSessionMetasResult.ok) return allSessionMetasResult

  for (const sessionId of sessionIds) {
    const result = deriveTimeSeriesActivitySqlite({
      sqlitePath: opts.sqlitePath,
      mainSessionId: sessionId,
      nowMs,
      windowMs,
      bucketMs,
      db: opts.db,
      allSessionMetas: allSessionMetasResult.rows,
    })
    if (!result.ok) return result
    mergeTimeSeriesPayload(payload, result.value)
  }

  return { ok: true, value: payload }
}

export function deriveTokenUsageSqliteForSessions(opts: {
  sqlitePath: string
  sessionIds?: Array<string | null | undefined>
  db?: Database
}): SqliteDeriveResult<ReturnType<typeof aggregateTokenUsage>> {
  const sessionIds = normalizeSessionIds(opts.sessionIds ?? [])

  const metas: unknown[] = []
  for (const sessionId of sessionIds) {
    const result = readRecentMessageMetasSqlite({
      sqlitePath: opts.sqlitePath,
      sessionId,
      limit: TOKEN_USAGE_MESSAGE_LIMIT,
      db: opts.db,
    })
    if (!result.ok) return result
    metas.push(...result.rows)
  }

  return {
    ok: true,
    value: aggregateTokenUsage(metas),
  }
}

export function deriveTokenUsageSqlite(opts: {
  sqlitePath: string
  mainSessionId: string | null
  backgroundSessionIds?: Array<string | null | undefined>
  db?: Database
}): SqliteDeriveResult<ReturnType<typeof aggregateTokenUsage>> {
  return deriveTokenUsageSqliteForSessions({
    sqlitePath: opts.sqlitePath,
    sessionIds: [opts.mainSessionId, ...(opts.backgroundSessionIds ?? [])],
    db: opts.db,
  })
}

export function deriveToolCallsSqlite(opts: {
  sqlitePath: string
  sessionId: string
  db?: Database
}): SqliteDeriveResult<ToolCallSummaryResult & { sessionExists: boolean }> {
  const metasResult = readRecentMessageMetasSqlite({
    sqlitePath: opts.sqlitePath,
    sessionId: opts.sessionId,
    limit: MAX_TOOL_CALL_MESSAGES,
    db: opts.db,
  })
  if (!metasResult.ok) return metasResult

  if (metasResult.rows.length === 0) {
    const existsResult = readSessionExistsSqlite({
      sqlitePath: opts.sqlitePath,
      sessionId: opts.sessionId,
      db: opts.db,
    })
    if (!existsResult.ok) return existsResult
    return {
      ok: true,
      value: {
        toolCalls: [],
        truncated: false,
        sessionExists: existsResult.rows.length > 0,
      },
    }
  }

  const partsResult = readToolPartsForMessagesSqlite({
    sqlitePath: opts.sqlitePath,
    messageIds: metasResult.rows.map((meta) => meta.id),
    db: opts.db,
  })
  if (!partsResult.ok) return partsResult

  const partsByMessage = mapToolPartsByMessage(partsResult.rows)
  const calls: Array<{
    sessionId: string
    messageId: string
    callId: string
    tool: string
    status: "pending" | "running" | "completed" | "error" | "unknown"
    createdAtMs: number | null
    createdSortKey: number
  }> = []

  for (const meta of metasResult.rows) {
    const createdAtMs = typeof meta.time?.created === "number" ? meta.time.created : null
    const createdSortKey = createdAtMs ?? -Infinity
    const parts = partsByMessage.get(meta.id) ?? []
    for (const part of parts) {
      calls.push({
        sessionId: opts.sessionId,
        messageId: meta.id,
        callId: part.callID,
        tool: part.tool,
        status: part.state.status,
        createdAtMs,
        createdSortKey,
      })
    }
  }

  const truncatedByMessages = metasResult.rows.length >= MAX_TOOL_CALL_MESSAGES
  const truncatedByCalls = calls.length > MAX_TOOL_CALLS
  const toolCalls = calls
    .sort((a, b) => {
      if (a.createdSortKey !== b.createdSortKey) return b.createdSortKey - a.createdSortKey
      const messageCompare = String(a.messageId).localeCompare(String(b.messageId))
      if (messageCompare !== 0) return messageCompare
      return String(a.callId).localeCompare(String(b.callId))
    })
    .slice(0, MAX_TOOL_CALLS)
    .map(({ createdSortKey, ...row }) => row)

  return {
    ok: true,
    value: {
      toolCalls,
      truncated: truncatedByMessages || truncatedByCalls,
      sessionExists: true,
    },
  }
}

export function deriveTodosSqlite(opts: {
  sqlitePath: string
  sessionId: string
  db?: Database
}): SqliteDeriveResult<TodoItem[]> {
  const result = readTodosSqlite({
    sqlitePath: opts.sqlitePath,
    sessionId: opts.sessionId,
    db: opts.db,
  })
  if (!result.ok) return result

  return {
    ok: true,
    value: result.rows,
  }
}

export function deriveTodosSqliteForSessions(opts: {
  sqlitePath: string
  sessionIds?: Array<string | null | undefined>
  db?: Database
}): SqliteDeriveResult<TodoItem[]> {
  const sessionIds = normalizeSessionIds(opts.sessionIds ?? [])
  if (sessionIds.length === 0) return { ok: true, value: [] }

  const result = readTodosSqliteForSessionIds({
    sqlitePath: opts.sqlitePath,
    sessionIds,
    db: opts.db,
  })
  if (!result.ok) return result

  const { sessionId: _, ...todoRest } = result.rows[0] ?? {}
  return {
    ok: true,
    value: result.rows.map(({ sessionId: _sid, ...item }) => item),
  }
}
