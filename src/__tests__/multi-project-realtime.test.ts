import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRealtimeBus } from "../ingest/realtime-types"
import type { OpenCodeEvent } from "../ingest/realtime-types"

const { listSources, getSourceById, clearCacheCalls } = vi.hoisted(() => ({
  listSources: vi.fn(() => [] as Array<{ id: string }>),
  getSourceById: vi.fn((_storageRoot: unknown, id: unknown): { id: string; projectRoot: string } | null => null),
  clearCacheCalls: new Map<string, number>(),
}))
vi.mock("../ingest/sources-registry", async () => {
  const path = await import("node:path")
  return {
    listSources,
    getSourceById,
    canonicalizeProjectRoot: (root: string) => path.resolve(root),
    hashProjectRoot: (root: string) => root,
  }
})
vi.mock("../server/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/dashboard")>()
  return {
    ...actual,
    createDashboardStore: (opts: Parameters<typeof actual.createDashboardStore>[0]) => {
      const store = actual.createDashboardStore(opts)
      return {
        ...store,
        clearCache: () => {
          clearCacheCalls.set(opts.projectRoot, (clearCacheCalls.get(opts.projectRoot) ?? 0) + 1)
          store.clearCache()
        },
      }
    },
  }
})

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
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); listSources.mockReset(); getSourceById.mockReset(); clearCacheCalls.clear() })
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

  it("clears only the affected project's store on a directory-scoped event", async () => {
    listSources.mockReturnValue([{ id: "src-a" }, { id: "src-b" }])
    getSourceById.mockImplementation((_storageRoot: unknown, id: unknown) =>
      id === "src-a" ? { id: String(id), projectRoot: "/tmp/per-source-a" } : id === "src-b" ? { id: String(id), projectRoot: "/tmp/per-source-b" } : null,
    )
    const service = createMultiProjectService({ storageRoot: "/tmp/storage", storageBackend, realtimeDebounceMs: 300 })
    const first = await service.getMultiProjectPayload()
    expect(first.projects.find((p) => p.projectRoot === "/tmp/per-source-a")).toBeDefined()
    expect(first.projects.find((p) => p.projectRoot === "/tmp/per-source-b")).toBeDefined()
    clearCacheCalls.clear()

    // Directory carries a trailing slash: canonicalization must still match A only.
    service.onRealtimeEvent({ kind: "session.updated", ts: 2, directory: "/tmp/per-source-a/" })
    await vi.advanceTimersByTimeAsync(300)
    await service.getMultiProjectPayload()

    expect(clearCacheCalls.get("/tmp/per-source-a")).toBe(1)
    expect(clearCacheCalls.get("/tmp/per-source-b") ?? 0).toBe(0)
  })

  it("falls back to global invalidation when an event carries no directory", async () => {
    listSources.mockReturnValue([{ id: "src-a" }, { id: "src-b" }])
    getSourceById.mockImplementation((_storageRoot: unknown, id: unknown) =>
      id === "src-a" ? { id: String(id), projectRoot: "/tmp/per-source-a" } : id === "src-b" ? { id: String(id), projectRoot: "/tmp/per-source-b" } : null,
    )
    const service = createMultiProjectService({ storageRoot: "/tmp/storage", storageBackend, realtimeDebounceMs: 300 })
    await service.getMultiProjectPayload()
    clearCacheCalls.clear()

    service.onRealtimeEvent({ kind: "session.updated", ts: 2 })
    await vi.advanceTimersByTimeAsync(300)
    await service.getMultiProjectPayload()

    expect(clearCacheCalls.get("/tmp/per-source-a")).toBe(1)
    expect(clearCacheCalls.get("/tmp/per-source-b")).toBe(1)
  })

  it.each([
    { name: "unknown directory falls back to global", directory: "/unknown", roots: ["/root/a", "/root/b"], cleared: [1, 1] },
    { name: "subdirectory clears only its parent", directory: "/root/sub", roots: ["/root", "/other"], cleared: [1, 0] },
    { name: "longest parent wins", directory: "/root/sub/deeper", roots: ["/root", "/root/sub"], cleared: [0, 1] },
    { name: "exact root wins over ancestor", directory: "/root/sub", roots: ["/root", "/root/sub"], cleared: [0, 1] },
    { name: "path boundary does not clear a sibling", directory: "/a/b", roots: ["/a/b", "/a/bc"], cleared: [1, 0] },
    { name: "prefix lookalike falls back to global", directory: "/a/b", roots: ["/a/bc", "/other"], cleared: [1, 1] },
  ])("$name", async ({ directory, roots, cleared }) => {
    listSources.mockReturnValue(roots.map((id) => ({ id })))
    getSourceById.mockImplementation((_storageRoot, id) =>
      typeof id === "string" && roots.includes(id) ? { id, projectRoot: id } : null,
    )
    const service = createMultiProjectService({ storageRoot: "/tmp/storage", storageBackend, realtimeDebounceMs: 300 })
    const first = await service.getMultiProjectPayload()
    clearCacheCalls.clear()

    service.onRealtimeEvent({ kind: "session.updated", ts: 2, directory })
    await vi.advanceTimersByTimeAsync(300)
    const refreshed = await service.getMultiProjectPayload()

    expect(listSources).toHaveBeenCalledTimes(2)
    roots.forEach((root, index) => {
      expect(clearCacheCalls.get(root) ?? 0).toBe(cleared[index])
      const previousSeries = first.projects.find((project) => project.projectRoot === root)?.sessionTimeSeries
      const refreshedSeries = refreshed.projects.find((project) => project.projectRoot === root)?.sessionTimeSeries
      expect(previousSeries).toBeDefined()
      if (cleared[index] === 1) expect(refreshedSeries).not.toBe(previousSeries)
      else expect(refreshedSeries).toBe(previousSeries)
    })
  })

  it("invalidates every affected root in a burst before publishing refresh", async () => {
    const roots = ["/root/a", "/root/b", "/root/c"]
    listSources.mockReturnValue(roots.map((id) => ({ id })))
    getSourceById.mockImplementation((_storageRoot, id) =>
      typeof id === "string" && roots.includes(id) ? { id, projectRoot: id } : null,
    )
    const realtimeBus = createRealtimeBus()
    const published = vi.fn(() => expect([...clearCacheCalls.keys()]).toEqual(["/root/a", "/root/b"]))
    realtimeBus.subscribe(published)
    const service = createMultiProjectService({ storageRoot: "/tmp/storage", storageBackend, realtimeBus, realtimeDebounceMs: 300 })
    await service.getMultiProjectPayload()
    clearCacheCalls.clear()

    service.onRealtimeEvent({ kind: "session.updated", ts: 2, directory: "/root/a/sub" })
    service.onRealtimeEvent({ kind: "session.updated", ts: 3, directory: "/root/b/sub" })
    service.onRealtimeEvent({ kind: "session.updated", ts: 4, directory: "/root/a" })
    await vi.advanceTimersByTimeAsync(300)

    expect(published).toHaveBeenCalledTimes(1)
    expect(clearCacheCalls.get("/root/a")).toBe(1)
    expect(clearCacheCalls.get("/root/b")).toBe(1)
    expect(clearCacheCalls.has("/root/c")).toBe(false)
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
