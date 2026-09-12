import { useEffect, useRef, useState } from "react"
import type { ProviderQuotasPayload } from "../../types"

/** UI poll cadence; the server caches provider responses for ~3 min. */
const POLL_MS = 60_000

export type UseQuotasReturn = {
  quotas: ProviderQuotasPayload | null
  connected: boolean
}

/** Polls GET /api/quotas once a minute for provider quota usage. */
export function useQuotas(): UseQuotasReturn {
  const [quotas, setQuotas] = useState<ProviderQuotasPayload | null>(null)
  const [connected, setConnected] = useState<boolean>(false)
  const connectedRef = useRef<boolean>(false)

  useEffect(() => {
    const ac = new AbortController()
    let stopped = false
    let timer: number | undefined

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch("/api/quotas", { signal: ac.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as Partial<ProviderQuotasPayload> & { ok?: boolean }
        if (stopped) return
        if (!json.ok || !Array.isArray(json.providers)) throw new Error("malformed payload")
        setQuotas({ providers: json.providers, serverNowMs: json.serverNowMs ?? Date.now() })
        if (!connectedRef.current) {
          connectedRef.current = true
          setConnected(true)
        }
      } catch {
        if (stopped || ac.signal.aborted) return
        if (connectedRef.current) {
          connectedRef.current = false
          setConnected(false)
        }
      } finally {
        if (!stopped) {
          timer = window.setTimeout(() => { void poll() }, POLL_MS)
        }
      }
    }

    void poll()

    return () => {
      stopped = true
      ac.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  return { quotas, connected }
}
