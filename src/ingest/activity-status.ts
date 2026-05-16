import { isPendingQuestionTool, QUESTION_TOOL_NAMES, TASK_TOOL_NAMES } from "./tool-names"

export const ACTIVE_STALE_MS = 10 * 60_000
export const ACTIVE_BUSY_WINDOW_MS = 60_000
export const ERROR_STALE_MS = 60_000  // Errors become stale after 1 minute
export const BACKGROUND_RUNNING_WINDOW_MS = 15_000
export const BACKGROUND_QUEUE_STALE_MS = 15 * 60_000

export function hasFreshMainSessionActivity(lastUpdated: number | null, nowMs: number): boolean {
  return typeof lastUpdated === "number" && nowMs - lastUpdated <= ACTIVE_STALE_MS
}

export function shouldKeepQueuedBackgroundTaskActive(startedAt: number, nowMs: number): boolean {
  return nowMs - startedAt <= BACKGROUND_QUEUE_STALE_MS
}

/**
 * Returns true if a question tool with 'running' status started too long ago
 * to be considered active. Pending questions are never stale (they wait in queue).
 * Fresh running questions (within ACTIVE_STALE_MS) are preserved.
 */
export function isStaleQuestionTool(
  toolName: string,
  status: string,
  toolStartedAt: number | null,
  nowMs: number,
): boolean {
  if (status !== "running") return false
  if (!QUESTION_TOOL_NAMES.has(toolName)) return false
  if (typeof toolStartedAt !== "number" || !Number.isFinite(toolStartedAt)) return false
  return nowMs - toolStartedAt > ACTIVE_STALE_MS
}

export function readToolStartTime(toolPart: unknown): number | null {
  if (!toolPart || typeof toolPart !== "object") return null
  const state = (toolPart as Record<string, unknown>).state
  if (!state || typeof state !== "object") return null
  const time = (state as Record<string, unknown>).time
  if (!time || typeof time !== "object") return null
  const start = (time as Record<string, unknown>).start
  return typeof start === "number" && Number.isFinite(start) ? start : null
}

export function resolveLastUpdatedTime(primary: number | null, fallback: number | null): number | null {
  if (typeof primary === "number" && Number.isFinite(primary) && primary > 0) return primary
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return fallback
  return null
}

export function shouldSuppressStaleToolActivity(toolName: string, status: string, hasFreshActivity: boolean): boolean {
  if (hasFreshActivity) return false
  if (isPendingQuestionTool(toolName, status)) return false
  return TASK_TOOL_NAMES.has(toolName) || QUESTION_TOOL_NAMES.has(toolName)
}

export function getTerminalErrorMessageCreatedAt<T>(opts: {
  orderedMessages: readonly T[]
  getCreatedAt: (message: T) => number | null
  hasErrorPart: (message: T) => boolean
}): number | null {
  for (const message of opts.orderedMessages) {
    const createdAt = opts.getCreatedAt(message)
    if (typeof createdAt !== "number") continue
    return opts.hasErrorPart(message) ? createdAt : null
  }
  return null
}
