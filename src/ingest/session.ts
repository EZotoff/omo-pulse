import * as fs from "node:fs"
import * as path from "node:path"
import { pickLatestModelString } from "./model"
import { getOpenCodeStorageDir, realpathSafe } from "./paths"

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
  status: "busy" | "idle" | "unknown" | "running_tool" | "thinking" | "question"
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

export function getMessageDir(messageStorage: string, sessionID: string): string {
  const directPath = path.join(messageStorage, sessionID)
  if (fs.existsSync(directPath)) return directPath

  try {
    for (const dir of fs.readdirSync(messageStorage)) {
      const sessionPath = path.join(messageStorage, dir, sessionID)
      if (fs.existsSync(sessionPath)) return sessionPath
    }
  } catch {
    return ""
  }

  return ""
}

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
          continue
        }
      }
    }
  } catch {
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
      const recent = readMostRecentMessageMeta(messageDir, 200)
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

function readLastToolPart(partStorage: string, messageID: string): { tool: string; status: string } | null {
  const partDir = path.join(partStorage, messageID)
  if (!fs.existsSync(partDir)) return null

  const files = fs.readdirSync(partDir).filter((f) => f.endsWith(".json")).sort()
  for (let i = files.length - 1; i >= 0; i--) {
    const file = files[i]
    try {
      const content = fs.readFileSync(path.join(partDir, file), "utf8")
      const part = JSON.parse(content) as Partial<StoredToolPart>
      if (part.type === "tool" && typeof part.tool === "string") {
        const status = (part as StoredToolPart).state?.status
        return { tool: part.tool, status: typeof status === "string" ? status : "unknown" }
      }
    } catch {
      continue
    }
  }
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
  const recent = readMostRecentMessageMeta(messageDir, 200)

  const lastUpdated = recent?.time?.created ?? null
  const sessionLabel = opts.sessionMeta?.title ?? opts.sessionId
  const agent = recent?.agent ?? "unknown"

  // Scan recent messages for any in-flight tool parts
  let activeTool: { tool: string; status: string } | null = null
  const recentMetas = readRecentMessageMetas(messageDir, 200)
  const currentModel = pickLatestModelString(recentMetas)
  
  // Iterate newest -> oldest, early-exit on first tool part with pending/running status
  for (const meta of recentMetas) {
    const toolPart = readLastToolPart(opts.storage.part, meta.id)
    if (toolPart && (toolPart.status === "pending" || toolPart.status === "running")) {
      activeTool = toolPart
      break
    }
  }

  // If the last activity is older than 2 min, a "running" tool or incomplete
  // assistant message is almost certainly a stale leftover from a crashed process.
  const ACTIVE_STALE_MS = 120_000
  const isStaleActivity = typeof lastUpdated === "number" && nowMs - lastUpdated > ACTIVE_STALE_MS

  let status: MainSessionView["status"] = "unknown"
  if (!isStaleActivity && (activeTool?.status === "pending" || activeTool?.status === "running")) {
    status = "running_tool"
  } else if (!isStaleActivity && recent?.role === "assistant" && typeof recent?.time?.created === "number" && typeof recent?.time?.completed !== "number") {
    status = "thinking"
  } else if (typeof lastUpdated === "number") {
    status = nowMs - lastUpdated <= 15_000 ? "busy" : "idle"
  }

  // Question detection: user sent a message with no subsequent assistant response
  if ((status === "busy" || status === "idle") && recent?.role === "user") {
    status = "question"
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
