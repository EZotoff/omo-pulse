import * as fs from "node:fs"
import * as path from "node:path"
import {
  hasFreshMainSessionActivity,
  isStaleQuestionTool,
  readToolStartTime,
  resolveLastUpdatedTime,
} from "./activity-status"
import { pickLatestModelString } from "./model"
import { getOpenCodeStorageDir, getMessageDir, realpathSafe } from "./paths"
import { deriveBackgroundTasks } from "./background-tasks"
import { deriveMainSessionStatus } from "./session-status"

const RECENT_MESSAGES_LIMIT = 200

export type SessionMetadata = {
  id: string
  projectID: string
  directory: string
  title?: string
  parentID?: string
  time: { created: number; updated: number }
}

export type StoredMessageMeta = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time?: { created: number; completed?: number }
  agent?: string
}

export type StoredToolPart = {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state: { status: "pending" | "running" | "completed" | "error"; input: Record<string, unknown> }
}

export type MainSessionView = {
  agent: string
  currentTool: string | null
  currentModel: string | null
  lastUpdated: number | null
  sessionLabel: string
  status: "busy" | "idle" | "unknown" | "running_tool" | "thinking" | "question" | "error"
}

export type OpenCodeStorageRoots = {
  session: string
  message: string
  part: string
}

export function getStorageRoots(storageRoot: string): OpenCodeStorageRoots {
  return {
    session: path.join(storageRoot, "session"),
    message: path.join(storageRoot, "message"),
    part: path.join(storageRoot, "part"),
  }
}

export function defaultStorageRoots(): OpenCodeStorageRoots {
  return getStorageRoots(getOpenCodeStorageDir())
}

export { getMessageDir } from "./paths"

export function sessionExists(messageStorage: string, sessionID: string): boolean {
  return getMessageDir(messageStorage, sessionID) !== ""
}

export function readMainSessionMetas(
  sessionStorage: string,
  directoryFilter?: string
): SessionMetadata[] {
  if (!fs.existsSync(sessionStorage)) return []

  const directoryNeedle = typeof directoryFilter === "string" && directoryFilter.length > 0
    ? ((): string => {
        const abs = path.resolve(directoryFilter)
        const real = realpathSafe(abs) ?? abs
        return path.normalize(real)
      })()
    : null

  const metas: SessionMetadata[] = []
  try {
    const projectDirs = fs.readdirSync(sessionStorage, { withFileTypes: true })
    for (const dirent of projectDirs) {
      if (!dirent.isDirectory()) continue
      const projectPath = path.join(sessionStorage, dirent.name)
      for (const file of fs.readdirSync(projectPath)) {
        if (!file.endsWith(".json")) continue
        try {
          const content = fs.readFileSync(path.join(projectPath, file), "utf8")
          const meta = JSON.parse(content) as SessionMetadata
          if (meta.parentID) continue

          if (directoryNeedle) {
            const metaAbs = path.resolve(meta.directory)
            const metaReal = realpathSafe(metaAbs) ?? metaAbs
            const metaDir = path.normalize(metaReal)
            if (metaDir !== directoryNeedle) continue
          }

          metas.push(meta)
        } catch {
          // Expected: file may not exist or be malformed
          continue
        }
      }
    }
  } catch {
    // Expected: file may not exist or be malformed
    return []
  }

  return metas.sort((a, b) => b.time.updated - a.time.updated)
}

