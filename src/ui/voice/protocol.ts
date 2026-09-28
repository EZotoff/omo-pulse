// Wire protocol codec for the voice-bridge client.
//
// Ported from voice-bridge/src/server/protocol.ts and
// voice-bridge/src/pipeline/show.ts. This module owns the dash-side copy of the
// contract so the dashboard never imports from the bridge repo. Binary
// WebSocket frames carry raw PCM and are out of scope here; this file is the
// pure JSON text-frame codec.

export const SHOW_VIEWS = ["card", "list", "table", "choice", "progress", "comparison", "diff"] as const
export type ShowView = (typeof SHOW_VIEWS)[number]

export const SESSION_STATES = ["waiting", "running", "error"] as const
export type VoiceSessionState = (typeof SESSION_STATES)[number]

export const VIEW_CONTEXT_VIEWS = ["home", "project", "session", "comparison", "attention"] as const
export type ViewContextView = (typeof VIEW_CONTEXT_VIEWS)[number]

export const SELECTION_KINDS = ["card", "option", "row"] as const
export type SelectionKind = (typeof SELECTION_KINDS)[number]

export const CONNECTION_STATES = ["idle", "connecting", "connected", "reconnecting", "error", "closed"] as const
export type ConnectionState = (typeof CONNECTION_STATES)[number]

export type VoiceSelection = {
  readonly kind: SelectionKind
  readonly id: string
  readonly label: string
}

export type RecentEntry = {
  readonly projectId: string
  readonly sessionId: string
}

export type ViewContextFrame = {
  readonly type: "view-context"
  readonly project: { readonly id: string; readonly name: string }
  readonly session: { readonly id: string; readonly title: string; readonly state: VoiceSessionState }
  readonly view: ViewContextView
  readonly selection?: VoiceSelection
  readonly recent: readonly RecentEntry[]
}

export type SelectionFrame = {
  readonly type: "selection"
  readonly contextTag: string
  readonly index: number
}

export type ClientVoiceFrame =
  | { readonly type: "inputComplete" }
  | { readonly type: "text"; readonly text: string }
  | ViewContextFrame
  | SelectionFrame

export type ShowFrame = {
  readonly type: "show"
  readonly view: ShowView
  readonly title: string
  readonly contextTag: string
  readonly payload: Record<string, unknown>
}

export type ServerVoiceFrame =
  | { readonly type: "state"; readonly state: ConnectionState }
  | { readonly type: "missed-audio"; readonly dropped: number }
  | { readonly type: "transcript"; readonly role: "user" | "assistant"; readonly text: string }
  | { readonly type: "confirmation-pending"; readonly pending: boolean }
  | { readonly type: "interrupt"; readonly reason: string }
  | { readonly type: "error"; readonly message: string }
  | ShowFrame

const object = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Object(value) : undefined

const isConnectionState = (value: unknown): value is ConnectionState =>
  CONNECTION_STATES.some((state) => state === value)
const isSessionState = (value: unknown): value is VoiceSessionState =>
  SESSION_STATES.some((state) => state === value)
const isViewContextView = (value: unknown): value is ViewContextView =>
  VIEW_CONTEXT_VIEWS.some((view) => view === value)
const isSelectionKind = (value: unknown): value is SelectionKind =>
  SELECTION_KINDS.some((kind) => kind === value)
const isShowView = (value: unknown): value is ShowView => SHOW_VIEWS.some((view) => view === value)
const isTranscriptRole = (value: unknown): value is "user" | "assistant" =>
  value === "user" || value === "assistant"

const CONTEXT_TAG = /^ctx-\d+$/

