import { describe, expect, it } from "vitest"

import { buildSessionStatusMap, diffSessionStatuses, shouldPlaySound } from "../ingest/session-diff"
import type { SessionSummary, SoundConfig } from "../types"

const SOUND_CONFIG: SoundConfig = {
  enabled: true,
  volume: 0.8,
  onSessionIdle: true,
  onPlanComplete: true,
  onSessionError: true,
  onQuestion: true,
}

function makeSessionSummary(sessionId: string, status: SessionSummary["status"]): SessionSummary {
  return {
    sessionId,
    sessionLabel: sessionId,
    agent: "build",
    status,
    currentModel: "gpt-5.4",
    currentTool: status === "question" ? "question" : "bash",
    lastUpdated: "2026-05-10T00:00:00.000Z",
    lastUpdatedMs: 1_000_000,
  }
}

describe("session-diff question sound", () => {
  it("plays the question sound when a session transitions into question status", () => {
    const previous = buildSessionStatusMap([
      makeSessionSummary("ses-main", "running_tool"),
    ])
    const current = buildSessionStatusMap([
      makeSessionSummary("ses-main", "question"),
    ])

    const diff = diffSessionStatuses(previous, current)
    const playback = shouldPlaySound(diff, SOUND_CONFIG)

    expect(playback.playQuestion).toBe(true)
    expect(playback.playAttention).toBe(false)
    expect(playback.playWaiting).toBe(false)
    expect(playback.playAllClear).toBe(false)
  })
})
