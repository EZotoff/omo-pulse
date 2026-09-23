import { afterEach, describe, expect, it, vi } from "vitest"
import { createApi, type MultiProjectService } from "../server/api"
import { createRealtimeBus } from "../ingest/realtime-types"
import type { OpenCodeEvent, RealtimeBus } from "../ingest/realtime-types"
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

function createEventsApi(bus?: RealtimeBus): HonoApp {
  return createApi({
    storageRoot: filesBackend.storageRoot,
    storageBackend: filesBackend,
    multiProjectService: noopService,
    realtimeBus: bus,
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

  it("emits an event: refresh frame when a relevant event is published", async () => {
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

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

  it("sends a heartbeat comment every 10s", async () => {
    vi.useFakeTimers()
    const { bus } = createCountingBus()
    const app = createEventsApi(bus)
    const res = await app.request("/events")
    if (!res.body) throw new Error("expected a streaming body")
    const reader = res.body.getReader()

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
