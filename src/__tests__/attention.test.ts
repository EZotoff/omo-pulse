import { describe, expect, it } from "vitest"

import {
  ATTENTION_RANK,
  attentionStateForStatus,
  buildAttentionPayload,
  buildAttentionProject,
} from "../ingest/attention"
import type { ProjectSnapshot, SessionStatus, SessionSummary } from "../types"
import { selectAttentionTarget } from "../server/api"

function session(
  sessionId: string,
  status: SessionStatus,
  lastUpdatedMs = 10_000,
  sessionLabel = sessionId,
): SessionSummary {
  return {
    sessionId,
    sessionLabel,
    agent: "build",
    status,
    currentModel: "test-model",
    currentTool: "",
    lastUpdated: new Date(lastUpdatedMs).toISOString(),
    lastUpdatedMs,
  }
}

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    sourceId: "src1",
    label: "Test Project",
    projectRoot: "/tmp/project",
    mainSession: {
      agent: "build",
      currentModel: null,
      currentTool: "",
      lastUpdated: "",
      sessionLabel: "",
      sessionId: null,
      status: "unknown",
    },
    sessions: [],
    aggregateStatus: "unknown",
    planProgress: {
      name: "",
      completed: 0,
      total: 0,
      path: "",
      status: "not started",
      steps: [],
      planStale: false,
      planComplete: false,
    },
    unintiatedPlans: [],
    timeSeries: {
      windowMs: 0,
      bucketMs: 0,
      buckets: 0,
      anchorMs: 0,
      serverNowMs: 0,
      series: [],
    },
    backgroundTasks: [],
    sessionTimeSeries: {
      windowMs: 0,
      bucketMs: 0,
      buckets: 0,
      anchorMs: 0,
      serverNowMs: 0,
      sessions: [],
    },
    lastUpdatedMs: 10_000,
    ...overrides,
  }
}

describe("attentionStateForStatus", () => {
  it("maps each actionable status to its attention state", () => {
    expect(attentionStateForStatus("question")).toBe("question")
    expect(attentionStateForStatus("error")).toBe("error")
    expect(attentionStateForStatus("idle")).toBe("awaiting_input")
    expect(attentionStateForStatus("plan_complete")).toBe("plan_complete")
    expect(attentionStateForStatus("busy")).toBe("working")
    expect(attentionStateForStatus("thinking")).toBe("working")
    expect(attentionStateForStatus("running_tool")).toBe("working")
    expect(attentionStateForStatus("bg_agent")).toBe("working")
  })

  it("excludes unknown as not actionable", () => {
    expect(attentionStateForStatus("unknown")).toBeNull()
  })
})

describe("buildAttentionProject", () => {
  it("picks the highest-ranked session as next and counts the queue", () => {
    const result = buildAttentionProject(
      snapshot({
        sessions: [
          session("s-idle", "idle", 5_000),
          session("s-question", "question", 9_000),
          session("s-error", "error", 1_000),
          session("s-busy", "busy", 9_500),
        ],
      }),
      10_000,
    )
    expect(result.next?.sessionId).toBe("s-question")
    expect(result.next?.state).toBe("question")
    expect(result.queue).toBe(2)
    expect(result.busySessions).toBe(1)
    expect(result.totalSessions).toBe(4)
  })

  it("breaks rank ties by freshest event first", () => {
    const result = buildAttentionProject(
      snapshot({
        sessions: [session("stale", "idle", 1_000), session("fresh", "idle", 9_000)],
      }),
      10_000,
    )
    expect(result.next?.sessionId).toBe("fresh")
    expect(result.queue).toBe(1)
  })

  it("reports waitMs relative to serverNowMs, clamped at zero", () => {
    const result = buildAttentionProject(
      snapshot({ sessions: [session("s1", "question", 8_000)] }),
      10_000,
    )
    expect(result.next?.waitMs).toBe(2_000)

    const future = buildAttentionProject(
      snapshot({ sessions: [session("s1", "question", 99_000)] }),
      10_000,
    )
    expect(future.next?.waitMs).toBe(0)
  })

  it("returns null next with busy count when all sessions are working", () => {
    const result = buildAttentionProject(
      snapshot({
        sessions: [session("s1", "busy"), session("s2", "thinking"), session("s3", "running_tool")],
      }),
      10_000,
    )
    expect(result.next).toBeNull()
    expect(result.queue).toBe(0)
    expect(result.busySessions).toBe(3)
  })

  it("handles empty session lists", () => {
    const result = buildAttentionProject(snapshot(), 10_000)
    expect(result.next).toBeNull()
    expect(result.busySessions).toBe(0)
    expect(result.totalSessions).toBe(0)
  })
})

describe("buildAttentionPayload", () => {
  it("sorts projects by next-attention rank, idle projects last", () => {
    const payload = buildAttentionPayload(
      [
        snapshot({
          sourceId: "busy-only",
          label: "Busy Only",
          sessions: [session("b1", "busy")],
        }),
        snapshot({
          sourceId: "error-proj",
          label: "Error Proj",
          sessions: [session("e1", "error", 4_000)],
        }),
        snapshot({
          sourceId: "question-proj",
          label: "Question Proj",
          sessions: [session("q1", "question", 6_000)],
        }),
      ],
      10_000,
    )
    expect(payload.projects.map((p) => p.sourceId)).toEqual([
      "question-proj",
      "error-proj",
      "busy-only",
    ])
  })

  it("breaks project rank ties by freshest event first", () => {
    const payload = buildAttentionPayload(
      [
        snapshot({
          sourceId: "recent",
          sessions: [session("r1", "idle", 9_000)],
        }),
        snapshot({
          sourceId: "stale",
          sessions: [session("s1", "idle", 1_000)],
        }),
      ],
      10_000,
    )
    expect(payload.projects.map((p) => p.sourceId)).toEqual(["recent", "stale"])
  })

  it("keeps the shared rank table ordered most-urgent first", () => {
    const entries = Object.entries(ATTENTION_RANK) as [string, number][]
    const ranks = entries.map(([, rank]) => rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})

describe("selectAttentionTarget", () => {
  it("skips across projects in ranked session order", () => {
    // Given
    const attention = buildAttentionPayload(
      [
        snapshot({
          sourceId: "lower-ranked",
          projectRoot: "/projects/lower",
          sessions: [session("error", "error")],
        }),
        snapshot({
          sourceId: "top-ranked",
          projectRoot: "/projects/top",
          sessions: [session("question", "question"), session("idle", "idle")],
        }),
      ],
      10_000,
    )

    // When
    const target = selectAttentionTarget(attention.projects, 2)

    // Then
    expect(target).toEqual({ projectRoot: "/projects/lower", sessionId: "error" })
  })

  it("returns no target when nothing is pending", () => {
    // Given
    const attention = buildAttentionPayload(
      [snapshot({ sessions: [session("working", "busy")] })],
      10_000,
    )

    // When
    const target = selectAttentionTarget(attention.projects, 0)

    // Then
    expect(target).toBeNull()
  })
})
