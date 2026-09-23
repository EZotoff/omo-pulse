import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createOpenCodeSseClient } from "../ingest/opencode-sse-client"
import { readRealtimeConfig } from "../ingest/realtime-config"
import type { OpenCodeEvent } from "../ingest/realtime-types"

const sample = [
  { directory: "/workspace/one", payload: { type: "session.updated", properties: { info: { id: "ses_one" } } }, seq: 41 },
  { directory: "/workspace/one", payload: { type: "message.updated", properties: { info: { sessionID: "ses_one" } } }, seq: 42 },
  { directory: "/workspace/two", payload: { type: "part.updated", properties: { part: { sessionID: "ses_two" } } }, seq: 43 },
]

function streamResponse(frames: string[], signal: AbortSignal): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () => controller.close(), { once: true })
      for (const frame of frames) {
        const midpoint = Math.floor(frame.length / 2)
        controller.enqueue(encoder.encode(frame.slice(0, midpoint)))
        controller.enqueue(encoder.encode(frame.slice(midpoint)))
      }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
}

function frame(value: unknown): string {
  return `event: message\r\ndata: ${JSON.stringify(value)}\r\n\r\n`
}

describe("OpenCode SSE client", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("normalizes recorded global-event envelopes without inventing a sequence", async () => {
    const fixture = readFileSync(new URL("./fixtures/opencode-events/synthetic-sample.jsonl", import.meta.url), "utf8")
    const frames = fixture.trim().split("\n").map((line) => `${line}\n\n`)
    const received: OpenCodeEvent[] = []
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(streamResponse(frames, init?.signal ?? new AbortController().signal)),
    )
    const client = createOpenCodeSseClient({ fetcher })
    client.subscribe((event) => received.push(event))

    client.start()
    await vi.waitFor(() => expect(received).toHaveLength(frames.length - 2))

    expect(received[0]).toMatchObject({ kind: "session.updated", sessionId: "ses_test_alpha", directory: "/home/user/project-alpha" })
    expect(received[1]).toMatchObject({ kind: "message.updated", sessionId: "ses_test_alpha" })
    expect(received[2]).toMatchObject({ kind: "message.part.updated", sessionId: "ses_test_alpha" })
    expect(received[0]?.seq).toBeUndefined()
    client.stop()
  })

  it("emits normalized fixture events in order when SSE chunks split frames", async () => {
    const received: OpenCodeEvent[] = []
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(streamResponse([": heartbeat\r\n\r\n", ...sample.map(frame)], init?.signal ?? new AbortController().signal)),
    )
    const client = createOpenCodeSseClient({ endpoint: "http://127.0.0.1:4096", fetcher })
    client.subscribe((event) => received.push(event))

    client.start()
    await vi.waitFor(() => expect(received).toHaveLength(3))

    expect(received.map(({ kind, sessionId, directory, seq }) => ({ kind, sessionId, directory, seq }))).toEqual([
      { kind: "session.updated", sessionId: "ses_one", directory: "/workspace/one", seq: 41 },
      { kind: "message.updated", sessionId: "ses_one", directory: "/workspace/one", seq: 42 },
      { kind: "part.updated", sessionId: "ses_two", directory: "/workspace/two", seq: 43 },
    ])
    expect(received.every(({ ts }) => Number.isFinite(ts))).toBe(true)
    expect(client.getState()).toBe("connected")
    client.stop()
  })

  it("reconnects with after=last-seq and skips duplicate replay events", async () => {
    let calls = 0
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      calls++
      if (calls === 1) {
        return Promise.resolve(new Response(frame(sample[0]) + frame(sample[1]), { headers: { "Content-Type": "text/event-stream" } }))
      }
      return Promise.resolve(streamResponse([frame(sample[1]), frame(sample[2])], init?.signal ?? new AbortController().signal))
    })
    const received: number[] = []
    const client = createOpenCodeSseClient({ endpoint: "http://127.0.0.1:4096", fetcher, retryBaseMs: 1 })
    client.subscribe((event) => { if (event.seq !== undefined) received.push(event.seq) })

    client.start()
    await vi.waitFor(() => expect(received).toEqual([41, 42, 43]))

    expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.get("after")).toBe("42")
    client.stop()
  })

  it("aborts the live stream and prevents reconnect after stop", async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(streamResponse([frame(sample[0])], init?.signal ?? new AbortController().signal)),
    )
    const client = createOpenCodeSseClient({ endpoint: "http://127.0.0.1:4096", fetcher })

    client.start()
    await vi.waitFor(() => expect(client.getState()).toBe("connected"))
    const signal = fetcher.mock.calls[0]?.[1]?.signal
    client.stop()

    expect(signal?.aborted).toBe(true)
    expect(client.getState()).toBe("down")
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  })

  it("reports down without throwing when the endpoint is unreachable", async () => {
    const client = createOpenCodeSseClient({ endpoint: "http://127.0.0.1:9", retryBaseMs: 10_000 })

    client.start()
    await vi.waitFor(() => expect(client.getState()).toBe("down"))

    client.stop()
  })

  it("sends a Basic Authorization header when credentials are configured", async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(streamResponse([frame(sample[0])], init?.signal ?? new AbortController().signal)),
    )
    const client = createOpenCodeSseClient({
      endpoint: "http://127.0.0.1:4096",
      fetcher,
      authHeader: "Basic dGVzdDpzZWNyZXQ=",
    })

    client.start()
    await vi.waitFor(() => expect(client.getState()).toBe("connected"))

    const headers = fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Basic dGVzdDpzZWNyZXQ=")
    expect(headers.Accept).toBe("text/event-stream")
    client.stop()
  })

  it("omits the Authorization header when no credentials are configured", async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(streamResponse([frame(sample[0])], init?.signal ?? new AbortController().signal)),
    )
    const client = createOpenCodeSseClient({ endpoint: "http://127.0.0.1:4096", fetcher, authHeader: null })

    client.start()
    await vi.waitFor(() => expect(client.getState()).toBe("connected"))

    const headers = fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    client.stop()
  })

  it("derives a Basic auth header from OPENCODE_SERVER_USERNAME and OPENCODE_SERVER_PASSWORD", () => {
    vi.stubEnv("OPENCODE_SERVER_USERNAME", "user")
    vi.stubEnv("OPENCODE_SERVER_PASSWORD", "pass")

    expect(readRealtimeConfig().opencodeAuthHeader).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`)
  })

  it("reconnects when an open stream goes silent (silence watchdog)", async () => {
    vi.useFakeTimers()
    let calls = 0
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      calls++
      // Every connection emits its frames immediately, then goes silent.
      return Promise.resolve(streamResponse([frame(sample[0])], init?.signal ?? new AbortController().signal))
    })
    const client = createOpenCodeSseClient({ endpoint: "http://127.0.0.1:4096", fetcher, retryBaseMs: 1 })
    client.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(client.getState()).toBe("connected")
    expect(calls).toBe(1)

    // No bytes for longer than the silence window -> the watchdog cancels the
    // reader and the client reconnects.
    await vi.advanceTimersByTimeAsync(46_000)
    expect(calls).toBeGreaterThanOrEqual(2)

    client.stop()
    vi.useRealTimers()
  })
})
