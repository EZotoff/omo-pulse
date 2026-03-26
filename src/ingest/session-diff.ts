import type { PlanStatus, SessionStatus, SessionSummary, SoundConfig } from "../types"

export type SessionStatusMap = Map<string, SessionStatus>

export type SessionStatusChange = {
  from: SessionStatus
  to: SessionStatus
}

export type SessionStatusDiff = {
  newSessions: SessionStatusMap
  changedSessions: Map<string, SessionStatusChange>
  removedSessions: Set<string>
  planCompleted: boolean
}

export type SessionDiffOptions = {
  prevPlanStatus?: PlanStatus
  currPlanStatus?: PlanStatus
}

export type SoundPlaybackDecision = {
  playWaiting: boolean
  playAllClear: boolean
  playAttention: boolean
  playQuestion: boolean
}

const ACTIVE_SESSION_STATUSES = new Set<SessionStatus>(["busy", "running_tool", "thinking"])

function hasStatus(map: SessionStatusMap | Map<string, SessionStatusChange>, target: SessionStatus): boolean {
  for (const value of map.values()) {
    if (typeof value === "string") {
      if (value === target) return true
      continue
    }

    if (value.to === target) return true
  }

  return false
}

function hasIdleFromActive(changedSessions: Map<string, SessionStatusChange>): boolean {
  for (const change of changedSessions.values()) {
    if (change.to === "idle" && ACTIVE_SESSION_STATUSES.has(change.from)) {
      return true
    }
  }

  return false
}

export function buildSessionStatusMap(sessions: SessionSummary[]): SessionStatusMap {
  const sessionStatusMap: SessionStatusMap = new Map()

  for (const session of sessions) {
    sessionStatusMap.set(session.sessionId, session.status)
  }

  return sessionStatusMap
}

export function diffSessionStatuses(
  prev: SessionStatusMap,
  curr: SessionStatusMap,
  options: SessionDiffOptions = {},
): SessionStatusDiff {
  const newSessions: SessionStatusMap = new Map()
  const changedSessions = new Map<string, SessionStatusChange>()
  const removedSessions = new Set<string>()

  for (const [sessionId, status] of curr) {
    const prevStatus = prev.get(sessionId)

    if (prevStatus === undefined) {
      newSessions.set(sessionId, status)
      continue
    }

    if (prevStatus !== status) {
      changedSessions.set(sessionId, { from: prevStatus, to: status })
    }
  }

  for (const sessionId of prev.keys()) {
    if (!curr.has(sessionId)) {
      removedSessions.add(sessionId)
    }
  }

  return {
    newSessions,
    changedSessions,
    removedSessions,
    planCompleted: options.prevPlanStatus === "in progress" && options.currPlanStatus === "complete",
  }
}

export function shouldPlaySound(diff: SessionStatusDiff, config: SoundConfig): SoundPlaybackDecision {
  if (!config.enabled) {
    return {
      playWaiting: false,
      playAllClear: false,
      playAttention: false,
      playQuestion: false,
    }
  }

  const playQuestion = config.onQuestion
    ? hasStatus(diff.newSessions, "question") || hasStatus(diff.changedSessions, "question")
    : false

  const playAttention = config.onSessionError
    ? hasStatus(diff.newSessions, "error") || hasStatus(diff.changedSessions, "error")
    : false

  const playWaiting = config.onSessionIdle ? hasIdleFromActive(diff.changedSessions) : false

  const playAllClear = config.onPlanComplete ? diff.planCompleted : false

  return {
    playWaiting,
    playAllClear,
    playAttention,
    playQuestion,
  }
}
