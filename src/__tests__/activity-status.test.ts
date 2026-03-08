import { describe, expect, it } from "vitest"

import {
  ACTIVE_STALE_MS,
  BACKGROUND_QUEUE_STALE_MS,
  hasFreshMainSessionActivity,
  resolveLastUpdatedTime,
  shouldSuppressStaleToolActivity,
  shouldKeepQueuedBackgroundTaskActive,
} from "../ingest/activity-status"

describe("activity-status helpers", () => {
  it("treats recently updated main sessions as fresh", () => {
    expect(hasFreshMainSessionActivity(1_000, 1_000 + ACTIVE_STALE_MS - 1)).toBe(true)
  })

  it("treats stale main sessions as inactive", () => {
    expect(hasFreshMainSessionActivity(1_000, 1_000 + ACTIVE_STALE_MS + 1)).toBe(false)
  })

  it("treats missing main session activity as inactive", () => {
    expect(hasFreshMainSessionActivity(null, 10_000)).toBe(false)
  })

  it("keeps recently queued background tasks active", () => {
    expect(shouldKeepQueuedBackgroundTaskActive(5_000, 5_000 + BACKGROUND_QUEUE_STALE_MS - 1)).toBe(true)
  })

  it("ages out orphaned queued background tasks", () => {
    expect(shouldKeepQueuedBackgroundTaskActive(5_000, 5_000 + BACKGROUND_QUEUE_STALE_MS + 1)).toBe(false)
  })

  it("prefers primary last-updated timestamp when present", () => {
    expect(resolveLastUpdatedTime(123, 456)).toBe(123)
  })

  it("falls back to session metadata timestamp when primary is missing", () => {
    expect(resolveLastUpdatedTime(null, 456)).toBe(456)
  })

  it("suppresses stale task-tool activity", () => {
    expect(shouldSuppressStaleToolActivity("task", false)).toBe(true)
  })

  it("keeps stale direct tool activity visible", () => {
    expect(shouldSuppressStaleToolActivity("bash", false)).toBe(false)
  })

  it("keeps fresh task-tool activity visible", () => {
    expect(shouldSuppressStaleToolActivity("task", true)).toBe(false)
  })
})
