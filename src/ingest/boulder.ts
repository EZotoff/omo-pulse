import * as fs from "node:fs"
import * as path from "node:path"
import { assertAllowedPath } from "./paths"

export type BoulderState = {
  active_plan: string
  started_at: string
  session_ids: string[]
  plan_name: string
}

export type PlanProgress = {
  total: number
  completed: number
  isComplete: boolean
  missing: boolean
  planStale: boolean
  planComplete: boolean
}

export type PlanStep = {
  checked: boolean
  text: string
}

export function readBoulderState(projectRoot: string): BoulderState | null {
  const filePath = assertAllowedPath({
    candidatePath: path.join(projectRoot, ".sisyphus", "boulder.json"),
    allowedRoots: [projectRoot],
  })

  if (!fs.existsSync(filePath)) return null

  try {
    const content = fs.readFileSync(filePath, "utf8")
    return JSON.parse(content) as BoulderState
  } catch {
    return null
  }
}

export function getPlanProgressFromMarkdown(content: string): Omit<PlanProgress, "missing" | "planStale" | "planComplete"> {
  const uncheckedMatches = content.match(/^[-*]\s*\[\s*\]/gm) || []
  const checkedMatches = content.match(/^[-*]\s*\[[xX]\]/gm) || []

  const total = uncheckedMatches.length + checkedMatches.length
  const completed = checkedMatches.length

  return {
    total,
    completed,
    isComplete: total > 0 && completed === total,
  }
}

export function getPlanStepsFromMarkdown(content: string): PlanStep[] {
  const lines = content.split(/\r?\n/)
  const steps: PlanStep[] = []

  for (const raw of lines) {
    const line = raw.trim()
    const m = line.match(/^[-*]\s*\[(\s|x|X)\]\s*(.*)$/)
    if (!m) continue
    const checked = m[1] === "x" || m[1] === "X"
    const text = (m[2] ?? "").trim()
    steps.push({ checked, text })
  }

  return steps
}

/** Threshold for considering a plan stale (30 minutes) */
const PLAN_STALE_THRESHOLD_MS = 30 * 60 * 1000

export function readPlanProgress(projectRoot: string, planPath: string, nowMs?: number): PlanProgress {
  const fallback: PlanProgress = { total: 0, completed: 0, isComplete: false, missing: true, planStale: false, planComplete: false }
  let planReal: string
  try {
    planReal = assertAllowedPath({
      candidatePath: planPath,
      allowedRoots: [projectRoot],
    })
  } catch {
    return fallback
  }

  if (!fs.existsSync(planReal)) {
    return fallback
  }

  try {
    const content = fs.readFileSync(planReal, "utf8")
    const progress = getPlanProgressFromMarkdown(content)

    // planComplete: true only when there are tasks AND all are checked
    const planComplete = progress.total > 0 && progress.completed === progress.total

    // Determine plan file staleness via mtime
    const now = nowMs ?? Date.now()
    let planStale = false
    try {
      const stat = fs.statSync(planReal)
      const mtimeMs = stat.mtimeMs
      planStale = !planComplete && (now - mtimeMs > PLAN_STALE_THRESHOLD_MS)
    } catch {
      // If stat fails, default to not stale
    }

    return { ...progress, missing: false, planStale, planComplete }
  } catch {
    return fallback
  }
}

export function readPlanSteps(projectRoot: string, planPath: string): { missing: boolean; steps: PlanStep[] } {
  let planReal: string
  try {
    planReal = assertAllowedPath({
      candidatePath: planPath,
      allowedRoots: [projectRoot],
    })
  } catch {
    return { missing: true, steps: [] }
  }

  if (!fs.existsSync(planReal)) {
    return { missing: true, steps: [] }
  }

  try {
    const content = fs.readFileSync(planReal, "utf8")
    return { missing: false, steps: getPlanStepsFromMarkdown(content) }
  } catch {
    return { missing: true, steps: [] }
  }
}
