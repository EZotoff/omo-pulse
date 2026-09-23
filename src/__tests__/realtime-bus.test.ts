import { describe, expect, it } from "vitest"
import { createRealtimeBus } from "../ingest/realtime-types"
import type { OpenCodeEvent } from "../ingest/realtime-types"
import { readRealtimeConfig } from "../ingest/realtime-config"

function makeEvent(kind: string, seq: number): OpenCodeEvent {
  return { kind, sessionId: "ses_test", directory: "/tmp/proj", seq, ts: 1_700_000_000_000 + seq }
}

describe("createRealtimeBus", () => {
  it("fans out each published event to every subscriber, in publish order", () => {
    const bus = createRealtimeBus()
    const first: OpenCodeEvent[] = []
    const second: OpenCodeEvent[] = []

    bus.subscribe((e) => first.push(e))
    bus.subscribe((e) => second.push(e))

    const a = makeEvent("session.updated", 1)
    const b = makeEvent("message.updated", 2)
    bus.publish(a)
    bus.publish(b)

    expect(first).toEqual([a, b])
    expect(second).toEqual([a, b])
    // Same event reference delivered to both listeners.
    expect(first[0]).toBe(a)
    expect(second[0]).toBe(a)
  })

  it("stops delivery after unsubscribe", () => {
    const bus = createRealtimeBus()
    const received: OpenCodeEvent[] = []
    const unsubscribe = bus.subscribe((e) => received.push(e))

    bus.publish(makeEvent("session.updated", 1))
    unsubscribe()
    bus.publish(makeEvent("session.updated", 2))

    expect(received).toHaveLength(1)
    expect(received[0]?.seq).toBe(1)
  })

  it("tolerates repeated unsubscribe calls", () => {
    const bus = createRealtimeBus()
    const received: OpenCodeEvent[] = []
    const unsubscribe = bus.subscribe((e) => received.push(e))

    unsubscribe()
    unsubscribe()
    bus.publish(makeEvent("session.updated", 1))

    expect(received).toHaveLength(0)
  })

  it("keeps other subscribers alive when one unsubscribes", () => {
    const bus = createRealtimeBus()
    const kept: OpenCodeEvent[] = []
    const dropped: OpenCodeEvent[] = []

    const unsubscribeDropped = bus.subscribe((e) => dropped.push(e))
    bus.subscribe((e) => kept.push(e))

    unsubscribeDropped()
    bus.publish(makeEvent("part.updated", 7))

    expect(dropped).toHaveLength(0)
    expect(kept).toHaveLength(1)
  })
})

describe("readRealtimeConfig", () => {
  it("returns plan defaults when env vars are unset", () => {
    const saved = {
      enabled: process.env.OMO_PULSE_OPENCODE_SSE_ENABLED,
      endpoint: process.env.OMO_PULSE_OPENCODE_ENDPOINT,
      debounce: process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS,
    }
    delete process.env.OMO_PULSE_OPENCODE_SSE_ENABLED
    delete process.env.OMO_PULSE_OPENCODE_ENDPOINT
    delete process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS

    try {
      const config = readRealtimeConfig()
      expect(config.sseEnabled).toBe(true)
      expect(config.opencodeEndpoint).toBe("http://127.0.0.1:4096")
      expect(config.debounceMs).toBe(300)
    } finally {
      if (saved.enabled !== undefined) process.env.OMO_PULSE_OPENCODE_SSE_ENABLED = saved.enabled
      if (saved.endpoint !== undefined) process.env.OMO_PULSE_OPENCODE_ENDPOINT = saved.endpoint
      if (saved.debounce !== undefined) process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS = saved.debounce
    }
  })

  it("honors env overrides and rejects invalid debounce values", () => {
    const saved = {
      enabled: process.env.OMO_PULSE_OPENCODE_SSE_ENABLED,
      endpoint: process.env.OMO_PULSE_OPENCODE_ENDPOINT,
      debounce: process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS,
    }
    process.env.OMO_PULSE_OPENCODE_SSE_ENABLED = "false"
    process.env.OMO_PULSE_OPENCODE_ENDPOINT = "http://127.0.0.1:9999"
    process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS = "not-a-number"

    try {
      const config = readRealtimeConfig()
      expect(config.sseEnabled).toBe(false)
      expect(config.opencodeEndpoint).toBe("http://127.0.0.1:9999")
      expect(config.debounceMs).toBe(300)
    } finally {
      if (saved.enabled !== undefined) process.env.OMO_PULSE_OPENCODE_SSE_ENABLED = saved.enabled
      else delete process.env.OMO_PULSE_OPENCODE_SSE_ENABLED
      if (saved.endpoint !== undefined) process.env.OMO_PULSE_OPENCODE_ENDPOINT = saved.endpoint
      else delete process.env.OMO_PULSE_OPENCODE_ENDPOINT
      if (saved.debounce !== undefined) process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS = saved.debounce
      else delete process.env.OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS
    }
  })
})
