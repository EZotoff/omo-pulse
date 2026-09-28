import { describe, expect, it } from "vitest"
import {
  buildViewContextFrame,
  parseServerFrame,
  type ServerVoiceFrame,
  type ViewContextInput,
} from "../ui/voice/protocol"
import {
  createVoiceReducer,
  initialVoiceState,
  shouldSendSelection,
  shouldSendViewContext,
  viewContextKey,
  type VoiceReducerFrame,
  type VoiceUiState,
} from "../ui/voice/session-state"

/** Parse a literal server frame, failing loudly when the codec rejects it. */
function frame(raw: string): ServerVoiceFrame {
  const parsed = parseServerFrame(raw)
  if (parsed === null) throw new Error(`unparseable frame: ${raw}`)
  return parsed
}

function reduce(events: readonly VoiceReducerFrame[]): VoiceUiState {
  return events.reduce(createVoiceReducer, initialVoiceState)
}

const VIEW_CONTEXT_INPUT: ViewContextInput = {
  project: { id: "veran", name: "Veran" },
  session: { id: "ses_1", title: "retrieval architecture", state: "running" },
  view: "attention",
  recent: [{ projectId: "veran", sessionId: "ses_1" }],
}

describe("createVoiceReducer — lifecycle", () => {
  it("starts idle with an empty transcript", () => {
    expect(initialVoiceState.state).toBe("idle")
    expect(initialVoiceState.transcript).toEqual([])
    expect(initialVoiceState.confirmationPending).toBe(false)
    expect(initialVoiceState.lastInterrupt).toBeNull()
    expect(initialVoiceState.error).toBeNull()
  })

  it("maps every server state frame onto the local state machine", () => {
    expect(createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"connecting"}')).state).toBe("connecting")
    expect(createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"connected"}')).state).toBe("connected")
    expect(createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"reconnecting"}')).state).toBe("reconnecting")
    expect(createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"error"}')).state).toBe("error")
    expect(createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"closed"}')).state).toBe("offline")
  })

  it("goes offline quietly on a handoff close (no error UI)", () => {
    const connected = createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"connected"}'))
    const closed = createVoiceReducer(connected, { type: "handoff" })
    expect(closed.state).toBe("offline")
    expect(closed.error).toBeNull()
  })

  it("goes offline on a plain socket close", () => {
    const connected = createVoiceReducer(initialVoiceState, frame('{"type":"state","state":"connected"}'))
    expect(createVoiceReducer(connected, { type: "close" }).state).toBe("offline")
  })

  it("appends a local system line", () => {
    const state = createVoiceReducer(initialVoiceState, { type: "system", text: "audio suspended" })
    expect(state.transcript).toEqual([{ role: "system", text: "audio suspended" }])
  })
})

describe("createVoiceReducer — server frames", () => {
  it("appends transcript entries in order", () => {
    const state = reduce([
      frame('{"type":"transcript","role":"user","text":"hello"}'),
      frame('{"type":"transcript","role":"assistant","text":"hi there"}'),
    ])
    expect(state.transcript).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "hi there" },
    ])
  })

  it("surfaces missed audio as a system line", () => {
    const state = createVoiceReducer(initialVoiceState, frame('{"type":"missed-audio","dropped":4096}'))
    expect(state.transcript).toEqual([{ role: "system", text: "audio dropped: 4096 bytes (overflow)" }])
  })

  it("toggles confirmation-pending both ways", () => {
    const pending = createVoiceReducer(initialVoiceState, frame('{"type":"confirmation-pending","pending":true}'))
    expect(pending.confirmationPending).toBe(true)
    const cleared = createVoiceReducer(pending, frame('{"type":"confirmation-pending","pending":false}'))
    expect(cleared.confirmationPending).toBe(false)
  })

  it("records the last interrupt and appends a system line", () => {
    const state = createVoiceReducer(initialVoiceState, frame('{"type":"interrupt","reason":"barge-in"}'))
    expect(state.lastInterrupt).toBe("barge-in")
    expect(state.transcript).toEqual([{ role: "system", text: "interrupt: barge-in" }])
  })

  it("records the error, enters the error state, and appends a system line", () => {
    const state = createVoiceReducer(initialVoiceState, frame('{"type":"error","message":"bridge down"}'))
    expect(state.error).toBe("bridge down")
    expect(state.state).toBe("error")
    expect(state.transcript).toEqual([{ role: "system", text: "error: bridge down" }])
  })

  it("tracks the last show contextTag", () => {
    const state = createVoiceReducer(
      initialVoiceState,
      frame('{"type":"show","view":"choice","title":"Pick","contextTag":"ctx-3","payload":{"options":[]}}'),
    )
    expect(state.lastShowContextTag).toBe("ctx-3")
  })

  it("does not mutate the previous state", () => {
    const before = initialVoiceState
    const after = createVoiceReducer(before, frame('{"type":"transcript","role":"user","text":"hi"}'))
    expect(before.transcript).toHaveLength(0)
    expect(after.transcript).toHaveLength(1)
    expect(after).not.toBe(before)
  })
})

describe("view-context dedup", () => {
  it("sends the first frame, suppresses an identical one, sends on change", () => {
    const ctx = buildViewContextFrame(VIEW_CONTEXT_INPUT)
    expect(shouldSendViewContext(null, ctx)).toBe(true)
    expect(shouldSendViewContext(viewContextKey(ctx), ctx)).toBe(false)
    const changed = buildViewContextFrame({ ...VIEW_CONTEXT_INPUT, view: "session" })
    expect(shouldSendViewContext(viewContextKey(ctx), changed)).toBe(true)
  })

  it("treats a reordered-but-equal frame as identical (canonical equality)", () => {
    const ctx = buildViewContextFrame(VIEW_CONTEXT_INPUT)
    const rebuilt = buildViewContextFrame({
      recent: VIEW_CONTEXT_INPUT.recent,
      view: VIEW_CONTEXT_INPUT.view,
      session: VIEW_CONTEXT_INPUT.session,
      project: VIEW_CONTEXT_INPUT.project,
    })
    expect(viewContextKey(rebuilt)).toBe(viewContextKey(ctx))
    expect(shouldSendViewContext(viewContextKey(ctx), rebuilt)).toBe(false)
  })
})

describe("selection staleness", () => {
  it("drops a selection before any show frame is seen", () => {
    expect(shouldSendSelection(null, "ctx-1")).toBe(false)
  })

  it("accepts a selection matching the last show frame and drops others", () => {
    const shown = createVoiceReducer(
      initialVoiceState,
      frame('{"type":"show","view":"choice","title":"Pick","contextTag":"ctx-1","payload":{"options":[]}}'),
    )
    expect(shouldSendSelection(shown.lastShowContextTag, "ctx-1")).toBe(true)
    expect(shouldSendSelection(shown.lastShowContextTag, "ctx-2")).toBe(false)
  })
})
