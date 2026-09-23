import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { affectedProjectRoot, isFreshnessRelevant } from "../ingest/opencode-event-map"
import type { OpenCodeEvent } from "../ingest/realtime-types"

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(here, "fixtures/opencode-events/real-sample.jsonl")

type RawFrame = {
  directory?: string
  project?: string
  payload?: {
    id?: string
    type?: string
    properties?: Record<string, unknown>
    syncEvent?: { seq?: number }
  }
}

/** Parse the recorded `data: {...}` SSE frames into raw frame objects. */
function loadFrames(): RawFrame[] {
  return readFileSync(FIXTURE_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length).trim()) as RawFrame)
}

/**
 * Minimal raw-frame → OpenCodeEvent normalization, mirroring what the T1 SSE
 * client produces. Kept local so this test does not depend on T1.
 */
function normalize(frame: RawFrame): OpenCodeEvent {
  const payload = frame.payload ?? {}
  const properties = payload.properties ?? {}
  const sessionId = typeof properties.sessionID === "string" ? properties.sessionID : undefined
  const seq = typeof payload.syncEvent?.seq === "number" ? payload.syncEvent.seq : undefined
  return {
    kind: typeof payload.type === "string" ? payload.type : "unknown",
    sessionId,
    directory: frame.directory,
    seq,
    ts: 0,
  }
}

function eventByKind(kind: string): OpenCodeEvent {
  const frame = loadFrames().find((f) => f.payload?.type === kind)
  if (!frame) throw new Error(`fixture missing event kind: ${kind}`)
  return normalize(frame)
}

describe("opencode-event-map", () => {
  it("loads the recorded fixture as parseable SSE frames", () => {
    const frames = loadFrames()
    expect(frames.length).toBeGreaterThanOrEqual(15)
    for (const frame of frames) {
      expect(typeof frame.payload?.type).toBe("string")
    }
  })

  it("classifies session/message/part lifecycle events as freshness-relevant", () => {
    const relevantKinds = [
      "session.updated",
      "session.status",
      "session.idle",
      "session.diff",
      "message.updated",
      "message.part.updated",
    ]
    for (const kind of relevantKinds) {
      expect(isFreshnessRelevant(eventByKind(kind)), kind).toBe(true)
    }
  })

  it("resolves the affected project root for relevant events", () => {
    expect(affectedProjectRoot(eventByKind("session.updated"))).toBe("/home/user/project-alpha")
    expect(affectedProjectRoot(eventByKind("message.updated"))).toBe("/home/user/project-alpha")
    expect(affectedProjectRoot(eventByKind("message.part.updated"))).toBe("/home/user/project-alpha")
    expect(affectedProjectRoot(eventByKind("session.status"))).toBe("/home/user/project-alpha")
  })

  it("ignores high-frequency streaming deltas (text and reasoning)", () => {
    const deltas = loadFrames()
      .filter((f) => f.payload?.type === "message.part.delta")
      .map(normalize)
    expect(deltas.length).toBeGreaterThanOrEqual(2)
    for (const delta of deltas) {
      expect(isFreshnessRelevant(delta)).toBe(false)
    }
  })

  it("ignores transport and unrelated events", () => {
    const ignoredKinds = [
      "server.connected",
      "server.heartbeat",
      "file.watcher.updated",
      "sync",
      "tui.toast.show",
    ]
    for (const kind of ignoredKinds) {
      expect(isFreshnessRelevant(eventByKind(kind)), kind).toBe(false)
    }
  })

  it("returns null project root for events without a directory", () => {
    expect(affectedProjectRoot(eventByKind("server.connected"))).toBeNull()
    expect(affectedProjectRoot(eventByKind("server.heartbeat"))).toBeNull()
  })

  it("defaults unknown event kinds to not-relevant without throwing", () => {
    const unknown: OpenCodeEvent = { kind: "something.new.v2", ts: 0 }
    expect(() => isFreshnessRelevant(unknown)).not.toThrow()
    expect(isFreshnessRelevant(unknown)).toBe(false)
    expect(affectedProjectRoot(unknown)).toBeNull()
  })
})
