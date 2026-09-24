import { useState, useEffect, useRef, useCallback } from "react"

/**
 * Supervisor attention queue for the Focus Remote view — polls GET /api/supervisor/queue.
 *
 * Ambient read-only consumer (Seam 4): keeps the last-good payload on fetch
 * failure and never nulls existing data. `available` is false while no good
 * payload has been seen or after an ok:false response, so the UI can hide the
 * Escalations section entirely.
 *
 * Response parsing lives in the exported pure function so it is unit-testable
 * without a DOM (same precedent as hooks.test.ts).
 */

import type { SupervisorQueuePayload } from "../../types"

const POLL_MS = 5000

/**
 * Parse the /api/supervisor/queue response body into a SupervisorQueuePayload.
 * Returns null for ok:false bodies or malformed shapes (treated as unavailable;
 * caller keeps the last-good payload).
 */
export function parseSupervisorQueueResponse(raw: unknown): SupervisorQueuePayload | null {
  if (raw === null || typeof raw !== "object") return null
  const body = raw as { ok?: unknown; items?: unknown; status?: unknown; readAtMs?: unknown; source?: unknown }
  if (body.ok !== true || !Array.isArray(body.items)) return null
  if (typeof body.readAtMs !== "number" || (body.source !== "queue.json" && body.source !== "unavailable")) return null
  const items = body.items.filter((item): item is SupervisorQueuePayload["items"][number] => {
    return item !== null && typeof item === "object"
  })
  const status =
    body.status !== null && typeof body.status === "object" ? body.status : null
  return { items, status, readAtMs: body.readAtMs, source: body.source }
}

export type UseSupervisorQueueReturn = {
  queue: SupervisorQueuePayload | null
  available: boolean
}

export function useSupervisorQueue(): UseSupervisorQueueReturn {
  const [queue, setQueue] = useState<SupervisorQueuePayload | null>(null)
  const [available, setAvailable] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchNow = useCallback(async (ac: AbortController): Promise<void> => {
    try {
      const res = await fetch("/api/supervisor/queue", { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = parseSupervisorQueueResponse(await res.json())
      if (payload === null) {
        setAvailable(false)
        return
      }
      setQueue(payload)
      setAvailable(true)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setAvailable(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    const ac = new AbortController()
    abortRef.current = ac

    const scheduleNext = () => {
      if (!isMounted || ac.signal.aborted) return
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void runPoll()
      }, POLL_MS)
    }

    const runPoll = async () => {
      if (document.hidden) return
      await fetchNow(ac)
      scheduleNext()
    }

    const onVisibilityChange = () => {
      if (!document.hidden && isMounted && !ac.signal.aborted) {
        void runPoll()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    void runPoll()

    return () => {
      isMounted = false
      ac.abort()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [fetchNow])

  return { queue, available }
}
