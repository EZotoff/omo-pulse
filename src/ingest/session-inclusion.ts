import * as path from "node:path"
import { Database } from "bun:sqlite"
import { realpathSafe } from "./paths"
import { ACTIVE_BUSY_WINDOW_MS, ERROR_STALE_MS } from "./activity-status"
import type { SessionMetadata } from "./session"
import { QUESTION_TOOL_NAMES } from "./tool-names"

// Severity levels for attention-first ordering
const STATUS_SEVERITY: Record<string, number> = {
  error: 0,
  question: 1,
  running_tool: 2,
  thinking: 3,
  busy: 4,
  idle: 5,
  unknown: 6,
}

function isAttentionStatus(status: string): boolean {
  return status === "question" || status === "error"
}

function normalizePath(dir: string): string {
  const abs = path.resolve(dir)
  const real = realpathSafe(abs) ?? abs
  return path.normalize(real)
}

/**
 * Derive session status from SQLite message and part records.
 * Private helper: used only for ordering sessions within findIncludedSessionsSqlite.
 * Mirrors status derivation logic from sqlite-derive.ts with minimal scope.
 * Critically: distinguishes "busy" vs "idle" using ACTIVE_BUSY_WINDOW_MS threshold.
 */
function deriveSessionStatus(db: Database, session: SessionMetadata, nowMs: number): string {
  try {
    const activeParts = db
      .query(
        `SELECT json_extract(data, '$.tool') as tool
         FROM part 
         WHERE session_id = ? AND json_extract(data, '$.state.status') IN ('pending', 'running')
         ORDER BY time_created DESC LIMIT 1`
      )
      .all(session.id) as Array<{ tool: string }>

    if (activeParts.length > 0) {
      if (QUESTION_TOOL_NAMES.has(activeParts[0].tool)) {
        return "question"
      }
      return "running_tool"
    }

    const lastTerminal = db
      .query(
        `SELECT time_created, json_extract(data, '$.state.status') as status
         FROM part 
         WHERE session_id = ? AND json_extract(data, '$.state.status') IN ('error', 'completed')
         ORDER BY time_created DESC LIMIT 1`
      )
      .all(session.id) as Array<{ time_created: number; status: string }>

    const lastUpdated = session.time.updated ?? session.time.created ?? 0
    const ageMs = nowMs - lastUpdated
    const isStaleActivity = ageMs > ACTIVE_BUSY_WINDOW_MS
    const latestTerminalStatus = lastTerminal[0]?.status
    const latestTerminalAt = lastTerminal[0]?.time_created
    const isTerminalErrorStale = typeof latestTerminalAt !== "number" || (nowMs - latestTerminalAt > ERROR_STALE_MS)

    if (!isStaleActivity && latestTerminalStatus === "error" && !isTerminalErrorStale) {
      return "error"
    }

    const recentMessages = db
      .query(
        `SELECT json_extract(data, '$.time.completed') as time_completed
         FROM message 
         WHERE session_id = ? AND json_extract(data, '$.role') = 'assistant'
         ORDER BY time_created DESC LIMIT 1`
      )
      .all(session.id) as Array<{ time_completed: number | null }>

    if (recentMessages.length > 0 && recentMessages[0].time_completed === null) {
      return "thinking"
    }

    return ageMs <= ACTIVE_BUSY_WINDOW_MS ? "busy" : "idle"
  } catch {
    return "unknown"
  }
}

export function isSessionIncluded(
  session: SessionMetadata,
  idleWindowMs: number,
  nowMs: number
): boolean {
  if (session.parentID) return false

  const lastUpdated = session.time.updated ?? session.time.created ?? 0
  const ageMs = nowMs - lastUpdated

  return ageMs <= idleWindowMs
}

export function findIncludedSessionsSqlite(
  db: Database,
  projectRoot: string,
  idleWindowMs: number
): SessionMetadata[] {
  const nowMs = Date.now()
  const directoryNeedle = normalizePath(projectRoot)

  try {
    const sessionRows = db
      .query("SELECT id, title, directory, parent_id, time_created, time_updated FROM session WHERE directory IS NOT NULL")
      .all() as Array<{
      id: unknown
      title: unknown
      directory: unknown
      parent_id: unknown
      time_created: unknown
      time_updated: unknown
    }>

    const sessions: SessionMetadata[] = []
    const statusCache = new Map<string, string>()
    for (const row of sessionRows) {
      if (typeof row.id !== "string" || typeof row.directory !== "string") continue

      if (normalizePath(row.directory) !== directoryNeedle) continue

      const sessionId = row.id
      const title = typeof row.title === "string" ? row.title : sessionId
      const parentID = typeof row.parent_id === "string" ? row.parent_id : undefined
      const timeCreated = typeof row.time_created === "number" ? row.time_created : 0
      const timeUpdated = typeof row.time_updated === "number" ? row.time_updated : timeCreated

      const meta: SessionMetadata = {
        id: sessionId,
        projectID: "",
        directory: row.directory as string,
        title,
        parentID,
        time: { created: timeCreated, updated: timeUpdated },
      }

      const status = deriveSessionStatus(db, meta, nowMs)
      if (
        isSessionIncluded(meta, idleWindowMs, nowMs) ||
        isAttentionStatus(status)
      ) {
        sessions.push(meta)
        statusCache.set(meta.id, status)
      }
    }

    // Severity-first ordering: error (0) > question (1) > running_tool (2) > thinking (3) > busy (4) > idle (5) > unknown (6)
    // Then recency: most recent activity first (time.updated DESC)
    // Finally stable tie-breaker: id ascending
    sessions.sort((a, b) => {
      const aStatus = statusCache.get(a.id) ?? "unknown"
      const bStatus = statusCache.get(b.id) ?? "unknown"

      const aSeverity = STATUS_SEVERITY[aStatus] ?? 6
      const bSeverity = STATUS_SEVERITY[bStatus] ?? 6

      // Primary: severity (lower is more severe/attention-needed)
      if (aSeverity !== bSeverity) return aSeverity - bSeverity

      // Secondary: recency (most recent first)
      const aTime = a.time.updated ?? a.time.created ?? 0
      const bTime = b.time.updated ?? b.time.created ?? 0
      if (bTime !== aTime) return bTime - aTime

      // Tie-breaker: id ascending for deterministic ordering
      return a.id.localeCompare(b.id)
    })

    return sessions
  } catch {
    return []
  }
}
