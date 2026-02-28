import { useState, useEffect, useRef, useCallback } from "react"
import type { DashboardMultiProjectPayload } from "../../types"

const POLL_CONNECTED_MS = 2200
const POLL_DISCONNECTED_MS = 3600

export function useDashboardData(): {
  data: DashboardMultiProjectPayload | null
  connected: boolean
  lastUpdate: number | null
  errorHint: string | null
} {
  const [data, setData] = useState<DashboardMultiProjectPayload | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const connectedRef = useRef(false)

  // Keep ref in sync with state so tick reads current value
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  const tick = useCallback(async () => {
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await fetch("/api/projects", { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw: DashboardMultiProjectPayload = await res.json()
      setData(raw)
      setConnected(true)
      connectedRef.current = true
      setLastUpdate(Date.now())
      setErrorHint(null)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setConnected(false)
      connectedRef.current = false
      const message = err instanceof Error ? err.message : String(err)
      setErrorHint(message)
      // Keep stale data — do NOT setData(null)
    }

    const delay = connectedRef.current ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS
    timerRef.current = setTimeout(tick, delay)
  }, [])

  useEffect(() => {
    // Start polling loop
    tick()

    return () => {
      // Cleanup: cancel in-flight request + clear pending timer
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [tick])

  return { data, connected, lastUpdate, errorHint }
}
