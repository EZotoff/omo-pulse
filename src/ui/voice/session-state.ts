// Pure UI state for the voice widget.
//
// The hook (useVoiceSession) owns the WebSocket and audio graph; this module
// owns the frame → state transition and the two client-side send guards
// (view-context dedup, selection staleness). Keeping both pure makes the
// contract testable without a DOM or a live socket.

import type { ConnectionState, ServerVoiceFrame, ViewContextFrame } from "./protocol"

/** UI connection state. `offline` is the quiet terminal state (no error UI). */
export type VoiceUiConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "offline"

export type TranscriptRole = "user" | "assistant" | "system"

export type TranscriptEntry = {
  readonly role: TranscriptRole
  readonly text: string
}

export type VoiceUiState = {
  readonly state: VoiceUiConnectionState
  readonly transcript: readonly TranscriptEntry[]
  readonly confirmationPending: boolean
  readonly lastInterrupt: string | null
  readonly error: string | null
  /** contextTag of the most recent `show` frame, for selection staleness. */
  readonly lastShowContextTag: string | null
}

/**
 * Frames the reducer accepts: every parsed server frame, plus two synthetic
 * signals the hook raises locally — `handoff` (bridge kicked this client) and
 * `close` (socket closed) — and `system` for local transcript lines.
 */
export type VoiceReducerFrame =
  | ServerVoiceFrame
  | { readonly type: "handoff" }
  | { readonly type: "close" }
  | { readonly type: "system"; readonly text: string }

export const initialVoiceState: VoiceUiState = {
  state: "idle",
  transcript: [],
  confirmationPending: false,
  lastInterrupt: null,
  error: null,
  lastShowContextTag: null,
}

const mapConnectionState = (state: ConnectionState): VoiceUiConnectionState =>
  state === "closed" ? "offline" : state

const appendTranscript = (state: VoiceUiState, role: TranscriptRole, text: string): VoiceUiState => ({
  ...state,
  transcript: [...state.transcript, { role, text }],
})

const assertNever = (value: never): never => {
  throw new Error(`unhandled voice frame: ${JSON.stringify(value)}`)
}

/** Pure frame → state transition. Never mutates the input state. */
export function createVoiceReducer(state: VoiceUiState, frame: VoiceReducerFrame): VoiceUiState {
  switch (frame.type) {
    case "state":
      return { ...state, state: mapConnectionState(frame.state) }
    case "missed-audio":
      return appendTranscript(state, "system", `audio dropped: ${frame.dropped} bytes (overflow)`)
    case "transcript":
      return appendTranscript(state, frame.role, frame.text)
    case "confirmation-pending":
      return { ...state, confirmationPending: frame.pending }
    case "interrupt":
      return appendTranscript({ ...state, lastInterrupt: frame.reason }, "system", `interrupt: ${frame.reason}`)
    case "error":
      return appendTranscript({ ...state, state: "error", error: frame.message }, "system", `error: ${frame.message}`)
    case "show":
      return { ...state, lastShowContextTag: frame.contextTag }
    case "handoff":
      return { ...state, state: "offline", error: null }
    case "close":
      return { ...state, state: "offline" }
    case "system":
      return appendTranscript(state, "system", frame.text)
    default:
      return assertNever(frame)
  }
}

/**
 * Canonical JSON with object keys sorted recursively, so two structurally
 * equal frames compare equal regardless of key insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/** Stable identity of a view-context frame for dedup. */
export function viewContextKey(frame: ViewContextFrame): string {
  return canonicalJson(frame)
}

/** True when the frame differs from the last one sent (or none was sent). */
export function shouldSendViewContext(lastKey: string | null, frame: ViewContextFrame): boolean {
  return viewContextKey(frame) !== lastKey
}

/** True only when the selection belongs to the last show frame the hook saw. */
export function shouldSendSelection(lastShowContextTag: string | null, contextTag: string): boolean {
  return lastShowContextTag !== null && lastShowContextTag === contextTag
}
