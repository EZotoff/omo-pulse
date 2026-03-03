#!/usr/bin/env bun
/**
 * Seeds a synthetic SQLite database with 10 OpenCode projects (one per session
 * status) and launches the dashboard against it. A tick loop refreshes active
 * states so every status indicator can be visually verified in the real UI.
 *
 * Usage:  bun scripts/test-env.ts
 */

import { Database } from "bun:sqlite"
import * as fs from "node:fs"
import * as path from "node:path"
import * as crypto from "node:crypto"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_DATA_DIR = "/tmp/omo-dash-test"
const TEST_DB_DIR = path.join(TEST_DATA_DIR, "opencode")
const TEST_DB_PATH = path.join(TEST_DB_DIR, "opencode.db")
const TEST_STORAGE_DIR = path.join(TEST_DATA_DIR, "opencode", "storage")
const TEST_PROJECTS_DIR = "/tmp/omo-test-projects"

const API_PORT = 51244
const API_BASE = `http://127.0.0.1:${API_PORT}`
const HEALTH_URL = `${API_BASE}/api/health`
const SOURCES_URL = `${API_BASE}/api/sources`

const TICK_INTERVAL_MS = 3_000
const HEALTH_POLL_INTERVAL_MS = 500
const HEALTH_POLL_TIMEOUT_MS = 30_000

const PLAN_STALE_OFFSET_MS = 45 * 60 * 1000

const PROJECT_ROOT = path.resolve(import.meta.dir, "..")

// ---------------------------------------------------------------------------
// Project definitions
// ---------------------------------------------------------------------------

type ProjectDef = {
  name: string
  timeOffsetMs: number
  messages: Array<{
    role: "user" | "assistant"
    completed: boolean
    agent?: string
  }>
  parts: Array<{
    messageIndex: number
    tool: string
    status: "pending" | "running" | "completed" | "error"
  }>
  plan?: {
    allComplete: boolean
    stale: boolean
    totalSteps: number
    completedSteps: number
  }
}

// Status trigger conditions (see sqlite-derive.ts:352-427):
//  idle:         15s < msg age ≤ 5min, completed assistant msg
//  busy:         msg age ≤ 15s, completed assistant msg
//  thinking:     msg age ≤ 5min, assistant msg WITHOUT time.completed
//  running_tool: msg age ≤ 5min, part with status "running" or "pending"
//  question:     msg age ≤ 5min, last msg role=user (overrides busy/idle)
//  error:        msg age ≤ 5min, part with status "error", no active tool
//  unknown:      msg age > 5min
//  plan_complete: idle + boulder planComplete=true (injected server-side)
const PROJECTS: ProjectDef[] = [
  {
    name: "test-idle",
    timeOffsetMs: 30_000,
    messages: [{ role: "assistant", completed: true, agent: "sisyphus" }],
    parts: [],
  },
  {
    name: "test-busy",
    timeOffsetMs: 5_000,
    messages: [{ role: "assistant", completed: true, agent: "sisyphus" }],
    parts: [],
  },
  {
    name: "test-thinking",
    timeOffsetMs: 5_000,
    messages: [{ role: "assistant", completed: false, agent: "prometheus" }],
    parts: [],
  },
  {
    name: "test-running-tool",
    timeOffsetMs: 5_000,
    messages: [{ role: "assistant", completed: true, agent: "sisyphus" }],
    parts: [{ messageIndex: 0, tool: "bash", status: "running" }],
  },
  {
    name: "test-question",
    timeOffsetMs: 5_000,
    messages: [
      { role: "assistant", completed: true, agent: "sisyphus" },
      { role: "user", completed: true },
    ],
    parts: [],
  },
  {
    name: "test-error",
    timeOffsetMs: 5_000,
    messages: [{ role: "assistant", completed: true, agent: "atlas" }],
    parts: [{ messageIndex: 0, tool: "edit", status: "error" }],
  },
  {
    name: "test-unknown",
    timeOffsetMs: 600_000,
    messages: [],
    parts: [],
  },
  {
    name: "test-plan-complete",
    timeOffsetMs: 30_000,
    messages: [{ role: "assistant", completed: true, agent: "sisyphus" }],
    parts: [],
    plan: { allComplete: true, stale: false, totalSteps: 5, completedSteps: 5 },
  },
  {
    name: "test-plan-in-progress",
    timeOffsetMs: 30_000,
    messages: [{ role: "assistant", completed: true, agent: "prometheus" }],
    parts: [],
    plan: { allComplete: false, stale: false, totalSteps: 8, completedSteps: 3 },
  },
  {
    name: "test-plan-stale",
    timeOffsetMs: 30_000,
    messages: [{ role: "assistant", completed: true, agent: "sisyphus" }],
    parts: [],
    plan: { allComplete: false, stale: true, totalSteps: 6, completedSteps: 2 },
  },
]

