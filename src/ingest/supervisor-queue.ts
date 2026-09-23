/**
 * Read-only supervisor projection. Queue file order is insertion order, not
 * priority order; terminal items remain in the file. Consumers filter and
 * order for display, but never mutate the supervisor's lifecycle or files.
 */
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { SupervisorQueueItem, SupervisorQueuePayload, SupervisorQueueStatus } from "../types"
import { expandTilde } from "./paths"

type QueueResult =
  | ({ readonly ok: true } & SupervisorQueuePayload)
  | { readonly ok: false; readonly reason: "absent" | "corrupt" | "shape" }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function projectItem(value: unknown): SupervisorQueueItem | null {
  const item = object(value)
  if (!item || item.schemaVersion !== 1 || typeof item.id !== "string" ||
      typeof item.decisionKey !== "string" || typeof item.kind !== "string") return null

  const decision = object(object(item.origin)?.decision)
  const target = object(item.target)
  const priority = object(item.priority)
  const lifecycle = Array.isArray(item.lifecycle) ? item.lifecycle : []
  const lastEvent = object(lifecycle.at(-1))
  const lifecycleState = optionalString(lastEvent?.state) ?? "unknown"
  const actionClass = optionalString(item.actionClass)
  const escalationKind = optionalString(item.escalationKind)
  const question = optionalString(item.question)
  const rationale = optionalString(item.rationale ?? decision?.rationale)
  const citations = Array.isArray(decision?.citations) ? decision.citations.flatMap((value: unknown) => {
    const citation = object(value)
    return citation && typeof citation.session === "string" &&
      typeof citation.messageID === "string" && typeof citation.quote === "string"
      ? [{ session: citation.session, messageID: citation.messageID, quote: citation.quote }]
      : []
  }) : undefined

  return {
    id: item.id,
    decisionKey: item.decisionKey,
    kind: item.kind,
    ...(optionalNumber(item.version) !== undefined && { version: optionalNumber(item.version) }),
    ...(actionClass !== undefined && { actionClass }),
    ...(escalationKind !== undefined && { escalationKind }),
    ...(question !== undefined && { question }),
    ...(rationale !== undefined && { rationale }),
    ...(citations && { citations }),
    ...(target && typeof target.root === "string" && { target: {
      root: target.root,
      ...(optionalString(target.sessionID) !== undefined && { sessionID: optionalString(target.sessionID) }),
      ...(optionalString(target.sessionTitle) !== undefined && { sessionTitle: optionalString(target.sessionTitle) }),
    } }),
    ...(priority && { priority: {
      ...(optionalNumber(priority.stakes) !== undefined && { stakes: optionalNumber(priority.stakes) }),
      ...(optionalNumber(priority.urgency) !== undefined && { urgency: optionalNumber(priority.urgency) }),
      ...(optionalNumber(priority.confidence) !== undefined && { confidence: optionalNumber(priority.confidence) }),
      ...(optionalNumber(priority.freshness) !== undefined && { freshness: optionalNumber(priority.freshness) }),
      ...(optionalString(priority.createdAt) !== undefined && { createdAt: optionalString(priority.createdAt) }),
      ...(optionalString(priority.notBefore) !== undefined && { notBefore: optionalString(priority.notBefore) }),
    } }),
    lifecycleState,
    isResolved: lifecycleState === "resolved" || lifecycleState === "answered",
  }
}

function projectStatus(value: unknown): SupervisorQueueStatus | null {
  const status = object(value)
  if (!status) return null
  const depths = object(status.queueDepths)
  const modes = object(status.modes)
  return {
    ...(optionalString(status.lastReconcile) !== undefined && { lastReconcile: optionalString(status.lastReconcile) }),
    ...(depths && { queueDepths: Object.fromEntries(Object.entries(depths).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) }),
    ...(modes && { modes: Object.fromEntries(Object.entries(modes).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }),
  }
}

export function supervisorStateDir(): string {
  const home = os.homedir()
  const override = process.env.OMO_PULSE_SUPERVISOR_STATE_DIR
  const stateHome = process.env.XDG_STATE_HOME
  return override
    ? expandTilde(override, home)
    : path.join(stateHome ? expandTilde(stateHome, home) : path.join(home, ".local", "state"), "opencode-supervisor")
}

export function readSupervisorQueueProjection(): QueueResult {
  const directory = supervisorStateDir()
  let queue: unknown
  try {
    queue = JSON.parse(fs.readFileSync(path.join(directory, "queue.json"), "utf8"))
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, reason: "corrupt" }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { ok: false, reason: "absent" }
    return { ok: false, reason: "corrupt" }
  }

  const parsed = object(queue)
  if (!parsed || !Array.isArray(parsed.items)) return { ok: false, reason: "shape" }
  let status: SupervisorQueueStatus | null = null
  try {
    status = projectStatus(JSON.parse(fs.readFileSync(path.join(directory, "status.json"), "utf8")))
  } catch {
    // Optional telemetry must never invalidate a valid queue projection.
    status = null
  }
  return {
    ok: true,
    items: parsed.items.flatMap((item: unknown) => {
      const projected = projectItem(item)
      return projected ? [projected] : []
    }),
    status,
    readAtMs: Date.now(),
    source: "queue.json",
  }
}
