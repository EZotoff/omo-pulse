import type { CanonicalAgent } from "../types"

export function formatIsoNoMs(ts: number): string {
  const iso = new Date(ts).toISOString()
  return iso.replace(/\.\d{3}Z$/, "Z")
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)

  if (days > 0) return hours > 0 ? `${days}d${hours}h` : `${days}d`
  if (totalHours > 0) return minutes > 0 ? `${totalHours}h${minutes}m` : `${totalHours}h`
  if (totalMinutes > 0) return seconds > 0 ? `${totalMinutes}m${seconds}s` : `${totalMinutes}m`
  return `${seconds}s`
}

export function formatTimeline(startAt: number | null, endAtMs: number): string {
  if (typeof startAt !== "number") return ""
  const start = formatIsoNoMs(startAt)
  const elapsed = formatElapsed(endAtMs - startAt)
  return `${start}: ${elapsed}`
}

export function canonicalizeAgent(agent: unknown): CanonicalAgent {
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

export function normalizeSessionIds(values: Array<string | null | undefined>): string[] {
  const sessionIds: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (typeof value !== "string") continue
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    sessionIds.push(id)
  }

  return sessionIds
}
