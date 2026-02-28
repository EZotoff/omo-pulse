import * as path from "node:path"
import { Database } from "bun:sqlite"
import type { SessionTimeSeriesPayload, SessionTimeSeriesEntry } from "../types"
import { realpathSafe } from "./paths"

type SqliteReadFailureReason = "db_busy" | "db_corrupt" | "db_unopenable" | "db_query_failed"

type DeriveResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: SqliteReadFailureReason }

function classifySqliteError(error: unknown): SqliteReadFailureReason {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("database is locked") || message.includes("busy")) return "db_busy"
  if (
    message.includes("database disk image is malformed") ||
    message.includes("not a database") ||
    message.includes("corrupt")
  ) {
    return "db_corrupt"
  }
  if (message.includes("unable to open database file") || message.includes("cannot open")) {
    return "db_unopenable"
  }
  return "db_query_failed"
}

function withReadonlyDb<T>(sqlitePath: string, fn: (db: Database) => T): DeriveResult<T> {
  let db: Database | null = null
  try {
    db = new Database(sqlitePath, { readonly: true })
    return { ok: true, value: fn(db) }
  } catch (error) {
    return { ok: false, reason: classifySqliteError(error) }
  } finally {
    try {
      db?.close()
    } catch {
    }
  }
}

function normalizePath(dir: string): string {
  const abs = path.resolve(dir)
  const real = realpathSafe(abs) ?? abs
  return path.normalize(real)
}

const WINDOW_MS = 300_000
const BUCKET_MS = 2_000
const BUCKETS = Math.floor(WINDOW_MS / BUCKET_MS)

function zeroBuckets(): number[] {
  return Array.from({ length: BUCKETS }, () => 0)
}

export function derivePerSessionTimeSeries(opts: {
  sqlitePath: string
  projectRoot: string
  boulderSessionIds?: string[]
  nowMs?: number
}): DeriveResult<SessionTimeSeriesPayload> {
  const nowMs = opts.nowMs ?? Date.now()
  const anchorMs = Math.floor(nowMs / BUCKET_MS) * BUCKET_MS
  const startMs = anchorMs - WINDOW_MS + BUCKET_MS

  const directoryNeedle = normalizePath(opts.projectRoot)
  const boulderSet = new Set(opts.boulderSessionIds ?? [])

  const result = withReadonlyDb(opts.sqlitePath, (db) => {
    // Step 1: Get all sessions matching this project directory.
    // We query ALL sessions (main + child) whose directory matches the project root.
    const sessionRows = db
      .query("SELECT id, title, directory FROM session WHERE directory IS NOT NULL")
      .all() as Array<{ id: unknown; title: unknown; directory: unknown }>

    // Filter sessions by normalized directory match (same logic as readMainSessionMetasSqlite).
    const matchedSessions = new Map<string, { title: string }>()
    for (const row of sessionRows) {
      if (typeof row.id !== "string" || typeof row.directory !== "string") continue
      if (normalizePath(row.directory) !== directoryNeedle) continue
      const title = typeof row.title === "string" ? row.title : row.id
      matchedSessions.set(row.id, { title })
    }

    if (matchedSessions.size === 0) {
      return { sessions: [] as SessionTimeSeriesEntry[] }
    }

    // Step 2: Get messages with tool parts in the time window for matched sessions.
    // We query messages in the window, then count tool parts per message.
    const sessionIds = [...matchedSessions.keys()]
    const placeholders = sessionIds.map(() => "?").join(",")

    // Query messages within the time window for our sessions
    const messageRows = db
      .query(
        `SELECT m.id, m.session_id, m.time_created
         FROM message m
         WHERE m.session_id IN (${placeholders})
           AND m.time_created >= ?
           AND m.time_created < ?
         ORDER BY m.time_created DESC`
      )
      .all(...sessionIds, startMs, anchorMs) as Array<{
      id: unknown
      session_id: unknown
      time_created: unknown
    }>

    if (messageRows.length === 0) {
      return { sessions: [] as SessionTimeSeriesEntry[] }
    }

    // Step 3: Get tool parts for these messages to count tool calls.
    const validMessages: Array<{ id: string; sessionId: string; createdAt: number }> = []
    for (const row of messageRows) {
      if (typeof row.id !== "string" || typeof row.session_id !== "string") continue
      const createdAt = typeof row.time_created === "number" ? row.time_created : null
      if (createdAt === null) continue
      validMessages.push({ id: row.id, sessionId: row.session_id, createdAt })
    }

    if (validMessages.length === 0) {
      return { sessions: [] as SessionTimeSeriesEntry[] }
    }

    const messageIds = validMessages.map((m) => m.id)
    const msgPlaceholders = messageIds.map(() => "?").join(",")

    // Count tool parts per message (only parts with type='tool' in their data JSON)
    const partRows = db
      .query(
        `SELECT message_id, data FROM part WHERE message_id IN (${msgPlaceholders})`
      )
      .all(...messageIds) as Array<{ message_id: unknown; data: unknown }>

    // Count tool parts per message
    const toolCountByMessage = new Map<string, number>()
    for (const row of partRows) {
      if (typeof row.message_id !== "string" || typeof row.data !== "string") continue
      let parsed: unknown
      try {
        parsed = JSON.parse(row.data)
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== "object") continue
      if ((parsed as Record<string, unknown>).type !== "tool") continue
      toolCountByMessage.set(row.message_id, (toolCountByMessage.get(row.message_id) ?? 0) + 1)
    }

    // Step 4: Bucket tool calls per session.
    const sessionBuckets = new Map<string, number[]>()
    for (const msg of validMessages) {
      const toolCount = toolCountByMessage.get(msg.id) ?? 0
      if (toolCount <= 0) continue

      const bucketIndex = Math.floor((msg.createdAt - startMs) / BUCKET_MS)
      if (bucketIndex < 0 || bucketIndex >= BUCKETS) continue

      let values = sessionBuckets.get(msg.sessionId)
      if (!values) {
        values = zeroBuckets()
        sessionBuckets.set(msg.sessionId, values)
      }
      values[bucketIndex] += toolCount
    }

    // Step 5: Build session entries.
    const sessions: SessionTimeSeriesEntry[] = []
    for (const [sessionId, values] of sessionBuckets) {
      const meta = matchedSessions.get(sessionId)
      const sessionLabel = meta?.title ?? sessionId
      const isBackground = boulderSet.size > 0 ? !boulderSet.has(sessionId) : false
      sessions.push({ sessionId, sessionLabel, isBackground, values })
    }

    return { sessions }
  })

  if (!result.ok) return result

  return {
    ok: true,
    value: {
      windowMs: WINDOW_MS,
      bucketMs: BUCKET_MS,
      buckets: BUCKETS,
      anchorMs,
      serverNowMs: nowMs,
      sessions: result.value.sessions,
    },
  }
}
