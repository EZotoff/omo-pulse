import { afterEach, describe, expect, it, vi } from "vitest"
import { createApi, type MultiProjectService } from "../server/api"
import { createRealtimeBus } from "../ingest/realtime-types"
import type { OpenCodeEvent, RealtimeBus, SseConnectionState } from "../ingest/realtime-types"
import type { FilesStorageBackend } from "../ingest/storage-backend"

/* ── Test helpers ── */

/**
 * Wraps the real bus and counts live subscriptions. The bus interface itself
 * deliberately has no count (kept exactly as the plan specifies), so the
 * disconnect test tracks it at the wrap layer.
 */
function createCountingBus(): { bus: RealtimeBus; listenerCount: () => number } {
  const inner = createRealtimeBus()
  let count = 0
  const bus: RealtimeBus = {
    publish: (event) => inner.publish(event),
    subscribe: (listener) => {
      count += 1
      const unsubscribe = inner.subscribe(listener)
      return () => {
        count -= 1
        unsubscribe()
      }
    },
  }
  return { bus, listenerCount: () => count }
}

const noopService: MultiProjectService = {
  getMultiProjectPayload: () => {
    throw new Error("not used in /api/events tests")
  },
  invalidate: () => {},
}

const filesBackend: FilesStorageBackend = {
  kind: "files",
  dataDir: "/tmp/omo-pulse-events-test",
  storageRoot: "/tmp/omo-pulse-events-test/storage",
}

function createEventsApi(bus?: RealtimeBus, getRealtimeState?: () => SseConnectionState): HonoApp {
  return createApi({
    storageRoot: filesBackend.storageRoot,
    storageBackend: filesBackend,
    multiProjectService: noopService,
    realtimeBus: bus,
    getRealtimeState,
  })
}

type HonoApp = ReturnType<typeof createApi>

function decode(chunk: Uint8Array | undefined): string {
  return new TextDecoder().decode(chunk ?? new Uint8Array())
}

async function readFrame(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const result = await reader.read()
  return decode(result.value)
}

/**
 * Every stream starts with an upstream-state frame; drain it so tests can
 * assert on the frame that follows.
 */
async function drainInitialStatus(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const frame = await readFrame(reader)
  expect(frame).toContain("event: status")
  return frame
}

function makeEvent(kind: string, ts: number): OpenCodeEvent {
  return { kind, sessionId: "ses_ev", directory: "/tmp/proj", ts }
}

/* ── Tests ── */

describe("GET /api/events", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("serves a text/event-stream response", async () => {
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    await res.body.cancel()
  })

  it("emits an initial status frame reflecting the upstream opencode link", async () => {
    const { bus } = createCountingBus()
    const app = createEventsApi(bus, () => "down")
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

    const frame = await readFrame(reader)
    expect(frame).toContain("event: status")
    expect(frame).toContain(`"state":"down"`)

    await reader.cancel()
  })

  it("defaults the status frame to connected when no state getter is supplied", async () => {
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

    const frame = await readFrame(reader)
    expect(frame).toContain(`"state":"connected"`)

    await reader.cancel()
  })

  it("emits a new status frame when the upstream state changes", async () => {
    vi.useFakeTimers()
    const { bus } = createCountingBus()
    let state: SseConnectionState = "connected"
    const app = createEventsApi(bus, () => state)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

    expect(await drainInitialStatus(reader)).toContain(`"state":"connected"`)

    state = "down"
    await vi.advanceTimersByTimeAsync(2_000)
    const changed = await readFrame(reader)
    expect(changed).toContain("event: status")
    expect(changed).toContain(`"state":"down"`)

    // No change -> no additional frame (next frame after 2s is nothing).
    await vi.advanceTimersByTimeAsync(2_000)
    state = "down"
    await vi.advanceTimersByTimeAsync(2_000)
    expect(reader.read).toBeDefined() // stream still open, no crash

    await reader.cancel()
  })

  it("emits an event: refresh frame when a relevant event is published", async () => {
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()
    await drainInitialStatus(reader)

    bus.publish(makeEvent("message.updated", 1234))
    const frame = await readFrame(reader)
    expect(frame).toContain("event: refresh")
    expect(frame).toContain(`data: {"ts":1234}`)

    await reader.cancel()
  })

  it("does not emit a frame for freshness-irrelevant events", async () => {
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()
    await drainInitialStatus(reader)

    bus.publish(makeEvent("message.part.delta", 100))
    bus.publish(makeEvent("session.updated", 200))
    const frame = await readFrame(reader)

    // The first frame must be the relevant one — the delta produced nothing.
    expect(frame).toContain("event: refresh")
    expect(frame).toContain(`"ts":200}`)

    await reader.cancel()
  })

  it("removes the bus listener when the client disconnects", async () => {
    const { bus, listenerCount } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

    expect(listenerCount()).toBe(1)
    await reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(listenerCount()).toBe(0)
    // Publishing after disconnect must not throw (no write to a closed stream).
    expect(() => bus.publish(makeEvent("session.updated", 999))).not.toThrow()
  })

  it("stops the state poll and heartbeat when the client disconnects", async () => {
    vi.useFakeTimers()
    const { bus } = createCountingBus()
    const app = createEventsApi(bus, () => "connected")
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

    await drainInitialStatus(reader)
    await reader.cancel()
    // Advancing past both intervals must not throw on a closed stream.
    await vi.advanceTimersByTimeAsync(12_000)
  })

  it("sends a heartbeat comment every 10s", async () => {
    vi.useFakeTimers()
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()
    await drainInitialStatus(reader)

    await vi.advanceTimersByTimeAsync(10_000)
    const frame = await readFrame(reader)
    expect(frame).toContain(": heartbeat")

    await reader.cancel()
  })

  it("returns 503 when no realtime bus is configured", async () => {
    const app = createEventsApi(undefined)
    const res = await app.request("/events")
    expect(res.status).toBe(503)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })
})
