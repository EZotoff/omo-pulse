import { TASK_TOOL_NAMES } from "./tool-names"

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

export function resolveLastUpdatedTime(primary: number | null, fallback: number | null): number | null {
  if (typeof primary === "number" && Number.isFinite(primary) && primary > 0) return primary
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) return fallback
  return null
}

export function shouldSuppressStaleToolActivity(toolName: string, hasFreshActivity: boolean): boolean {
  return !hasFreshActivity && TASK_TOOL_NAMES.has(toolName)
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
