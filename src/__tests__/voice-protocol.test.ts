import { describe, expect, it } from "vitest"

import {
  buildSelectionFrame,
  buildViewContextFrame,
  getSelectableOptions,
  isChoicePayload,
  isListPayload,
  isTablePayload,
  parseClientFrame,
  parseServerFrame,
  type ViewContextFrame,
} from "../ui/voice/protocol"

/**
 * Literal example frames mirroring the bridge wire contract
 * (voice-bridge/src/server/protocol.ts + pipeline/show.ts). These are the
 * round-trip fixtures: the codec must accept exactly what the bridge emits.
 */
const BRIDGE_STATE = '{"type":"state","state":"connected"}'
const BRIDGE_TRANSCRIPT = '{"type":"transcript","role":"assistant","text":"hello there"}'
const BRIDGE_SHOW_CARD =
  '{"type":"show","view":"card","title":"Deploy","contextTag":"ctx-3","payload":{"options":[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"}]}}'
const BRIDGE_CONFIRMATION = '{"type":"confirmation-pending","pending":true}'

describe("parseServerFrame — valid frames", () => {
  it("parses a state frame", () => {
    expect(parseServerFrame(BRIDGE_STATE)).toEqual({ type: "state", state: "connected" })
  })

  it("parses a transcript frame", () => {
    expect(parseServerFrame(BRIDGE_TRANSCRIPT)).toEqual({
      type: "transcript",
      role: "assistant",
      text: "hello there",
    })
  })

  it("parses a show card frame with ctx-3", () => {
    expect(parseServerFrame(BRIDGE_SHOW_CARD)).toEqual({
      type: "show",
      view: "card",
      title: "Deploy",
      contextTag: "ctx-3",
      payload: { options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
    })
  })

  it("parses a confirmation-pending frame", () => {
    expect(parseServerFrame(BRIDGE_CONFIRMATION)).toEqual({
      type: "confirmation-pending",
      pending: true,
    })
  })

  it("parses missed-audio, interrupt and error frames", () => {
    expect(parseServerFrame('{"type":"missed-audio","dropped":12}')).toEqual({
      type: "missed-audio",
      dropped: 12,
    })
    expect(parseServerFrame('{"type":"interrupt","reason":"barge-in"}')).toEqual({
      type: "interrupt",
      reason: "barge-in",
    })
    expect(parseServerFrame('{"type":"error","message":"boom"}')).toEqual({
      type: "error",
      message: "boom",
    })
  })
})

describe("parseServerFrame — malformed input returns null", () => {
  it("rejects invalid JSON", () => {
    expect(parseServerFrame("{not json")).toBeNull()
  })

  it("rejects non-object JSON", () => {
    expect(parseServerFrame("42")).toBeNull()
    expect(parseServerFrame("[]")).toBeNull()
    expect(parseServerFrame("null")).toBeNull()
  })

  it("rejects an unknown frame type", () => {
    expect(parseServerFrame('{"type":"nope"}')).toBeNull()
  })

  it("rejects an unknown connection state", () => {
    expect(parseServerFrame('{"type":"state","state":"bogus"}')).toBeNull()
  })

  it("rejects a show frame with an unknown view", () => {
    expect(
      parseServerFrame('{"type":"show","view":"garbage","title":"x","contextTag":"ctx-1","payload":{}}'),
    ).toBeNull()
  })

  it("rejects a show frame with a bad contextTag", () => {
    expect(
      parseServerFrame('{"type":"show","view":"card","title":"x","contextTag":"ctx-x","payload":{}}'),
    ).toBeNull()
  })

  it("rejects a transcript frame with an unknown role", () => {
    expect(parseServerFrame('{"type":"transcript","role":"system","text":"x"}')).toBeNull()
  })
})

describe("parseClientFrame — valid frames", () => {
  it("parses inputComplete and text", () => {
    expect(parseClientFrame('{"type":"inputComplete"}')).toEqual({ type: "inputComplete" })
    expect(parseClientFrame('{"type":"text","text":"hi"}')).toEqual({ type: "text", text: "hi" })
  })

  it("parses a selection frame", () => {
    expect(parseClientFrame('{"type":"selection","contextTag":"ctx-3","index":1}')).toEqual({
      type: "selection",
      contextTag: "ctx-3",
      index: 1,
    })
  })

  it("parses a view-context frame", () => {
    const raw = JSON.stringify({
      type: "view-context",
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "voice widget", state: "running" },
      view: "session",
      selection: { kind: "card", id: "c1", label: "Card one" },
      recent: [{ projectId: "p1", sessionId: "s1" }],
    })
    expect(parseClientFrame(raw)).toEqual({
      type: "view-context",
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "voice widget", state: "running" },
      view: "session",
      selection: { kind: "card", id: "c1", label: "Card one" },
      recent: [{ projectId: "p1", sessionId: "s1" }],
    })
  })
})

