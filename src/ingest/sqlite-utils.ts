import type { SessionMetadata } from "./session"
import type { SqliteReadFailureReason } from "./storage-backend"

export function classifySqliteError(error: unknown): SqliteReadFailureReason {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("database is locked") || message.includes("busy")) return "db_busy"
  if (
    message.includes("database disk image is malformed") ||
    message.includes("not a database") ||
    message.includes("corrupt")
  ) {
    return "db_corrupt"
  }
  if (message.includes("unable to open database file") || message.includes("cannot open")) {
    return "db_unopenable"
  }
  return "db_query_failed"
}

export function findBackgroundSessionId(opts: {
  allSessionMetas: SessionMetadata[]
  parentSessionId: string
  description: string
  subagentType?: string | null
  category?: string | null
  startedAt: number
}): string | null {
  const description = opts.description
  const subagentType = typeof opts.subagentType === "string" && opts.subagentType.trim() ? opts.subagentType.trim() : null
  const expectedTitles = [
    `Background: ${description}`,
    ...(subagentType ? [`${description} (@${subagentType} subagent)`] : []),
    `Task: ${description}`,
  ]

  const windowStart = opts.startedAt - 10_000
  const windowEnd = opts.startedAt + 15 * 60_000

  const candidates = opts.allSessionMetas.filter(
    (m) =>
      m.parentID === opts.parentSessionId &&
      m.time?.created >= windowStart &&
      m.time?.created <= windowEnd,
  )

  const exact = candidates.filter((m) => typeof m.title === "string" && expectedTitles.includes(m.title))
  const pool = exact.length > 0
    ? exact
    : candidates.filter((m) => {
        const t = typeof m.title === "string" ? m.title : ""
        if (!t) return false
        if (subagentType && t.startsWith(description) && t.includes(`@${subagentType}`)) return true
        return t.startsWith(description)
      })

  const poolFallback = pool.length > 0 ? pool : candidates
  poolFallback.sort((a, b) => {
    const at = a.time?.created ?? 0
    const bt = b.time?.created ?? 0
    const ad = Math.abs(at - opts.startedAt)
    const bd = Math.abs(bt - opts.startedAt)
    if (ad !== bd) return ad - bd
    if (bt !== at) return bt - at
    return String(a.id).localeCompare(String(b.id))
  })
  return poolFallback[0]?.id ?? null
}

export function findTaskSessionId(opts: {
  allSessionMetas: SessionMetadata[]
  parentSessionId: string
  description: string
  subagentType?: string | null
  category?: string | null
  startedAt: number
}): string | null {
  const description = opts.description
  const subagentType = typeof opts.subagentType === "string" && opts.subagentType.trim() ? opts.subagentType.trim() : null
  const expectedTitles = [
    `Task: ${description}`,
    ...(subagentType ? [`${description} (@${subagentType} subagent)`] : []),
    `Background: ${description}`,
  ]

  const windowStart = opts.startedAt - 10_000
  const windowEnd = opts.startedAt + 15 * 60_000
  const candidates = opts.allSessionMetas.filter(
    (m) =>
      m.parentID === opts.parentSessionId &&
      m.time?.created >= windowStart &&
      m.time?.created <= windowEnd,
  )

  const exact = candidates.filter((m) => typeof m.title === "string" && expectedTitles.includes(m.title))
  const pool = exact.length > 0
    ? exact
    : candidates.filter((m) => {
        const t = typeof m.title === "string" ? m.title : ""
        if (!t) return false
        if (subagentType && t.startsWith(description) && t.includes(`@${subagentType}`)) return true
        return t.startsWith(description)
      })

  const poolFallback = pool.length > 0 ? pool : candidates
  poolFallback.sort((a, b) => {
    const at = a.time?.created ?? 0
    const bt = b.time?.created ?? 0
    const ad = Math.abs(at - opts.startedAt)
    const bd = Math.abs(bt - opts.startedAt)
    if (ad !== bd) return ad - bd
    if (bt !== at) return bt - at
    return String(a.id).localeCompare(String(b.id))
  })
  return poolFallback[0]?.id ?? null
}