/** Parse a client text frame. Returns the frame or null when malformed. */
export function parseClientFrame(raw: string): ClientVoiceFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const frame = object(parsed)
  if (frame === undefined) {
    return null
  }
  const type = frame["type"]
  if (type === "inputComplete") {
    return { type: "inputComplete" }
  }
  if (type === "text" && typeof frame["text"] === "string") {
    return { type: "text", text: frame["text"] }
  }
  if (type === "selection" && typeof frame["contextTag"] === "string" && CONTEXT_TAG.test(frame["contextTag"]) &&
    typeof frame["index"] === "number" && Number.isInteger(frame["index"]) && frame["index"] >= 0) {
    return { type: "selection", contextTag: frame["contextTag"], index: frame["index"] }
  }
  if (type === "view-context") {
    const project = object(frame["project"])
    const session = object(frame["session"])
    const selection = frame["selection"] === undefined ? undefined : object(frame["selection"])
    const recent = frame["recent"]
    if (typeof project?.["id"] !== "string" || typeof project["name"] !== "string" ||
      typeof session?.["id"] !== "string" || typeof session["title"] !== "string" ||
      !isSessionState(session["state"]) || !isViewContextView(frame["view"]) ||
      !Array.isArray(recent) || recent.length > 5 || recent.some((entry: unknown) => {
        const value = object(entry)
        return typeof value?.["projectId"] !== "string" || typeof value["sessionId"] !== "string"
      })) return null
    if (frame["selection"] !== undefined && (typeof selection?.["id"] !== "string" ||
      typeof selection["label"] !== "string" || !isSelectionKind(selection["kind"]))) return null
    const parsedSelection = selection !== undefined && typeof selection["id"] === "string" &&
      typeof selection["label"] === "string" && isSelectionKind(selection["kind"])
      ? { kind: selection["kind"], id: selection["id"], label: selection["label"] } : undefined
    return {
      type: "view-context",
      project: { id: project["id"], name: project["name"] },
      session: { id: session["id"], title: session["title"], state: session["state"] },
      view: frame["view"],
      ...(parsedSelection === undefined ? {} : { selection: parsedSelection }),
      recent: recent.map((entry: unknown) => {
        const value = object(entry)
        return { projectId: String(value?.["projectId"]), sessionId: String(value?.["sessionId"]) }
      }),
    }
  }
  return null
}

/** Parse a server text frame. Returns the frame or null when malformed. */
export function parseServerFrame(raw: string): ServerVoiceFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const frame = object(parsed)
  if (frame === undefined) {
    return null
  }
  const type = frame["type"]
  if (type === "state" && isConnectionState(frame["state"])) {
    return { type: "state", state: frame["state"] }
  }
  if (type === "missed-audio" && typeof frame["dropped"] === "number" && Number.isFinite(frame["dropped"])) {
    return { type: "missed-audio", dropped: frame["dropped"] }
  }
  if (type === "transcript" && isTranscriptRole(frame["role"]) && typeof frame["text"] === "string") {
    return { type: "transcript", role: frame["role"], text: frame["text"] }
  }
  if (type === "confirmation-pending" && typeof frame["pending"] === "boolean") {
    return { type: "confirmation-pending", pending: frame["pending"] }
  }
  if (type === "interrupt" && typeof frame["reason"] === "string") {
    return { type: "interrupt", reason: frame["reason"] }
  }
  if (type === "error" && typeof frame["message"] === "string") {
    return { type: "error", message: frame["message"] }
  }
  if (type === "show") {
    const payload = object(frame["payload"])
    if (!isShowView(frame["view"]) || typeof frame["title"] !== "string" ||
      typeof frame["contextTag"] !== "string" || !CONTEXT_TAG.test(frame["contextTag"]) ||
      payload === undefined) return null
    return { type: "show", view: frame["view"], title: frame["title"], contextTag: frame["contextTag"], payload }
  }
  return null
}

export type ViewContextInput = {
  readonly project: { readonly id: string; readonly name: string }
  readonly session: { readonly id: string; readonly title: string; readonly state: VoiceSessionState }
  readonly view: ViewContextView
  readonly selection?: VoiceSelection
  readonly recent: readonly RecentEntry[]
}

/** Build a view-context frame in the canonical shape the bridge accepts. */
export function buildViewContextFrame(input: ViewContextInput): ViewContextFrame {
  return {
    type: "view-context",
    project: { id: input.project.id, name: input.project.name },
    session: { id: input.session.id, title: input.session.title, state: input.session.state },
    view: input.view,
    ...(input.selection === undefined
      ? {}
      : { selection: { kind: input.selection.kind, id: input.selection.id, label: input.selection.label } }),
    recent: input.recent.map((entry) => ({ projectId: entry.projectId, sessionId: entry.sessionId })),
  }
}

/** Build a selection frame in the canonical shape the bridge accepts. */
export function buildSelectionFrame(contextTag: string, index: number): SelectionFrame {
  return { type: "selection", contextTag, index }
}

/**
 * Read the selectable collection from a show payload, mirroring
 * ShowRegistry.select: options, then rows, then items. Returns [] when none.
 */
export function getSelectableOptions(payload: Record<string, unknown>): unknown[] {
  const choices = payload["options"] ?? payload["rows"] ?? payload["items"]
  return Array.isArray(choices) ? choices : []
}

export const isChoicePayload = (payload: Record<string, unknown>): payload is { options: unknown[] } =>
  Array.isArray(payload["options"])
export const isTablePayload = (payload: Record<string, unknown>): payload is { rows: unknown[] } =>
  Array.isArray(payload["rows"])
export const isListPayload = (payload: Record<string, unknown>): payload is { items: unknown[] } =>
  Array.isArray(payload["items"])
