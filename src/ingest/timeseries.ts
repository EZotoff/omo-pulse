import * as fs from "node:fs"
import * as path from "node:path"
import type { OpenCodeStorageRoots, StoredMessageMeta } from "./session"
import { getMessageDir } from "./session"
import { readAllSessionMetas } from "./background-tasks"

export type TimeSeriesTone = "muted" | "teal" | "red" | "green"

export type TimeSeriesSeries = {
  id: string
  label: string
  tone: TimeSeriesTone
  values: number[]
}

export type TimeSeriesPayload = {
  windowMs: number
  bucketMs: number
  buckets: number
  anchorMs: number
  serverNowMs: number
  series: TimeSeriesSeries[]
}

type CanonicalAgent = "sisyphus" | "prometheus" | "atlas" | "other"

const SERIES_ORDER: Array<Pick<TimeSeriesSeries, "id" | "label" | "tone">> = [
  { id: "overall-main", label: "Overall", tone: "muted" },
  { id: "agent:sisyphus", label: "Sisyphus", tone: "teal" },
  { id: "agent:prometheus", label: "Prometheus", tone: "red" },
  { id: "agent:atlas", label: "Atlas", tone: "green" },
  { id: "background-total", label: "Background tasks (total)", tone: "muted" },
]

function zeroBuckets(size: number): number[] {
  return Array.from({ length: size }, () => 0)
}

function listJsonFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

function readRecentMessageMetas(messageDir: string, maxMessages: number): StoredMessageMeta[] {
  if (!messageDir || !fs.existsSync(messageDir)) return []
  const ranked = listJsonFiles(messageDir)
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

  const metas: StoredMessageMeta[] = []
  for (const item of ranked) {
    const meta = readJsonFile<StoredMessageMeta>(path.join(messageDir, item.f))
    if (meta && typeof meta.id === "string") metas.push(meta)
  }
  return metas
}

function countToolParts(partStorage: string, messageId: string): number {
  const partDir = path.join(partStorage, messageId)
  if (!fs.existsSync(partDir)) return 0

  let count = 0
  const files = listJsonFiles(partDir).sort()
  for (const file of files) {
    const part = readJsonFile<{ type?: string }>(path.join(partDir, file))
    if (part && part.type === "tool") count += 1
  }
  return count
}

function canonicalizeAgent(agent: unknown): CanonicalAgent {
  if (typeof agent !== "string") return "other"
  const trimmed = agent.trim()
  if (!trimmed) return "other"
  const lowered = trimmed.toLowerCase()
  if (lowered.startsWith("sisyphus-junior")) return "sisyphus"
  if (lowered.startsWith("sisyphus")) return "sisyphus"
  if (lowered.startsWith("prometheus")) return "prometheus"
  if (lowered.startsWith("atlas")) return "atlas"
  return "other"
}

function addToBucket(values: number[], bucketIndex: number, count: number): void {
  if (bucketIndex < 0 || bucketIndex >= values.length) return
  values[bucketIndex] += count
}

function getCreated(meta: StoredMessageMeta): number {
  const created = meta.time?.created
  return typeof created === "number" ? created : -Infinity
}

function bucketMessageTools(opts: {
  storage: OpenCodeStorageRoots
  messageDir: string
  startMs: number
  anchorMs: number
  bucketMs: number
  overall: number[]
  perAgent?: Record<Exclude<CanonicalAgent, "other">, number[]>
}): void {
  const metas = readRecentMessageMetas(opts.messageDir, 200)
  const ordered = [...metas].sort((a, b) => {
    const at = getCreated(a)
    const bt = getCreated(b)
    if (bt !== at) return bt - at
    return String(a.id).localeCompare(String(b.id))
  })

  for (const meta of ordered) {
    const created = getCreated(meta)
    if (created < opts.startMs) break
    if (created >= opts.anchorMs) continue

    const bucketIndex = Math.floor((created - opts.startMs) / opts.bucketMs)
    const toolCount = countToolParts(opts.storage.part, meta.id)
    if (toolCount <= 0) continue

    addToBucket(opts.overall, bucketIndex, toolCount)
    const perAgent = opts.perAgent
    if (perAgent) {
      const agent = canonicalizeAgent(meta.agent)
      if (agent === "sisyphus" || agent === "prometheus" || agent === "atlas") {
        addToBucket(perAgent[agent], bucketIndex, toolCount)
      }
    }
  }
}

