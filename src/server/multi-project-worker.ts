/**
 * multi-project-worker.ts — worker entry for the omo-pulse payload service.
 *
 * Runs the REAL createMultiProjectService (stores, caches, discovery) inside
 * a worker thread, so its synchronous SQLite reads never block the main
 * thread's event loop. Init opts arrive as plain data and are passed straight
 * through to the service factory.
 */
import { createMultiProjectService } from "./multi-project"
import type { StorageBackend } from "../ingest/storage-backend"

type InitMessage = {
  id: number
  cmd: "init"
  storageRoot: string
  storageBackend: StorageBackend
  pollIntervalMs?: number
}
type PayloadMessage = { id: number; cmd: "payload" }
type InvalidateMessage = { id: number; cmd: "invalidate" }
type WorkerRequest = InitMessage | PayloadMessage | InvalidateMessage

type WorkerReply =
  | { id: number; ok: true; cmd: "init" }
  | { id: number; ok: true; cmd: "payload"; payload: unknown }
  | { id: number; ok: true; cmd: "invalidate" }
  | { id: number; ok: false; cmd: "payload"; error: string }

const ctx = globalThis as unknown as {
  postMessage: (message: WorkerReply) => void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

let service: ReturnType<typeof createMultiProjectService> | null = null

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  if (msg.cmd === "init") {
    try {
      service = createMultiProjectService({
        storageRoot: msg.storageRoot,
        storageBackend: msg.storageBackend,
        pollIntervalMs: msg.pollIntervalMs,
      })
      ctx.postMessage({ id: msg.id, ok: true, cmd: "init" })
    } catch (error) {
      ctx.postMessage({
        id: msg.id,
        ok: false,
        cmd: "payload",
        error: `worker init failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
    return
  }

  if (!service) {
    ctx.postMessage({ id: msg.id, ok: false, cmd: "payload", error: "worker service not initialized" })
    return
  }

  if (msg.cmd === "payload") {
    service
      .getMultiProjectPayload()
      .then((payload) => {
        ctx.postMessage({ id: msg.id, ok: true, cmd: "payload", payload })
      })
      .catch((error: unknown) => {
        ctx.postMessage({
          id: msg.id,
          ok: false,
          cmd: "payload",
          error: error instanceof Error ? error.message : String(error),
        })
      })
    return
  }

  if (msg.cmd === "invalidate") {
    service.invalidate()
    ctx.postMessage({ id: msg.id, ok: true, cmd: "invalidate" })
  }
}
