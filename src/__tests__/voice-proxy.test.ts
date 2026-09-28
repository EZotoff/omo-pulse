import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_VOICE_BRIDGE_URL,
  VOICE_PROXY_PATH,
  createVoiceProxyHandler,
  handleVoiceProxyUpgrade,
  readVoiceBridgeToken,
  resolveVoiceBridgeUrl,
  type VoiceBridgeSocket,
  type VoiceProxyData,
} from "../server/voice-proxy"

// ---------------------------------------------------------------------------
// Token reader
// ---------------------------------------------------------------------------

describe("readVoiceBridgeToken", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "voice-token-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("returns the trimmed token when the file is present", () => {
    const tokenPath = join(dir, "token")
    writeFileSync(tokenPath, "  abc123\n")
    expect(readVoiceBridgeToken(tokenPath)).toBe("abc123")
  })

  test("returns null when the file is absent", () => {
    expect(readVoiceBridgeToken(join(dir, "missing"))).toBeNull()
  })

  test("returns null when the file is whitespace-only", () => {
    const tokenPath = join(dir, "token")
    writeFileSync(tokenPath, "   \n\t\n")
    expect(readVoiceBridgeToken(tokenPath)).toBeNull()
  })

  test("returns null when the path is unreadable", () => {
    const tokenPath = join(dir, "a-directory")
    mkdirSync(tokenPath)
    expect(readVoiceBridgeToken(tokenPath)).toBeNull()
  })

  test("re-reads the file on every call (no caching across boots)", () => {
    const tokenPath = join(dir, "token")
    writeFileSync(tokenPath, "first-token")
    expect(readVoiceBridgeToken(tokenPath)).toBe("first-token")
    writeFileSync(tokenPath, "second-token")
    expect(readVoiceBridgeToken(tokenPath)).toBe("second-token")
  })
})

describe("resolveVoiceBridgeUrl", () => {
  const KEY = "OMO_PULSE_VOICE_BRIDGE_URL"
  const previous = process.env[KEY]

  afterEach(() => {
    if (previous === undefined) delete process.env[KEY]
    else process.env[KEY] = previous
  })

  test("defaults to the loopback bridge URL", () => {
    delete process.env[KEY]
    expect(resolveVoiceBridgeUrl()).toBe(DEFAULT_VOICE_BRIDGE_URL)
  })

  test("honors the OMO_PULSE_VOICE_BRIDGE_URL override", () => {
    process.env[KEY] = "ws://127.0.0.1:19999"
    expect(resolveVoiceBridgeUrl()).toBe("ws://127.0.0.1:19999")
  })
})

// ---------------------------------------------------------------------------
// Upgrade interception
// ---------------------------------------------------------------------------

class FakeUpgradeServer {
  upgraded: VoiceProxyData | null = null

  upgrade(_request: Request, options: { data: VoiceProxyData }): boolean {
    this.upgraded = options.data
    return true
  }
}

describe("handleVoiceProxyUpgrade", () => {
  test("refuses with 503 before upgrade when the token is absent", () => {
    const server = new FakeUpgradeServer()
    const response = handleVoiceProxyUpgrade(
      new Request(`http://localhost${VOICE_PROXY_PATH}`),
      server,
      () => null,
    )
    expect(response?.status).toBe(503)
    expect(server.upgraded).toBeNull()
  })

  test("passes non-voice paths through untouched", () => {
    const response = handleVoiceProxyUpgrade(
      new Request("http://localhost/api/projects"),
      new FakeUpgradeServer(),
      () => "t",
    )
    expect(response).toBeUndefined()
  })

  test("upgrades with the token read at connection time", () => {
    const server = new FakeUpgradeServer()
    const response = handleVoiceProxyUpgrade(
      new Request(`http://localhost${VOICE_PROXY_PATH}`),
      server,
      () => "secret-token",
    )
    expect(response).toBeUndefined()
    expect(server.upgraded?.token).toBe("secret-token")
  })
})

// ---------------------------------------------------------------------------
// Proxy handler (transport injected so the pipe logic runs under any runtime)
// ---------------------------------------------------------------------------

class FakeServerSocket {
  readonly data: VoiceProxyData
  readonly sent: Array<string | Uint8Array> = []
  closed: { code?: number; reason?: string } | null = null

  constructor(data: VoiceProxyData) {
    this.data = data
  }

  send(payload: string | ArrayBuffer | Uint8Array): void {
    this.sent.push(toBytes(payload))
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
  }
}

class FakeBridgeSocket implements VoiceBridgeSocket {
  readyState = 1
  binaryType = "arraybuffer"
  readonly sent: Array<string | Uint8Array> = []
  closed: { code?: number; reason?: string } | null = null
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null

  send(payload: string | ArrayBuffer | Uint8Array): void {
    this.sent.push(toBytes(payload))
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data })
  }

  emitClose(): void {
    this.onclose?.({})
  }

  emitError(): void {
    this.onerror?.({})
  }

  emitOpen(): void {
    this.readyState = 1
    this.onopen?.({})
  }
}

function toBytes(payload: string | ArrayBuffer | Uint8Array): string | Uint8Array {
  if (typeof payload === "string") return payload
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload)
}

function asServerWs(ws: FakeServerSocket): Bun.ServerWebSocket<VoiceProxyData> {
  return ws as unknown as Bun.ServerWebSocket<VoiceProxyData>
}

type Harness = {
  readonly handler: ReturnType<typeof createVoiceProxyHandler>
  readonly server: FakeUpgradeServer
  readonly bridge: FakeBridgeSocket
  readonly ws: FakeServerSocket
  readonly urls: string[]
}