describe("parseClientFrame — malformed input returns null", () => {
  it("rejects a selection with a bad contextTag", () => {
    expect(parseClientFrame('{"type":"selection","contextTag":"ctx-x","index":0}')).toBeNull()
  })

  it("rejects a selection with a negative or non-integer index", () => {
    expect(parseClientFrame('{"type":"selection","contextTag":"ctx-1","index":-1}')).toBeNull()
    expect(parseClientFrame('{"type":"selection","contextTag":"ctx-1","index":1.5}')).toBeNull()
  })

  it("rejects a view-context with more than 5 recent entries", () => {
    const raw = JSON.stringify({
      type: "view-context",
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "t", state: "waiting" },
      view: "home",
      recent: Array.from({ length: 6 }, (_, i) => ({ projectId: `p${i}`, sessionId: `s${i}` })),
    })
    expect(parseClientFrame(raw)).toBeNull()
  })

  it("rejects a view-context with an unknown view", () => {
    const raw = JSON.stringify({
      type: "view-context",
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "t", state: "waiting" },
      view: "garbage",
      recent: [],
    })
    expect(parseClientFrame(raw)).toBeNull()
  })

  it("rejects a view-context with an unknown session state", () => {
    const raw = JSON.stringify({
      type: "view-context",
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "t", state: "bogus" },
      view: "home",
      recent: [],
    })
    expect(parseClientFrame(raw)).toBeNull()
  })

  it("rejects a view-context with an unknown selection kind", () => {
    const raw = JSON.stringify({
      type: "view-context",
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "t", state: "waiting" },
      view: "home",
      selection: { kind: "widget", id: "x", label: "y" },
      recent: [],
    })
    expect(parseClientFrame(raw)).toBeNull()
  })
})

describe("builders round-trip through parseClientFrame", () => {
  it("buildSelectionFrame produces a frame the bridge parser accepts", () => {
    const frame = buildSelectionFrame("ctx-3", 2)
    expect(frame).toEqual({ type: "selection", contextTag: "ctx-3", index: 2 })
    expect(parseClientFrame(JSON.stringify(frame))).toEqual(frame)
  })

  it("buildViewContextFrame produces a frame the bridge parser accepts", () => {
    const frame = buildViewContextFrame({
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "voice widget", state: "running" },
      view: "session",
      selection: { kind: "option", id: "o1", label: "Option one" },
      recent: [{ projectId: "p1", sessionId: "s1" }],
    })
    expect(parseClientFrame(JSON.stringify(frame))).toEqual(frame)
  })

  it("omits selection when not provided", () => {
    const frame: ViewContextFrame = buildViewContextFrame({
      project: { id: "p1", name: "omo-pulse" },
      session: { id: "s1", title: "t", state: "waiting" },
      view: "home",
      recent: [],
    })
    expect("selection" in frame).toBe(false)
    expect(parseClientFrame(JSON.stringify(frame))).toEqual(frame)
  })
})

describe("getSelectableOptions + per-view payload guards", () => {
  it("reads options, rows or items in precedence order", () => {
    expect(getSelectableOptions({ options: [1, 2] })).toEqual([1, 2])
    expect(getSelectableOptions({ rows: ["r"] })).toEqual(["r"])
    expect(getSelectableOptions({ items: [{ id: "i" }] })).toEqual([{ id: "i" }])
    expect(getSelectableOptions({ options: [1], rows: [2] })).toEqual([1])
  })

  it("returns an empty array when no selectable array is present", () => {
    expect(getSelectableOptions({})).toEqual([])
    expect(getSelectableOptions({ options: "not-an-array" })).toEqual([])
  })

  it("guards choice, table and list payloads", () => {
    expect(isChoicePayload({ options: [] })).toBe(true)
    expect(isChoicePayload({ rows: [] })).toBe(false)
    expect(isTablePayload({ rows: [] })).toBe(true)
    expect(isTablePayload({ options: [] })).toBe(false)
    expect(isListPayload({ items: [] })).toBe(true)
    expect(isListPayload({ rows: [] })).toBe(false)
  })
})
