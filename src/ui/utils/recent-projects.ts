import type { ProjectSnapshot } from "../../types"

/** Most recent session activity timestamp for a project (falls back to lastUpdatedMs) */
export function activityOf(project: ProjectSnapshot): number {
  return project.lastActivityMs ?? project.lastUpdatedMs
}

/** Stable display order: alphabetical by project label, then by sourceId for ties */
export function compareProjectsByLabel(a: ProjectSnapshot, b: ProjectSnapshot): number {
  const byLabel = a.label.localeCompare(b.label)
  if (byLabel !== 0) return byLabel
  return a.sourceId.localeCompare(b.sourceId)
}

/**
 * Projects whose last activity is older than this never qualify for dynamic
 * selection — long-dormant projects must not resurface just because the
 * visible pool is smaller than the limit. Manual list mode is for pinning
 * such projects explicitly.
 */
export const DYNAMIC_ACTIVITY_WINDOW_MS = 14 * 24 * 60 * 60_000

/**
 * Select the X most recently active projects (by session activity) and return
 * them in stable label order. Selection is recency-based, ordering is not —
 * so positions never jump around when activity changes.
 */
export function selectRecentProjects(
  projects: ProjectSnapshot[],
  limit: number,
  nowMs: number = Date.now(),
): ProjectSnapshot[] {
  if (projects.length === 0) return []
  const cutoffMs = nowMs - DYNAMIC_ACTIVITY_WINDOW_MS
  const eligible = projects.filter((p) => activityOf(p) >= cutoffMs)
  if (eligible.length === 0) return []
  const effectiveLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : eligible.length
  const ranked = [...eligible].sort((a, b) => activityOf(b) - activityOf(a))
  const selectedIds = new Set(ranked.slice(0, effectiveLimit).map((p) => p.sourceId))
  return eligible
    .filter((p) => selectedIds.has(p.sourceId))
    .sort(compareProjectsByLabel)
}
