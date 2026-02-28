import * as fs from "node:fs"
import * as path from "node:path"
import type { OpenCodeStorageRoots } from "./session"
import { getMessageDir } from "./session"
import { aggregateTokenUsage } from "./token-usage-core"

function listJsonFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
}

function readJsonFile(filePath: string): unknown | null {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readSessionMetas(messageDir: string): unknown[] {
  if (!messageDir) return []
  const files = listJsonFiles(messageDir)
  const metas: unknown[] = []
  for (const file of files) {
    const meta = readJsonFile(path.join(messageDir, file))
    if (meta) metas.push(meta)
  }
  return metas
}

export function deriveTokenUsage(opts: {
  storage: OpenCodeStorageRoots
  mainSessionId: string | null
  backgroundSessionIds?: Array<string | null | undefined>
}): ReturnType<typeof aggregateTokenUsage> {
  const sessionIds: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown): void => {
    const id = normalizeSessionId(value)
    if (!id || seen.has(id)) return
    seen.add(id)
    sessionIds.push(id)
  }

  push(opts.mainSessionId)
  for (const id of opts.backgroundSessionIds ?? []) push(id)

  const metas: unknown[] = []
  for (const sessionId of sessionIds) {
    const messageDir = getMessageDir(opts.storage.message, sessionId)
    if (!messageDir) continue
    metas.push(...readSessionMetas(messageDir))
  }

  return aggregateTokenUsage(metas)
}
