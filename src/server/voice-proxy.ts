import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Origin-relative WebSocket proxy for the voice widget.
 *
 * The voice-bridge binds loopback only and authenticates with a per-boot token
 * persisted to a local file. A remote phone cannot reach the bridge directly,
 * so the widget connects to omo-pulse's `/api/voice-ws`; this module upgrades
 * that connection and pipes it to the bridge with the token attached
 * server-side. The token never reaches the browser, a response body, or a log.
 */

/** Route the widget connects to (origin-relative in production). */
export const VOICE_PROXY_PATH = "/api/voice-ws"

/** Loopback bridge endpoint; overridable via OMO_PULSE_VOICE_BRIDGE_URL. */
export const DEFAULT_VOICE_BRIDGE_URL = "ws://127.0.0.1:18220"

const BRIDGE_URL_ENV = "OMO_PULSE_VOICE_BRIDGE_URL"
const WS_OPEN = 1

/** Per-boot token file written by the voice-bridge (mode 0600). */
export function defaultVoiceTokenPath(): string {
  return join(homedir(), ".local", "state", "voice-bridge", "token")
}

/**
 * Reads the bridge token fresh on every call (it rotates per bridge boot).
 * Returns null when the file is absent, unreadable, or blank. The value is
 * never logged.
 */
export function readVoiceBridgeToken(tokenPath: string = defaultVoiceTokenPath()): string | null {
  try {
    const trimmed = readFileSync(tokenPath, "utf8").trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/** Resolves the bridge URL, honoring the OMO_PULSE_VOICE_BRIDGE_URL override. */
export function resolveVoiceBridgeUrl(): string {
  const override = process.env[BRIDGE_URL_ENV]
  if (override !== undefined && override !== "") return override
  return DEFAULT_VOICE_BRIDGE_URL
}

/** Data attached to each upgraded server socket. */
export interface VoiceProxyData {
  readonly token: string
  client: VoiceBridgeSocket | null
  /** Frames from the browser queued until the bridge socket is OPEN. */
  pending: Array<string | Uint8Array>
  closed: boolean
}

/** Minimal client-side socket surface the proxy drives. */
export interface VoiceBridgeSocket {
  readonly readyState: number
  binaryType: string
  send(data: string | ArrayBuffer | Uint8Array): void
  close(code?: number, reason?: string): void
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
}

/** Minimal server surface needed to perform the upgrade. */
export interface VoiceUpgradeServer {
  upgrade(request: Request, options: { data: VoiceProxyData }): boolean
}

/** WebSocket callbacks registered on Bun.serve. */
export interface VoiceProxyWebSocketHandler {
  open(ws: Bun.ServerWebSocket<VoiceProxyData>): void
  message(ws: Bun.ServerWebSocket<VoiceProxyData>, message: string | Buffer): void
  close(ws: Bun.ServerWebSocket<VoiceProxyData>): void
}

/** Injectable seams; production uses the defaults. */
export interface VoiceProxyDeps {
  readonly readToken?: () => string | null
  readonly connectBridge?: (url: string) => VoiceBridgeSocket
}

function defaultConnectBridge(url: string): VoiceBridgeSocket {
  return new WebSocket(url) as unknown as VoiceBridgeSocket
}

function logProxyFailure(reason: string): void {
  // One line, never the token or the token-bearing URL.
  console.warn(`[voice-proxy] ${reason}`)
}

/**
 * Intercepts the `/api/voice-ws` upgrade before Hono (which does not own
 * WebSocket upgrades). Returns undefined for every other path so the caller
 * can fall through to the app.
 */
export function handleVoiceProxyUpgrade(
  request: Request,
  server: VoiceUpgradeServer,
  readToken: () => string | null = () => readVoiceBridgeToken(),
): Response | undefined {
  const url = new URL(request.url)
  if (url.pathname !== VOICE_PROXY_PATH) return undefined

  const token = readToken()
  if (token === null) {
    return new Response("voice bridge token unavailable", { status: 503 })
  }

  const upgraded = server.upgrade(request, {
    data: { token, client: null, pending: [], closed: false },
  })
  if (!upgraded) {
    return new Response("websocket upgrade required", { status: 426 })
  }
  return undefined
}

/**
 * Builds the Bun.serve websocket handler. Per connection it dials the bridge
 * as `client=dash` with the token read at upgrade time, pipes text and binary
 * frames both directions verbatim, and propagates close both ways.
 */
export function createVoiceProxyHandler(
  bridgeUrl: string,
  deps: VoiceProxyDeps = {},
): VoiceProxyWebSocketHandler {
  const connectBridge = deps.connectBridge ?? defaultConnectBridge

  return {
    open(ws): void {
      const data = ws.data
      const target = `${bridgeUrl}/voice?client=dash&token=${encodeURIComponent(data.token)}`
      let client: VoiceBridgeSocket
      try {
        client = connectBridge(target)
      } catch {
        data.closed = true
        logProxyFailure("bridge connection failed")
        ws.close(1011, "bridge unavailable")
        return
      }

      data.client = client
      client.binaryType = "arraybuffer"
      client.onopen = () => {
        if (data.closed) return
        for (const frame of data.pending) client.send(frame)
        data.pending.length = 0
      }
      client.onmessage = (event) => {
        if (data.closed) return
        const payload = event.data
        if (typeof payload === "string" || payload instanceof ArrayBuffer || payload instanceof Uint8Array) {
          ws.send(payload)
        }
      }
      client.onclose = () => {
        if (data.closed) return
        data.closed = true
        ws.close()
      }
      client.onerror = () => {
        logProxyFailure("bridge socket error")
      }
    },

    message(ws, message): void {
      const data = ws.data
      if (data.closed || data.client === null) return
      if (data.client.readyState === WS_OPEN) data.client.send(message)
      else data.pending.push(message)
    },

    close(ws): void {
      const data = ws.data
      if (data.closed) return
      data.closed = true
      data.pending.length = 0
      data.client?.close()
    },
  }
}