const ACTIVE_PROJECT_NAMES = new Set([
  "test-busy",
  "test-thinking",
  "test-running-tool",
  "test-question",
  "test-error",
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

function createDatabase(): Database {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true })
  const db = new Database(TEST_DB_PATH)
  db.run("PRAGMA journal_mode=wal")

  db.run(`CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    worktree TEXT,
    name TEXT
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    parent_id TEXT,
    directory TEXT,
    title TEXT,
    time_created REAL,
    time_updated REAL
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    time_created REAL,
    data TEXT
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS part (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    session_id TEXT,
    time_created REAL,
    data TEXT
  )`)

  return db
}

// ---------------------------------------------------------------------------
// Plan filesystem artifacts
// ---------------------------------------------------------------------------

function createPlanArtifacts(projectDir: string, plan: NonNullable<ProjectDef["plan"]>): void {
  const planName = "test-plan"
  const sisyphusDir = path.join(projectDir, ".sisyphus")
  const plansDir = path.join(sisyphusDir, "plans")
  fs.mkdirSync(plansDir, { recursive: true })

  const planPath = path.join(plansDir, `${planName}.md`)

  const boulderState = {
    active_plan: planPath,
    started_at: new Date().toISOString(),
    session_ids: [],
    plan_name: planName,
  }
  fs.writeFileSync(path.join(sisyphusDir, "boulder.json"), JSON.stringify(boulderState, null, 2))

  const lines: string[] = [`# Plan: ${planName}`, ""]
  for (let i = 0; i < plan.totalSteps; i++) {
    const checked = i < plan.completedSteps
    lines.push(`- [${checked ? "x" : " "}] Step ${i + 1}: Do something`)
  }
  fs.writeFileSync(planPath, lines.join("\n"))

  if (plan.stale) {
    const staleTime = new Date(Date.now() - PLAN_STALE_OFFSET_MS)
    fs.utimesSync(planPath, staleTime, staleTime)
  }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

type ProjectRecord = {
  name: string
  projectDir: string
  sessionId: string
  messageIds: string[]
  def: ProjectDef
}

function buildMessageData(
  msg: ProjectDef["messages"][number],
  createdMs: number,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    role: msg.role,
    time: msg.completed
      ? { created: createdMs, completed: createdMs + 100 }
      : { created: createdMs },
  }
  if (msg.agent) data.agent = msg.agent
  return data
}

function seedProjects(db: Database): ProjectRecord[] {
  const records: ProjectRecord[] = []
  const now = Date.now()

  const insertProject = db.prepare("INSERT INTO project (id, worktree, name) VALUES (?, ?, ?)")
  const insertSession = db.prepare("INSERT INTO session (id, project_id, parent_id, directory, title, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?)")
  const insertMessage = db.prepare("INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)")
  const insertPart = db.prepare("INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)")

  for (const def of PROJECTS) {
    const projectId = uuid()
    const sessionId = uuid()
    const projectDir = path.join(TEST_PROJECTS_DIR, def.name)
    fs.mkdirSync(projectDir, { recursive: true })

    insertProject.run(projectId, projectDir, def.name)

    const sessionUpdatedMs = now - def.timeOffsetMs
    const sessionCreatedMs = sessionUpdatedMs - 60_000

    insertSession.run(
      sessionId, projectId, null, projectDir,
      `Session for ${def.name}`, sessionCreatedMs, sessionUpdatedMs,
    )

    const messageIds: string[] = []
    for (let i = 0; i < def.messages.length; i++) {
      const msgId = uuid()
      messageIds.push(msgId)
      const msgCreatedMs = now - def.timeOffsetMs + i * 1000
      const msgData = buildMessageData(def.messages[i], msgCreatedMs)
      insertMessage.run(msgId, sessionId, msgCreatedMs, JSON.stringify(msgData))
    }

    for (const partDef of def.parts) {
      const partId = uuid()
      const msgId = messageIds[partDef.messageIndex]
      const partCreatedMs = now - def.timeOffsetMs + 500
      const partData = {
        type: "tool" as const,
        callID: uuid(),
        tool: partDef.tool,
        state: { status: partDef.status, input: { command: "echo hello" } },
      }
      insertPart.run(partId, msgId, sessionId, partCreatedMs, JSON.stringify(partData))
    }

    if (def.plan) createPlanArtifacts(projectDir, def.plan)

    records.push({ name: def.name, projectDir, sessionId, messageIds, def })
  }

  return records
}