export function pickActiveSessionId(opts: {
  projectRoot: string
  storage: OpenCodeStorageRoots
  boulderSessionIds?: string[]
}): string | null {
  const metas = readMainSessionMetas(opts.storage.session, opts.projectRoot)
  const metaById = new Map(metas.map((m) => [m.id, m] as const))

  let bestId: string | null = metas[0]?.id ?? null
  let bestUpdated = bestId ? (metaById.get(bestId)?.time.updated ?? -Infinity) : -Infinity
  let bestIsBoulder = false

  const consider = (candidateId: string, updatedAt: number, isBoulder: boolean): void => {
    if (!bestId) {
      bestId = candidateId
      bestUpdated = updatedAt
      bestIsBoulder = isBoulder
      return
    }
    if (updatedAt > bestUpdated) {
      bestId = candidateId
      bestUpdated = updatedAt
      bestIsBoulder = isBoulder
      return
    }
    if (updatedAt === bestUpdated && isBoulder && !bestIsBoulder) {
      bestId = candidateId
      bestUpdated = updatedAt
      bestIsBoulder = true
    }
  }

  const ids = opts.boulderSessionIds ?? []
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i]
    if (!sessionExists(opts.storage.message, id)) continue

    const meta = metaById.get(id)
    if (meta) {
      consider(id, meta.time.updated ?? meta.time.created ?? 0, true)
      continue
    }

    if (metas.length === 0) {
      const messageDir = getMessageDir(opts.storage.message, id)
      const recent = readMostRecentMessageMeta(messageDir, RECENT_MESSAGES_LIMIT)
      const created = typeof recent?.time?.created === "number" ? recent.time.created : 0
      consider(id, created, true)
    }
  }

  return bestId
}

