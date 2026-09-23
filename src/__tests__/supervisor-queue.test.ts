import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { readSupervisorQueueProjection, supervisorStateDir } from "../ingest/supervisor-queue"

const fixtureDir = path.join(import.meta.dirname, "fixtures", "supervisor")
const originalOverride = process.env.OMO_PULSE_SUPERVISOR_STATE_DIR
const originalXdg = process.env.XDG_STATE_HOME
let temporaryDir: string

beforeEach(() => {
  temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "supervisor-queue-test-"))
  process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = fixtureDir
  delete process.env.XDG_STATE_HOME
})

afterEach(() => {
  fs.rmSync(temporaryDir, { recursive: true, force: true })
  if (originalOverride === undefined) delete process.env.OMO_PULSE_SUPERVISOR_STATE_DIR
  else process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = originalOverride
  if (originalXdg === undefined) delete process.env.XDG_STATE_HOME
  else process.env.XDG_STATE_HOME = originalXdg
})

describe("supervisor queue projection", () => {
  it("preserves insertion order and projects typed priority and citations when the queue is valid", () => {
    // Given: the live-shaped fixture contains terminal and open items in insertion order.
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: supported items and their consumed fields are returned without re-ranking.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items.map((item) => item.id)).toEqual(["att_resolved", "att_open", "att_answered"])
    expect(result.items[1]).toMatchObject({
      version: 2, decisionKey: "decision-open", kind: "decision", actionClass: "ESCALATE",
      question: "Open question", rationale: "Waiting for approval",
      citations: [{ session: "ses_two", messageID: "msg_two", quote: "Approve?" }],
      target: { root: "/projects/two", sessionID: "ses_two", sessionTitle: "Second session" },
      priority: { stakes: 3, urgency: 2, confidence: 0.8, freshness: 1, createdAt: "2026-09-21T10:16:39.158Z", notBefore: "2026-09-21T10:17:39.158Z" },
    })
    expect(result.source).toBe("queue.json")
    expect(result.readAtMs).toEqual(expect.any(Number))
  })

  it("uses the last lifecycle event to classify resolved and answered items", () => {
    // Given: items with proposed events followed by terminal events.
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: only the last event determines terminal status.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items.map(({ lifecycleState, isResolved }) => ({ lifecycleState, isResolved }))).toEqual([
      { lifecycleState: "resolved", isResolved: true },
      { lifecycleState: "revalidated", isResolved: false },
      { lifecycleState: "answered", isResolved: true },
    ])
  })

  it("returns telemetry from status.json when present", () => {
    // Given: a status file alongside the queue.
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: status fields needed by the UI are projected.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status).toEqual({ lastReconcile: "2026-09-23T19:42:30.894Z", queueDepths: { "/projects/two": 1 }, modes: { "/projects/two": "observe" } })
  })

  it("returns null status when status.json is absent", () => {
    // Given: a valid queue with no status file.
    fs.copyFileSync(path.join(fixtureDir, "queue.json"), path.join(temporaryDir, "queue.json"))
    process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = temporaryDir
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: absent telemetry does not invalidate the queue.
    expect(result.ok && result.status).toBeNull()
  })

  it("returns null status when status.json is corrupt", () => {
    // Given: a valid queue and invalid telemetry JSON.
    fs.copyFileSync(path.join(fixtureDir, "queue.json"), path.join(temporaryDir, "queue.json"))
    fs.writeFileSync(path.join(temporaryDir, "status.json"), "{")
    process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = temporaryDir
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: corrupt telemetry does not invalidate the queue.
    expect(result.ok && result.status).toBeNull()
  })

  it("skips unsupported item versions and tolerates extra fields", () => {
    // Given: a v2 item and a v1 item with an unknown field.
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: v2 is skipped and the v1 item remains without unknown data.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items.map((item) => item.id)).not.toContain("att_future")
    expect(result.items[1]).not.toHaveProperty("futureField")
  })

  it("treats unknown lifecycle states as open", () => {
    // Given: an additive lifecycle event after an answered event.
    const queue = JSON.parse(fs.readFileSync(path.join(fixtureDir, "queue.json"), "utf8"))
    queue.items[2].lifecycle.push({ state: "reopened" })
    fs.writeFileSync(path.join(temporaryDir, "queue.json"), JSON.stringify(queue))
    process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = temporaryDir
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: the unknown final state is passed through as open.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.items[2]).toMatchObject({ lifecycleState: "reopened", isResolved: false })
  })

  it("returns absent for a missing supervisor directory", () => {
    // Given: a missing directory.
    process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = path.join(temporaryDir, "missing")
    // When: the projection is read.
    const result = readSupervisorQueueProjection()
    // Then: a typed failure is returned, without creating the directory.
    expect(result).toEqual({ ok: false, reason: "absent" })
    expect(fs.existsSync(process.env.OMO_PULSE_SUPERVISOR_STATE_DIR)).toBe(false)
  })

  it("returns corrupt for invalid queue JSON", () => {
    // Given: an invalid queue fixture.
    process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = path.join(fixtureDir, "corrupt")
    // When: the projection is read.
    // Then: parse failure does not escape.
    expect(readSupervisorQueueProjection()).toEqual({ ok: false, reason: "corrupt" })
  })

  it("returns shape for a queue without an items array", () => {
    // Given: valid JSON with the wrong top-level shape.
    fs.writeFileSync(path.join(temporaryDir, "queue.json"), '{"items":{}}')
    process.env.OMO_PULSE_SUPERVISOR_STATE_DIR = temporaryDir
    // When: the projection is read.
    // Then: invalid shape is a typed failure.
    expect(readSupervisorQueueProjection()).toEqual({ ok: false, reason: "shape" })
  })

  it("resolves the override or XDG default state directory", () => {
    // Given: an explicit override, then an XDG state home.
    // When: the directory is resolved for each environment.
    const override = supervisorStateDir()
    delete process.env.OMO_PULSE_SUPERVISOR_STATE_DIR
    process.env.XDG_STATE_HOME = temporaryDir
    const xdg = supervisorStateDir()
    delete process.env.XDG_STATE_HOME
    const fallback = supervisorStateDir()
    // Then: each directory follows the configured precedence.
    expect(override).toBe(fixtureDir)
    expect(xdg).toBe(path.join(temporaryDir, "opencode-supervisor"))
    expect(fallback).toBe(path.join(os.homedir(), ".local", "state", "opencode-supervisor"))
  })
})
