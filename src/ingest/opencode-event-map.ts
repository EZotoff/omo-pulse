import type { OpenCodeEvent } from "./realtime-types"

/**
 * Event-type → freshness-relevance mapping for the OpenCode SSE pipeline.
 *
 * The dashboard derives all deep data from SQLite; SSE only decides *when* to
 * recompute. Only lifecycle events that can change derived data are relevant:
 *
 *   - `session.*`            (session.updated / session.status / session.idle / session.diff)
 *   - `message.updated`
 *   - `message.part.updated` (part lifecycle: tool / text / patch parts)
 *
 * Deliberately NOT relevant (per the work plan's decision):
 *   - `message.part.delta` — the real opencode streaming-delta kind (the plan's
 *     `text.delta`). It fires hundreds of times per turn and carries both
 *     `text` and `reasoning` fields; ignoring it here is what keeps the T4
 *     debounce from being fed a recompute storm.
 *   - `server.connected` / `server.heartbeat` / `file.watcher.updated` /
 *     `sync` / `tui.toast.show` — transport or unrelated signals.
 *   - any unknown kind — defaults to `false` so a new opencode event type can
 *     never cause a surprise invalidation.
 *
 * The mapper is pure and stateless.
 */

const RELEVANT_EXACT_KINDS = new Set<string>([
  "message.updated",
  "message.part.updated",
])

/** `session.*` lifecycle events are all freshness-relevant. */
function isSessionKind(kind: string): boolean {
  return kind.startsWith("session.")
}

/** True when an event should trigger a (debounced) cache invalidation. */
export function isFreshnessRelevant(event: OpenCodeEvent): boolean {
  const kind = event.kind
  if (!kind) return false
  return isSessionKind(kind) || RELEVANT_EXACT_KINDS.has(kind)
}

/**
 * Project root the event belongs to, or `null` when the event carries no
 * directory (e.g. `server.connected` / `server.heartbeat`).
 */
export function affectedProjectRoot(event: OpenCodeEvent): string | null {
  const directory = event.directory
  if (typeof directory !== "string") return null
  const trimmed = directory.trim()
  return trimmed.length > 0 ? trimmed : null
}