function readMostRecentMessageMeta(messageDir: string, maxMessages: number): StoredMessageMeta | null {
  if (!messageDir || !fs.existsSync(messageDir)) return null

  const files = fs.readdirSync(messageDir).filter((f) => f.endsWith(".json"))
  const ranked = files
    .map((f) => ({
      f,
      mtime: (() => {
        try {
          return fs.statSync(path.join(messageDir, f)).mtimeMs
        } catch {
          // Expected: file may not exist or be malformed
          return 0
        }
      })(),
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, maxMessages)

  // Deterministic: parse meta.time.created and pick the newest.
  let best: { created: number; id: string; meta: StoredMessageMeta } | null = null
  for (const item of ranked) {
    try {
      const content = fs.readFileSync(path.join(messageDir, item.f), "utf8")
      const meta = JSON.parse(content) as StoredMessageMeta
      const created = meta.time?.created ?? 0
      const id = String(meta.id ?? "")
      if (!best || created > best.created || (created === best.created && id > best.id)) {
        best = { created, id, meta }
      }
    } catch {
      // Expected: file may not exist or be malformed
      continue
    }
  }

  return best?.meta ?? null
}

function readRecentMessageMetas(messageDir: string, maxMessages: number): StoredMessageMeta[] {
  if (!messageDir || !fs.existsSync(messageDir)) return []

  const files = fs.readdirSync(messageDir).filter((f) => f.endsWith(".json"))
  const ranked = files
    .map((f) => ({
      f,
      mtime: (() => {
        try {
          return fs.statSync(path.join(messageDir, f)).mtimeMs
        } catch {
          // Expected: file may not exist or be malformed
          return 0
        }
      })(),
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, maxMessages)

  const metas: { created: number; id: string; meta: StoredMessageMeta }[] = []
  for (const item of ranked) {
    try {
      const content = fs.readFileSync(path.join(messageDir, item.f), "utf8")
      const meta = JSON.parse(content) as StoredMessageMeta
      const created = meta.time?.created ?? 0
      const id = String(meta.id ?? "")
      metas.push({ created, id, meta })
    } catch {
      // Expected: file may not exist or be malformed
      continue
    }
  }

  return metas
    .sort((a, b) => {
      if (b.created !== a.created) return b.created - a.created
      return b.id.localeCompare(a.id)
    })
    .map(item => item.meta)
}

function readToolPartsForMessage(partStorage: string, messageID: string): Array<{ tool: string; status: string; startedAt: number | null }> {
  const partDir = path.join(partStorage, messageID)
  if (!fs.existsSync(partDir)) return []

  const files = fs.readdirSync(partDir).filter((f) => f.endsWith(".json")).sort()
  const parts: Array<{ tool: string; status: string; startedAt: number | null }> = []
  for (let i = files.length - 1; i >= 0; i--) {
    const file = files[i]
    try {
      const content = fs.readFileSync(path.join(partDir, file), "utf8")
      const part = JSON.parse(content) as Partial<StoredToolPart>
      if (part.type === "tool" && typeof part.tool === "string") {
        const status = (part as StoredToolPart).state?.status
        parts.push({ tool: part.tool, status: typeof status === "string" ? status : "unknown", startedAt: readToolStartTime(part) })
      }
    } catch {
      // Expected: file may not exist or be malformed
      continue
    }
  }
  return parts
}

function messageTerminalToolStatus(partStorage: string, messageID: string): "error" | "completed" | null {
  const partDir = path.join(partStorage, messageID)
  if (!fs.existsSync(partDir)) return null

  let hasError = false
  let hasCompleted = false
  const files = fs.readdirSync(partDir).filter((f) => f.endsWith(".json"))
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(partDir, file), "utf8")
      const part = JSON.parse(content) as Partial<StoredToolPart>
      if (part.type === "tool") {
        if (part.state?.status === "error") hasError = true
        else if (part.state?.status === "completed") hasCompleted = true
      }
    } catch {
      // Expected: file may not exist or be malformed
      continue
    }
  }

  if (hasError) return "error"
  if (hasCompleted) return "completed"
  return null
}

export function getMainSessionView(opts: {
  projectRoot: string
  sessionId: string
  storage: OpenCodeStorageRoots
  sessionMeta?: SessionMetadata | null
  nowMs?: number
}): MainSessionView {
  const nowMs = opts.nowMs ?? Date.now()

  const messageDir = getMessageDir(opts.storage.message, opts.sessionId)
  const recent = readMostRecentMessageMeta(messageDir, RECENT_MESSAGES_LIMIT)

  const lastUpdated = resolveLastUpdatedTime(recent?.time?.created ?? null, opts.sessionMeta?.time.updated ?? null)
  const sessionLabel = opts.sessionMeta?.title ?? opts.sessionId
  const agent = recent?.agent ?? "unknown"

  // Scan recent messages for any in-flight tool parts
  let activeTool: { tool: string; status: string } | null = null
  const recentMetas = readRecentMessageMetas(messageDir, RECENT_MESSAGES_LIMIT)
  const currentModel = pickLatestModelString(recentMetas)
  
  // Iterate newest -> oldest, early-exit on first tool part with pending/running status
  for (const meta of recentMetas) {
    for (const toolPart of readToolPartsForMessage(opts.storage.part, meta.id)) {
      if (toolPart.status !== "pending" && toolPart.status !== "running") continue
      if (isStaleQuestionTool(toolPart.tool, toolPart.status, toolPart.startedAt ?? meta.time?.created ?? null, nowMs)) {
        continue
      }
      activeTool = toolPart
      break
    }
    if (activeTool) break
  }

  let latestTerminalStatus: "error" | "completed" | null = null
  let latestTerminalAt: number | null = null
  if (!activeTool) {
    for (const meta of recentMetas) {
      const terminal = messageTerminalToolStatus(opts.storage.part, meta.id)
      if (terminal !== null) {
        latestTerminalStatus = terminal
        latestTerminalAt = typeof meta.time?.created === "number" ? meta.time.created : null
        break
      }
    }
  }

  const hasFreshActivity = hasFreshMainSessionActivity(lastUpdated, nowMs)
  const isStaleActivity = typeof lastUpdated === "number" && !hasFreshActivity

  const derived = deriveMainSessionStatus({
    activeTool,
    hasFreshActivity,
    isStaleActivity,
    latestTerminalStatus,
    latestTerminalAt,
    recentRole: recent?.role ?? null,
    recentTimeCreated: typeof recent?.time?.created === "number" ? recent.time.created : null,
    recentTimeCompleted: typeof recent?.time?.completed === "number" ? recent.time.completed : null,
    lastUpdated,
    nowMs,
  })
  let status = derived.status
  activeTool = derived.activeTool

  if (status === "idle" || status === "busy" || status === "unknown") {
    const bgTasks = deriveBackgroundTasks({
      storage: opts.storage,
      mainSessionId: opts.sessionId,
      nowMs,
    })
    const questionTask = bgTasks.find((t) => t.status === "question")
    if (questionTask) {
      status = "question"
      if (!activeTool) activeTool = { tool: questionTask.lastTool ?? "question", status: "running" }
    } else if (bgTasks.some((t) => t.status === "running" || t.status === "queued")) {
      status = "running_tool"
      if (!activeTool) activeTool = { tool: "task", status: "running" }
    }
  }

  return {
    agent,
    currentTool: activeTool?.tool ?? null,
    currentModel,
    lastUpdated,
    sessionLabel,
    status,
  }
}
