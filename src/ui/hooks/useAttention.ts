import { useState, useEffect, useRef, useCallback } from "react"

/**
 * Attention feed for the Focus Remote view — polls GET /api/attention.
 *
 * Types mirror the API contract (server implementation lives in
 * src/ingest/attention.ts, which the UI must not import from).
 */

import type {
  AttentionPayload,
  AttentionProject,
  AttentionSession,
  AttentionState,
} from "../../types"

export type { AttentionPayload, AttentionProject, AttentionSession, AttentionState }

const POLL_MS = 3000

export type UseAttentionReturn = {
  projects: AttentionProject[]
  connected: boolean
  refresh: () => Promise<void>
}

export function useAttention(): UseAttentionReturn {
  const [projects, setProjects] = useState<AttentionProject[]>([])
  const [connected, setConnected] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchNow = useCallback(async (ac: AbortController): Promise<void> => {
    try {
      const res = await fetch("/api/attention", { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw: AttentionPayload = await res.json()
      setProjects(raw.projects)
      setConnected(true)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setConnected(false)
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
  const refresh = useCallback(async (): Promise<void> => {
    if (abortRef.current) abortRef.current.abort()
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    const ac = new AbortController()
    abortRef.current = ac
    await fetchNow(ac)
  }, [fetchNow])


  return { projects, connected, refresh }
}
