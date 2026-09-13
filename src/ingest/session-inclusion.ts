import type { Database } from "bun:sqlite"
import * as path from "node:path"
import { ACTIVE_BUSY_WINDOW_MS, hasFreshMainSessionActivity, isStaleQuestionTool, shouldSuppressStaleToolActivity } from "./activity-status"
import { realpathSafe } from "./paths"
import type { SessionMetadata } from "./session"
import { isActiveQuestionTool } from "./tool-names"

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

function deriveSessionStatusFromMaps(
  sessionId: string,
  lastUpdated: number,
  nowMs: number,
  activePartsMap: Map<string, Array<{ tool: string; status: string; startedAt: number | null }>>,
  assistantMsgsMap: Map<string, Array<{ time_completed: number | null }>>,
): string {
  const activeParts = activePartsMap.get(sessionId) ?? []
  const ageMs = nowMs - lastUpdated
  const hasFreshActivity = hasFreshMainSessionActivity(lastUpdated, nowMs)

  for (const activePart of activeParts) {
    if (!isStaleQuestionTool(activePart.tool, activePart.status, activePart.startedAt, nowMs)) {
      if (isActiveQuestionTool(activePart.tool, activePart.status)) return "question"
      if (!shouldSuppressStaleToolActivity(activePart.tool, activePart.status, hasFreshActivity)) return "running_tool"
    }
  }

  const recentMessages = assistantMsgsMap.get(sessionId) ?? []

  if (recentMessages.length > 0 && recentMessages[0].time_completed === null) {
    return "thinking"
  }

  return ageMs <= ACTIVE_BUSY_WINDOW_MS ? "busy" : "idle"
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

    const candidates: SessionMetadata[] = []
    for (const row of sessionRows) {
      if (typeof row.id !== "string" || typeof row.directory !== "string") continue

      if (normalizePath(row.directory) !== directoryNeedle) continue

      const sessionId = row.id
      const title = typeof row.title === "string" ? row.title : sessionId
      const parentID = typeof row.parent_id === "string" ? row.parent_id : undefined
      const timeCreated = typeof row.time_created === "number" ? row.time_created : 0
      const timeUpdated = typeof row.time_updated === "number" ? row.time_updated : timeCreated

      candidates.push({
        id: sessionId,
        projectID: "",
        directory: row.directory as string,
        title,
        parentID,
        time: { created: timeCreated, updated: timeUpdated },
      })
    }

    if (candidates.length === 0) return []

    const candidateIds = candidates.map(s => s.id)

    // Batch query 1: active parts (pending/running)
    const activePartsMap = new Map<string, Array<{ tool: string; status: string; startedAt: number | null }>>()
    const placeholders = candidateIds.map(() => "?").join(",")
    const activeRows = db
      .query(
        `SELECT session_id, json_extract(data, '$.tool') as tool,
                json_extract(data, '$.state.status') as status,
                json_extract(data, '$.state.time.start') as started_at,
                time_created
         FROM part 
         WHERE session_id IN (${placeholders}) AND json_extract(data, '$.state.status') IN ('pending', 'running')
         ORDER BY time_created DESC`
      )
      .all(...candidateIds) as Array<{ session_id: string; tool: string; status: string; started_at: number | null; time_created: number | null }>
    for (const row of activeRows) {
      const startedAt = row.started_at ?? row.time_created ?? null
      const sessionActiveParts = activePartsMap.get(row.session_id)
      if (!sessionActiveParts) {
        activePartsMap.set(row.session_id, [{ tool: row.tool, status: row.status, startedAt }])
      } else {
        sessionActiveParts.push({ tool: row.tool, status: row.status, startedAt })
      }
    }

    // Batch query 2: recent assistant messages
    const assistantMsgsMap = new Map<string, Array<{ time_completed: number | null }>>()
    const assistantRows = db
      .query(
        `SELECT session_id, json_extract(data, '$.time.completed') as time_completed
         FROM message 
         WHERE session_id IN (${placeholders}) AND json_extract(data, '$.role') = 'assistant'
         ORDER BY time_created DESC`
      )
      .all(...candidateIds) as Array<{ session_id: string; time_completed: number | null }>
    for (const row of assistantRows) {
      const sessionAssistantMsgs = assistantMsgsMap.get(row.session_id)
      if (!sessionAssistantMsgs) {
        assistantMsgsMap.set(row.session_id, [{ time_completed: row.time_completed }])
      } else if (sessionAssistantMsgs.length < 1) {
        sessionAssistantMsgs.push({ time_completed: row.time_completed })
      }
    }

    // Filter + derive status from batched maps
    const sessions: SessionMetadata[] = []
    const statusCache = new Map<string, string>()
    for (const meta of candidates) {
      const lastUpdated = meta.time.updated ?? meta.time.created ?? 0
      const status = deriveSessionStatusFromMaps(
        meta.id, lastUpdated, nowMs,
        activePartsMap, assistantMsgsMap,
      )
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