function bucketBackgroundTools(opts: {
  storage: OpenCodeStorageRoots
  sessionIds: string[]
  startMs: number
  anchorMs: number
  bucketMs: number
  output: number[]
}): void {
  for (const sessionId of opts.sessionIds) {
    const messageDir = getMessageDir(opts.storage.message, sessionId)
    const metas = readRecentMessageMetas(messageDir, 200)
    const ordered = [...metas].sort((a, b) => {
      const at = getCreated(a)
      const bt = getCreated(b)
      if (bt !== at) return bt - at
      return String(a.id).localeCompare(String(b.id))
    })

    for (const meta of ordered) {
      const created = getCreated(meta)
      if (created < opts.startMs) break
      if (created >= opts.anchorMs) continue

      const bucketIndex = Math.floor((created - opts.startMs) / opts.bucketMs)
      const toolCount = countToolParts(opts.storage.part, meta.id)
      if (toolCount <= 0) continue
      addToBucket(opts.output, bucketIndex, toolCount)
    }
  }
}

function bucketSessionAgents(opts: {
  storage: OpenCodeStorageRoots
  sessionIds: string[]
  startMs: number
  anchorMs: number
  bucketMs: number
  overall: number[]
  perAgent: Record<Exclude<CanonicalAgent, "other">, number[]>
}): void {
  for (const sessionId of opts.sessionIds) {
    const messageDir = getMessageDir(opts.storage.message, sessionId)
    if (!messageDir) continue
    bucketMessageTools({
      storage: opts.storage,
      messageDir,
      startMs: opts.startMs,
      anchorMs: opts.anchorMs,
      bucketMs: opts.bucketMs,
      overall: opts.overall,
      // Background sessions are owned by Sisyphus; don't smear activity into Prometheus/Atlas.
      perAgent: undefined,
    })
  }
}

export function deriveTimeSeriesActivity(opts: {
  storage: OpenCodeStorageRoots
  mainSessionId: string | null
  nowMs?: number
  windowMs?: number
  bucketMs?: number
}): TimeSeriesPayload {
  const windowMs = opts.windowMs ?? 300_000
  const bucketMs = opts.bucketMs ?? 2_000
  const buckets = Math.floor(windowMs / bucketMs)
  const nowMs = opts.nowMs ?? Date.now()
  const anchorMs = Math.floor(nowMs / bucketMs) * bucketMs
  const startMs = anchorMs - windowMs

  const overall = zeroBuckets(buckets)
  const sisyphus = zeroBuckets(buckets)
  const prometheus = zeroBuckets(buckets)
  const atlas = zeroBuckets(buckets)
  const background = zeroBuckets(buckets)

  const mainSessionId = opts.mainSessionId
  if (mainSessionId) {
    const messageDir = getMessageDir(opts.storage.message, mainSessionId)
    if (messageDir) {
      bucketMessageTools({
        storage: opts.storage,
        messageDir,
        startMs,
        anchorMs,
        bucketMs,
        overall,
        perAgent: { sisyphus, prometheus, atlas },
      })
    }

    const childSessions = readAllSessionMetas(opts.storage.session)
      .filter((meta) => meta.parentID === mainSessionId)
      .sort((a, b) => {
        const at = a.time?.updated ?? 0
        const bt = b.time?.updated ?? 0
        if (bt !== at) return bt - at
        return String(a.id).localeCompare(String(b.id))
      })
      .slice(0, 25)
      .map((meta) => meta.id)

    if (childSessions.length > 0) {
      bucketBackgroundTools({
        storage: opts.storage,
        sessionIds: childSessions,
        startMs,
        anchorMs,
        bucketMs,
        output: background,
      })
      bucketSessionAgents({
        storage: opts.storage,
        sessionIds: childSessions,
        startMs,
        anchorMs,
        bucketMs,
        overall,
        perAgent: { sisyphus, prometheus, atlas },
      })
    }
  }

  return {
    windowMs,
    bucketMs,
    buckets,
    anchorMs,
    serverNowMs: nowMs,
    series: [
      { ...SERIES_ORDER[0], values: overall },
      { ...SERIES_ORDER[1], values: sisyphus },
      { ...SERIES_ORDER[2], values: prometheus },
      { ...SERIES_ORDER[3], values: atlas },
      { ...SERIES_ORDER[4], values: background },
    ],
  }
}