// ---------------------------------------------------------------------------
// Tick loop
// ---------------------------------------------------------------------------

function refreshActiveTimestamps(db: Database, records: ProjectRecord[]): void {
  const now = Date.now()
  const updateSession = db.prepare("UPDATE session SET time_updated = ? WHERE id = ?")
  const updateMessage = db.prepare("UPDATE message SET time_created = ?, data = ? WHERE id = ?")

  for (const rec of records) {
    if (!ACTIVE_PROJECT_NAMES.has(rec.name)) continue

    const newTimeMs = now - rec.def.timeOffsetMs
    updateSession.run(newTimeMs, rec.sessionId)

    for (let i = 0; i < rec.messageIds.length; i++) {
      const msgCreatedMs = newTimeMs + i * 1000
      const msgData = buildMessageData(rec.def.messages[i], msgCreatedMs)
      updateMessage.run(msgCreatedMs, JSON.stringify(msgData), rec.messageIds[i])
    }
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean }
        if (body.ok) {
          console.log("[test-env] API server healthy")
          return
        }
      }
    } catch {
      // not ready yet
    }
    await Bun.sleep(HEALTH_POLL_INTERVAL_MS)
  }
  throw new Error(`[test-env] API server did not become healthy within ${HEALTH_POLL_TIMEOUT_MS}ms`)
}

// ---------------------------------------------------------------------------
// Source registration
// ---------------------------------------------------------------------------

async function registerSources(records: ProjectRecord[]): Promise<void> {
  for (const rec of records) {
    try {
      const res = await fetch(SOURCES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectRoot: rec.projectDir, label: rec.name }),
      })
      const body = (await res.json()) as { ok?: boolean; sourceId?: string; error?: string }
      if (!body.ok) {
        console.warn(`[test-env] Failed to register source ${rec.name}: ${body.error}`)
      } else {
        console.log(`[test-env] Registered source: ${rec.name} → ${body.sourceId}`)
      }
    } catch (err) {
      console.warn(`[test-env] Error registering source ${rec.name}:`, err)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[test-env] Starting test environment...")

  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  if (fs.existsSync(TEST_PROJECTS_DIR)) fs.rmSync(TEST_PROJECTS_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DB_DIR, { recursive: true })
  fs.mkdirSync(TEST_PROJECTS_DIR, { recursive: true })
  fs.mkdirSync(path.join(TEST_STORAGE_DIR, "dashboard"), { recursive: true })

  console.log("[test-env] Creating database:", TEST_DB_PATH)
  const db = createDatabase()
  const records = seedProjects(db)
  console.log(`[test-env] Seeded ${records.length} projects`)

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    XDG_DATA_HOME: TEST_DATA_DIR,
  }

  console.log("[test-env] Launching API server...")
  const apiProc = Bun.spawn(["bun", "run", "src/server/dev.ts"], {
    cwd: PROJECT_ROOT,
    env,
    stdout: "inherit",
    stderr: "inherit",
  })

  console.log("[test-env] Launching Vite dev server...")
  const viteProc = Bun.spawn(["bunx", "vite"], {
    cwd: PROJECT_ROOT,
    env,
    stdout: "inherit",
    stderr: "inherit",
  })

  const childProcesses = [apiProc, viteProc]

  let shuttingDown = false
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log("\n[test-env] Shutting down...")
    if (tickTimer !== null) clearInterval(tickTimer)
    for (const proc of childProcesses) {
      try { proc.kill() } catch { /* already dead */ }
    }
    try { db.close() } catch { /* already closed */ }
    console.log("[test-env] Cleanup complete")
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await waitForHealth()
  await registerSources(records)

  console.log(`[test-env] Starting tick loop (${TICK_INTERVAL_MS}ms interval)`)
  console.log("[test-env] Active projects:", [...ACTIVE_PROJECT_NAMES].join(", "))
  console.log(`[test-env] Dashboard: http://localhost:5173`)
  console.log("[test-env] Press Ctrl+C to stop\n")

  tickTimer = setInterval(() => {
    try {
      refreshActiveTimestamps(db, records)
    } catch (err) {
      console.error("[test-env] Tick error:", err)
    }
  }, TICK_INTERVAL_MS)

  await new Promise(() => {})
}

main().catch((err) => {
  console.error("[test-env] Fatal error:", err)
  process.exit(1)
})
