import type { SessionStatus, SessionSummary } from "../types"

export const ATTENTION_FIRST_PRIORITY: Record<SessionStatus, number> = {
  error: 0,
  question: 1,
  thinking: 2,
  idle: 3,
  plan_complete: 4,
  busy: 5,
  running_tool: 5,
  bg_agent: 5,
  unknown: 6,
}

export function compareSessionsBySeverity(a: SessionSummary, b: SessionSummary): number {
  const priorityA = ATTENTION_FIRST_PRIORITY[a.status] ?? ATTENTION_FIRST_PRIORITY.unknown
  const priorityB = ATTENTION_FIRST_PRIORITY[b.status] ?? ATTENTION_FIRST_PRIORITY.unknown
  if (priorityA !== priorityB) return priorityA - priorityB
  if (a.lastUpdatedMs !== b.lastUpdatedMs) return b.lastUpdatedMs - a.lastUpdatedMs
  return a.sessionId.localeCompare(b.sessionId)
}

export function computeAggregateStatus(sessions: SessionSummary[]): SessionStatus {
  if (sessions.length === 0) return "unknown"
  return [...sessions].sort(compareSessionsBySeverity)[0]?.status ?? "unknown"
}

export function selectDisplaySession(sessions: SessionSummary[]): SessionSummary | null {
  if (sessions.length === 0) return null
  return [...sessions].sort(compareSessionsBySeverity)[0] ?? null
}
