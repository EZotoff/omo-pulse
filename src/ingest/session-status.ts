import { ACTIVE_BUSY_WINDOW_MS, shouldSuppressStaleToolActivity } from "./activity-status"
import type { MainSessionView } from "./session"
import { isActiveQuestionTool } from "./tool-names"

export type ActiveToolRef = { tool: string; status: string } | null

export type DeriveMainSessionStatusOpts = {
  activeTool: ActiveToolRef
  hasFreshActivity: boolean
  isStaleActivity: boolean
  latestTerminalStatus: "error" | "completed" | null
  latestTerminalAt: number | null
  recentRole: "assistant" | "user" | null
  recentTimeCreated: number | null
  recentTimeCompleted: number | null
  lastUpdated: number | null
  nowMs: number
}

export type DeriveMainSessionStatusResult = {
  status: MainSessionView["status"]
  activeTool: ActiveToolRef
}

/**
 * Pure function: derives session status from pre-computed inputs.
 * Shared between file-based (session.ts) and SQLite (sqlite-derive.ts) paths.
 * Does NOT handle background task promotion — callers do that after.
 */
export function deriveMainSessionStatus(opts: DeriveMainSessionStatusOpts): DeriveMainSessionStatusResult {
  let { activeTool } = opts
  const {
    hasFreshActivity,
    isStaleActivity,
    recentRole,
    recentTimeCreated,
    recentTimeCompleted,
    lastUpdated,
    nowMs,
  } = opts

  let status: MainSessionView["status"] = "unknown"

  if (activeTool?.status === "pending" || activeTool?.status === "running") {
    if (shouldSuppressStaleToolActivity(activeTool.tool, activeTool.status, hasFreshActivity)) {
      activeTool = null
    } else {
      status = isActiveQuestionTool(activeTool.tool, activeTool.status) ? "question" : "running_tool"
    }
  }

  if (
    status === "unknown" &&
    !isStaleActivity &&
    recentRole === "assistant" &&
    typeof recentTimeCreated === "number" &&
    typeof recentTimeCompleted !== "number"
  ) {
    status = "thinking"
  } else if (status === "unknown" && typeof lastUpdated === "number") {
    status = nowMs - lastUpdated <= ACTIVE_BUSY_WINDOW_MS ? "busy" : "idle"
  }

  return { status, activeTool }
}