function connectHarness(token: string | null = "secret-token"): Harness {
  const urls: string[] = []
  let bridge: FakeBridgeSocket | null = null
  const handler = createVoiceProxyHandler("ws://127.0.0.1:18220", {
    connectBridge: (url) => {
      urls.push(url)
      bridge = new FakeBridgeSocket()
      return bridge
    },
  })
  const server = new FakeUpgradeServer()
  const response = handleVoiceProxyUpgrade(
    new Request(`http://localhost${VOICE_PROXY_PATH}`),
    server,
    () => token,
  )
  if (response !== undefined || server.upgraded === null) {
    throw new Error("harness expected a successful upgrade")
  }
  const ws = new FakeServerSocket(server.upgraded)
  handler.open(asServerWs(ws))
  if (bridge === null) throw new Error("harness expected a bridge connection")
  return { handler, server, bridge, ws, urls }
}

describe("createVoiceProxyHandler", () => {
  test("dials the bridge as client=dash with the token", () => {
    const { server, urls } = connectHarness("secret-token")
    expect(server.upgraded?.token).toBe("secret-token")
    expect(urls).toEqual(["ws://127.0.0.1:18220/voice?client=dash&token=secret-token"])
  })

  test("pipes text frames both directions verbatim", () => {
    const { handler, bridge, ws } = connectHarness()
    handler.message(asServerWs(ws), "hello bridge")
    expect(bridge.sent).toEqual(["hello bridge"])
    bridge.emitMessage("hello browser")
    expect(ws.sent).toEqual(["hello browser"])
  })

  test("pipes binary frames byte-identically (Int16 payload)", () => {
    const { handler, bridge, ws } = connectHarness()
    const samples = new Int16Array([1, -2, 32767, -32768, 0])
    const bytes = new Uint8Array(samples.buffer.slice(0))

    handler.message(asServerWs(ws), Buffer.from(bytes))
    expect(bridge.sent).toHaveLength(1)
    expect(Array.from(bridge.sent[0] as Uint8Array)).toEqual(Array.from(bytes))

    bridge.emitMessage(bytes.buffer)
    expect(ws.sent).toHaveLength(1)
    expect(Array.from(ws.sent[0] as Uint8Array)).toEqual(Array.from(bytes))
  })

  test("buffers browser frames until the bridge socket opens", () => {
    const { handler, bridge, ws } = connectHarness()
    bridge.readyState = 0
    handler.message(asServerWs(ws), "early frame")
    expect(bridge.sent).toEqual([])
    bridge.emitOpen()
    expect(bridge.sent).toEqual(["early frame"])
  })

  test("propagates a browser close to the bridge", () => {
    const { handler, bridge, ws } = connectHarness()
    handler.close(asServerWs(ws))
    expect(bridge.closed).not.toBeNull()
  })

  test("propagates a bridge close (handoff) to the browser", () => {
    const { bridge, ws } = connectHarness()
    bridge.emitClose()
    expect(ws.closed).not.toBeNull()
  })

  test("does not echo a close back into a loop", () => {
    const { handler, bridge, ws } = connectHarness()
    handler.close(asServerWs(ws))
    const firstClose = ws.closed
    bridge.emitClose()
    expect(ws.closed).toBe(firstClose)
  })

  test("never logs the token when the bridge connection fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const handler = createVoiceProxyHandler("ws://127.0.0.1:18220", {
        connectBridge: () => {
          throw new Error("connection refused")
        },
      })
      const server = new FakeUpgradeServer()
      handleVoiceProxyUpgrade(
        new Request(`http://localhost${VOICE_PROXY_PATH}`),
        server,
        () => "secret-token",
      )
      const ws = new FakeServerSocket(server.upgraded as VoiceProxyData)
      handler.open(asServerWs(ws))
      const logged = warn.mock.calls.flat().join(" ")
      expect(logged).not.toContain("secret-token")
      expect(ws.closed).not.toBeNull()
    } finally {
      warn.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// Real network round-trip (Bun runtime only; skipped under Node vitest)
// ---------------------------------------------------------------------------

const hasBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"

describe.skipIf(!hasBun)("real Bun round-trip", () => {
  test("relays text and binary through a stub bridge", async () => {
    const received: Array<string | Uint8Array> = []
    const bridge = Bun.serve({
      port: 0,
      fetch(request, server) {
        if (server.upgrade(request)) return undefined
        return new Response("not found", { status: 404 })
      },
      websocket: {
        message(_ws, message) {
          received.push(typeof message === "string" ? message : new Uint8Array(message))
        },
      },
    })

    const proxy = createVoiceProxyHandler(`ws://127.0.0.1:${bridge.port}`)
    const server = Bun.serve({
      port: 0,
      fetch(request, srv) {
        return handleVoiceProxyUpgrade(request, srv, () => "tok") ?? new Response("not found", { status: 404 })
      },
      websocket: proxy,
    })

    const client = new WebSocket(`ws://127.0.0.1:${server.port}${VOICE_PROXY_PATH}`)
    client.binaryType = "arraybuffer"
    await new Promise<void>((resolve, reject) => {
      client.onopen = () => resolve()
      client.onerror = () => reject(new Error("client failed to open"))
    })

    client.send("hello")
    await waitFor(() => received.length === 1)
    expect(received[0]).toBe("hello")

    const bytes = new Uint8Array(new Int16Array([7, -7]).buffer)
    client.send(bytes)
    await waitFor(() => received.length === 2)
    expect(Array.from(received[1] as Uint8Array)).toEqual(Array.from(bytes))

    client.close()
    server.stop(true)
    bridge.stop(true)
  })
})

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
