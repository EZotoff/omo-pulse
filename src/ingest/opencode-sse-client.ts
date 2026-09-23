import { readRealtimeConfig } from "./realtime-config"
import type { OpenCodeEvent, SseConnectionState } from "./realtime-types"

type JsonObject = Record<string, unknown>

type ClientOptions = {
  readonly endpoint?: string
  readonly authHeader?: string | null
  readonly fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  readonly retryBaseMs?: number
}

export type OpenCodeSseClient = {
  start(): void
  stop(): void
  subscribe(listener: (event: OpenCodeEvent) => void): () => void
  getState(): SseConnectionState
}

function record(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object(value) : null
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function sequence(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function normalize(value: unknown, frameId: string | undefined): OpenCodeEvent | null {
  const envelope = record(value)
  const payload = record(envelope?.payload) ?? envelope
  const kind = text(payload?.type)
  if (!kind || kind === "server.heartbeat" || kind === "server.connected") return null

  const properties = record(payload?.properties)
  const info = record(properties?.info)
  const part = record(properties?.part)
  const sessionId = text(properties?.sessionID) ?? text(properties?.sessionId) ??
    text(part?.sessionID) ?? text(info?.sessionID) ??
    (kind.startsWith("session.") ? text(info?.id) : undefined)
  const directory = text(envelope?.directory) ?? text(properties?.directory)
  const seq = sequence(frameId) ?? sequence(envelope?.seq) ?? sequence(payload?.seq)
  return {
    kind,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(directory === undefined ? {} : { directory }),
    ...(seq === undefined ? {} : { seq }),
    ts: Date.now(),
  }
}

// Discovery via the configured OpenCode HTTP endpoint (OMO_PULSE_OPENCODE_ENDPOINT).
// De-risking result (2026-09-23): @opencode-ai/sdk@1.18.32 DOES install and import
// under Bun, but this project keeps a zero-runtime-dependency posture, so the SSE
// reader stays on the platform fetch/ReadableStream API. The SDK remains a drop-in
// upgrade if the operator approves adding the dependency.
export function createOpenCodeSseClient(options: ClientOptions = {}): OpenCodeSseClient {
  const endpoint = options.endpoint ?? readRealtimeConfig().opencodeEndpoint
  const fetcher = options.fetcher ?? fetch
  const authHeader =
    options.authHeader === undefined ? readRealtimeConfig().opencodeAuthHeader : options.authHeader
  const retryBaseMs = options.retryBaseMs ?? 500
  const listeners = new Set<(event: OpenCodeEvent) => void>()
  let state: SseConnectionState = "down"
  let controller: AbortController | null = null
  let lastSeq: number | undefined
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let attempt = 0

  function consumeFrame(frame: string): void {
    let data = ""
    let frameId: string | undefined
    for (const line of frame.split("\n")) {
      if (line.startsWith("data:")) data += `${line.slice(5).trimStart()}\n`
      if (line.startsWith("id:")) frameId = line.slice(3).trimStart()
    }
    if (!data) return
    let parsed: unknown
    try {
      parsed = JSON.parse(data.slice(0, -1))
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      return
    }
    const event = normalize(parsed, frameId)
    if (!event || (event.seq !== undefined && lastSeq !== undefined && event.seq <= lastSeq)) return
    if (event.seq !== undefined) lastSeq = event.seq
    for (const listener of listeners) listener(event)
  }

  async function connect(signal: AbortSignal): Promise<void> {
    const url = new URL("global/event", `${endpoint.replace(/\/+$/, "")}/`)
    // Best-effort replay: the pinned OpenCode /global/event ignores `after` and
    // emits UUID payload IDs, so TTL refresh remains the guarantee across gaps.
    if (lastSeq !== undefined) url.searchParams.set("after", String(lastSeq))
    const response = await fetcher(url, {
      headers: {
        Accept: "text/event-stream",
        ...(authHeader === null || authHeader === undefined ? {} : { Authorization: authHeader }),
      },
      signal,
    })
    if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
      await response.body?.cancel()
      return
    }
    state = "connected"
    attempt = 0
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ""
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        pending += decoder.decode(value, { stream: true })
        pending = pending.replace(/\r\n/g, "\n")
        let boundary = pending.indexOf("\n\n")
        while (boundary !== -1) {
          consumeFrame(pending.slice(0, boundary))
          pending = pending.slice(boundary + 2)
          boundary = pending.indexOf("\n\n")
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  function scheduleRetry(): void {
    if (!active) return
    const delay = Math.min(retryBaseMs * 2 ** Math.min(attempt++, 6), 30_000)
    retryTimer = setTimeout(() => {
      retryTimer = null
      run()
    }, delay)
  }

  function run(): void {
    if (!active) return
    controller = new AbortController()
    const signal = controller.signal
    void connect(signal).then(
      () => {
        if (!active || signal.aborted) return
        state = "reconnecting"
        scheduleRetry()
      },
      () => {
        if (!active || signal.aborted) return
        state = "down"
        scheduleRetry()
      },
    )
  }

  return {
    start() {
      if (active) return
      active = true
      state = "reconnecting"
      run()
    },
    stop() {
      active = false
      controller?.abort()
      controller = null
      if (retryTimer !== null) clearTimeout(retryTimer)
      retryTimer = null
      state = "down"
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getState: () => state,
  }
}
