import { describe, expect, it, vi } from "vitest"
import { createApi, type MultiProjectService } from "../server/api"
import type { FilesStorageBackend } from "../ingest/storage-backend"
import type { SupervisorQueueItem } from "../types"

const readSupervisorQueueProjection = vi.hoisted(() => vi.fn())
vi.mock("../ingest/supervisor-queue", () => ({
  readSupervisorQueueProjection: (...args: unknown[]) => readSupervisorQueueProjection(...args),
}))

const noopService: MultiProjectService = {
  getMultiProjectPayload: () => {
    throw new Error("not used in /api/supervisor/queue tests")
  },
  invalidate: () => {},
}

const filesBackend: FilesStorageBackend = {
  kind: "files",
  dataDir: "/tmp/omo-pulse-supervisor-queue-test",
  storageRoot: "/tmp/omo-pulse-supervisor-queue-test/storage",
}

function createApp(): ReturnType<typeof createApi> {
  return createApi({
    storageRoot: filesBackend.storageRoot,
    storageBackend: filesBackend,
    multiProjectService: noopService,
  })
}

const item: SupervisorQueueItem = {
  id: "att_test_1",
  decisionKey: "dk-1",
  kind: "question",
  lifecycleState: "revalidated",
  isResolved: false,
}

describe("GET /api/supervisor/queue", () => {
  it("returns 200 with the projection payload when the read succeeds", async () => {
    readSupervisorQueueProjection.mockReturnValue({
      ok: true,
      items: [item],
      status: null,
      readAtMs: 1234,
      source: "queue.json",
    })
    const res = await createApp().request("/supervisor/queue")

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.items).toEqual([item])
    expect(body.source).toBe("queue.json")
  })

  it("returns 503 with error 'absent' when the supervisor state dir is missing", async () => {
    readSupervisorQueueProjection.mockReturnValue({ ok: false, reason: "absent" })
    const res = await createApp().request("/supervisor/queue")

    expect(res.status).toBe(503)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe("absent")
  })

  it("returns 500 when the projection is corrupt", async () => {
    readSupervisorQueueProjection.mockReturnValue({ ok: false, reason: "corrupt" })
    const res = await createApp().request("/supervisor/queue")

    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe("corrupt")
  })

  it("returns 500 when the projection has the wrong shape", async () => {
    readSupervisorQueueProjection.mockReturnValue({ ok: false, reason: "shape" })
    const res = await createApp().request("/supervisor/queue")

    expect(res.status).toBe(500)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe("shape")
  })
})
