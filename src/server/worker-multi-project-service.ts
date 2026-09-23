import type { StorageBackend } from "../ingest/storage-backend"
import type { DashboardMultiProjectPayload } from "../types"
import type { MultiProjectService } from "./api"

/**
 * Worker-backed MultiProjectService.
 *
 * The heavy work (SQLite reads, snapshot building) happens inside a worker
 * thread; the main thread's event loop only serializes messages. Fail-soft:
 * if a refresh errors or times out, the last good payload is served.
 */

const PAYLOAD_TIMEOUT_MS = 60_000

type WorkerInitRequest = {
  id: number
  cmd: "init"
  storageRoot: string
  storageBackend: StorageBackend
  pollIntervalMs?: number
}
type WorkerPayloadRequest = { id: number; cmd: "payload" }
type WorkerInvalidateRequest = { id: number; cmd: "invalidate"; directories?: string[] }
type WorkerRequest = WorkerInitRequest | WorkerPayloadRequest | WorkerInvalidateRequest
type PendingEntry = { resolve: (reply: WorkerReply | PromiseLike<WorkerReply>) => void; timer: ReturnType<typeof setTimeout> }

type WorkerReply =
  | { id: number; ok: true; cmd: "init" | "invalidate" }
  | { id: number; ok: true; cmd: "payload"; payload: DashboardMultiProjectPayload }
  | { id: number; ok: false; cmd: "payload"; error: string }
  | { id: number; ok: false; cmd: "init" | "invalidate"; error: string }

export function createWorkerMultiProjectService(opts: {
  storageRoot: string
  storageBackend: StorageBackend
  pollIntervalMs?: number
}): MultiProjectService {
  const worker = new Worker(new URL("./multi-project-worker.ts", import.meta.url))
  const pending = new Map<number, PendingEntry>()
  let lastGood: DashboardMultiProjectPayload | null = null
  let nextId = 1

  function failPending(id: number, error: string, resolve: (reply: WorkerReply) => void): void {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    clearTimeout(entry.timer)
    entry.resolve({ id, ok: false, cmd: "payload", error })
  }

  worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
    const reply = event.data
    const entry = pending.get(reply.id)
    if (!entry) return
    pending.delete(reply.id)
    clearTimeout(entry.timer)
    entry.resolve(reply)
  })

  worker.addEventListener("error", (event: ErrorEvent) => {
    // Fail every in-flight request; the next call respawns via a fresh worker.
    for (const id of [...pending.keys()]) {
      const entry = pending.get(id)
      if (!entry) continue
      pending.delete(id)
      clearTimeout(entry.timer)
      entry.resolve({ id, ok: false, cmd: "payload", error: `worker error: ${event.message}` })
    }
  })

  function request(message: WorkerRequest, timeoutMs: number): Promise<WorkerReply> {
    return new Promise<WorkerReply>((resolve) => {
      const id = message.id
      const timer = setTimeout(() => {
        const entry = pending.get(id)
        if (!entry) return
        pending.delete(id)
        clearTimeout(entry.timer)
        entry.resolve({ id, ok: false, cmd: "payload", error: `worker timeout after ${timeoutMs}ms` })
      }, timeoutMs)
      pending.set(id, { resolve, timer })
      worker.postMessage(message)
    })
  }

  let initDone: Promise<void> | null = null
  function ensureInit(): Promise<void> {
    if (initDone) return initDone
    initDone = request(
      { id: nextId++, cmd: "init", storageRoot: opts.storageRoot, storageBackend: opts.storageBackend, pollIntervalMs: opts.pollIntervalMs },
      PAYLOAD_TIMEOUT_MS,
    ).then(() => undefined)
    return initDone
  }

  async function requestPayload(): Promise<DashboardMultiProjectPayload> {
    await ensureInit()
    const id = nextId++
    const reply = await request({ id, cmd: "payload" }, PAYLOAD_TIMEOUT_MS)
    if (!reply.ok || reply.cmd !== "payload") throw new Error("worker returned non-payload reply")
    lastGood = reply.payload
    return reply.payload
  }

  /**
   * Invalidates and resolves only once the worker acknowledges it, so callers
   * can sequence work (e.g. publish a refresh signal) strictly after the caches
   * are actually cleared. invalidate() remains fire-and-forget for other callers.
   */
  async function invalidateAndWait(): Promise<void> {
    await ensureInit()
    const reply = await request({ id: nextId++, cmd: "invalidate" }, PAYLOAD_TIMEOUT_MS)
    // Reject on a worker timeout/error so callers (start.ts) do not publish a
    // refresh signal for caches that were never actually cleared.
    if (!reply.ok) throw new Error("worker failed to acknowledge invalidate")
  }

  /**
   * Directory-scoped variant: the worker clears only the stores whose canonical
   * project root matches one of the given directories. Absent `directories` on
   * the wire message means a global invalidate (backward-compatible).
   */
  async function invalidateForDirectoriesAndWait(directories: readonly string[]): Promise<void> {
    await ensureInit()
    const reply = await request(
      { id: nextId++, cmd: "invalidate", directories: [...directories] },
      PAYLOAD_TIMEOUT_MS,
    )
    if (!reply.ok) throw new Error("worker failed to acknowledge invalidate")
  }

  return {
    async getMultiProjectPayload(): Promise<DashboardMultiProjectPayload> {
      try {
        return await requestPayload()
      } catch {
        // Fail soft: serve the last good snapshot rather than wedging routes.
        if (lastGood) return { ...lastGood, serverNowMs: Date.now() }
        return { projects: [], serverNowMs: Date.now(), pollIntervalMs: opts.pollIntervalMs ?? 30_000 }
      }
    },
    invalidate(): void {
      void invalidateAndWait()
    },
    invalidateAndWait,
    invalidateForDirectories(directories: readonly string[]): void {
      void invalidateForDirectoriesAndWait(directories)
    },
    invalidateForDirectoriesAndWait,
  }
}
