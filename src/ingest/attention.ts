/**
 * Attention ranking — per project, the "next session requiring my attention".
 *
 * Shared plumbing for the focus remote window and future consumers
 * (Stream Deck keys, notification actions). Pure functions only.
 *
 * Ranking (most urgent first):
 *   1. question pending
 *   2. error / danger
 *   3. finished, awaiting user input (idle)
 *   4. plan complete
 *   5. working (busy / thinking / tool / bg agent)
 *
 * "unknown" is a disconnected/error-derivation state — not actionable,
 * so it never surfaces as attention.
 */
import type {
  AttentionPayload,
  AttentionProject,
  AttentionSession,
  AttentionState,
  ProjectSnapshot,
  SessionStatus,
} from "../types"

export type { AttentionPayload, AttentionProject, AttentionSession, AttentionState }

export const ATTENTION_RANK: Readonly<Record<AttentionState, number>> = {
  question: 0,
  error: 1,
  awaiting_input: 2,
  plan_complete: 3,
  working: 4,
}

const STATUS_TO_ATTENTION: Partial<Record<SessionStatus, AttentionState>> = {
  question: "question",
  error: "error",
  idle: "awaiting_input",
  plan_complete: "plan_complete",
  busy: "working",
  thinking: "working",
  running_tool: "working",
  bg_agent: "working",
  // "unknown" → not actionable, excluded
}

export function attentionStateForStatus(status: SessionStatus): AttentionState | null {
  return STATUS_TO_ATTENTION[status] ?? null
}


function toAttentionSession(
  sessionId: string,
  sessionLabel: string,
  state: AttentionState,
  lastUpdatedMs: number,
  serverNowMs: number,
): AttentionSession {
  return {
    sessionId,
    sessionLabel,
    state,
    waitMs: Math.max(0, serverNowMs - lastUpdatedMs),
  }
}

function compareSessions(a: AttentionSession, b: AttentionSession): number {
  return ATTENTION_RANK[a.state] - ATTENTION_RANK[b.state] || a.waitMs - b.waitMs
}

/** Derive one project's attention summary from its dashboard snapshot. */
export function buildAttentionProject(
  snapshot: ProjectSnapshot,
  serverNowMs: number,
): AttentionProject {
  let next: AttentionSession | null = null
  let queue = 0
  let busySessions = 0

  for (const session of snapshot.sessions) {
    const state = attentionStateForStatus(session.status)
    if (!state) continue
    const entry = toAttentionSession(
      session.sessionId,
      session.sessionLabel,
      state,
      session.lastUpdatedMs,
      serverNowMs,
    )
    if (state === "working") {
      busySessions += 1
      continue
    }
    if (!next || compareSessions(entry, next) < 0) {
      if (next) queue += 1
      next = entry
    } else {
      queue += 1
    }
  }

  return {
    sourceId: snapshot.sourceId,
    label: snapshot.label,
    projectRoot: snapshot.projectRoot,
    next,
    queue,
    busySessions,
    totalSessions: snapshot.sessions.length,
  }
}

function compareProjects(a: AttentionProject, b: AttentionProject): number {
  if (!a.next && !b.next) return b.busySessions - a.busySessions
  if (!a.next) return 1
  if (!b.next) return -1
  return (
    ATTENTION_RANK[a.next.state] - ATTENTION_RANK[b.next.state] || a.next.waitMs - b.next.waitMs
  )
}

/** Build the full attention payload consumed by GET /api/attention. */
export function buildAttentionPayload(
  projects: ProjectSnapshot[],
  serverNowMs: number,
): AttentionPayload {
  return {
    projects: projects
      .map((snapshot) => buildAttentionProject(snapshot, serverNowMs))
      .sort(compareProjects),
    serverNowMs,
  }
}
