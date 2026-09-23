import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRealtimeBus } from "../ingest/realtime-types"
import type { OpenCodeEvent } from "../ingest/realtime-types"

const { listSources } = vi.hoisted(() => ({ listSources: vi.fn(() => []) }))
vi.mock("../ingest/sources-registry", () => ({ listSources, getSourceById: vi.fn(() => null) }))

import { createMultiProjectService } from "../server/multi-project"
import { createDashboardStore } from "../server/dashboard"

const storageBackend = { kind: "files", dataDir: "/tmp", storageRoot: "/tmp/storage" } as const

function fixtureEvent(kind: string): OpenCodeEvent {
  const lines = readFileSync(new URL("./fixtures/opencode-events/real-sample.jsonl", import.meta.url), "utf8").split("\n")
  const line = lines.find((entry) => entry.includes(`"type":"${kind}"`))
  if (!line) throw new Error(`Fixture event missing: ${kind}`)
  const envelope: unknown = JSON.parse(line.slice("data:".length))
  if (envelope === null || typeof envelope !== "object" || !("payload" in envelope)) throw new Error("Invalid fixture envelope")
  const payload = envelope.payload
  if (payload === null || typeof payload !== "object" || !("type" in payload) || typeof payload.type !== "string") throw new Error("Invalid fixture payload")
  return { kind: payload.type, ts: 1 }
}

const sessionEvent = fixtureEvent("session.updated")

describe("multi-project realtime invalidation", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); listSources.mockClear() })
  afterEach(() => { vi.useRealTimers() })

  it("forces a fresh DashboardStore snapshot without replacing the store", () => {
    const store = createDashboardStore({ projectRoot: "/tmp/opencode-sse-missing-project", storageRoot: "/tmp/opencode-sse-missing-storage", storageBackend, pollIntervalMs: 30_000 })
    const cached = store.getSnapshot()
    expect(store.getSnapshot()).toBe(cached)

    store.clearCache()

    expect(store.getSnapshot()).not.toBe(cached)
  })

  it("coalesces ten relevant events into one invalidation per debounce window", async () => {
    const realtimeBus = createRealtimeBus()
    const published: OpenCodeEvent[] = []
    realtimeBus.subscribe((event) => published.push(event))
    const service = createMultiProjectService({ storageRoot: "/tmp/storage", storageBackend, realtimeBus, realtimeDebounceMs: 300 })
    await service.getMultiProjectPayload()
    expect(listSources).toHaveBeenCalledTimes(1)

    for (let index = 0; index < 10; index++) service.onRealtimeEvent(sessionEvent)
    await service.getMultiProjectPayload()
    expect(listSources).toHaveBeenCalledTimes(1)
    expect(published).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    await service.getMultiProjectPayload()
    expect(listSources).toHaveBeenCalledTimes(2)
    expect(published).toHaveLength(1)

    service.onRealtimeEvent(sessionEvent)
    await vi.advanceTimersByTimeAsync(300)
    await service.getMultiProjectPayload()
    expect(listSources).toHaveBeenCalledTimes(3)
    expect(published).toHaveLength(2)
  })

  it("ignores irrelevant deltas and keeps the TTL fallback active", async () => {
    const service = createMultiProjectService({ storageRoot: "/tmp/storage", storageBackend, realtimeDebounceMs: 300 })
    await service.getMultiProjectPayload()

    service.onRealtimeEvent(fixtureEvent("message.part.delta"))
    await vi.advanceTimersByTimeAsync(301)
    await service.getMultiProjectPayload()
    expect(listSources).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(8_000)
    await service.getMultiProjectPayload()
    expect(listSources).toHaveBeenCalledTimes(2)
  })
})
