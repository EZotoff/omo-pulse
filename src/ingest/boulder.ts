import * as fs from "node:fs"
import * as path from "node:path"
import type { BoulderHistoryEntry, BoulderState, UnintiatedPlan } from "~/types"
import { assertAllowedPath } from "./paths"

export type { BoulderState }

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

export function readBoulderHistory(projectRoot: string): BoulderHistoryEntry[] {
  const filePath = assertAllowedPath({
    candidatePath: path.join(projectRoot, ".sisyphus", "boulder-history.jsonl"),
    allowedRoots: [projectRoot],
  })

  if (!fs.existsSync(filePath)) return []

  try {
    const content = fs.readFileSync(filePath, "utf8")
    const entries: BoulderHistoryEntry[] = []

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue

      try {
        entries.push(JSON.parse(line) as BoulderHistoryEntry)
      } catch {
      }
    }

    entries.sort((left, right) => {
      const leftTime = Date.parse(left.completed_at)
      const rightTime = Date.parse(right.completed_at)
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })

    return entries
  } catch {
    return []
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

export function scanUnintiatedPlans(projectRoot: string, activePlanPath: string | null): UnintiatedPlan[] {
  const plansDir = path.join(projectRoot, ".sisyphus", "plans")

  if (!fs.existsSync(plansDir)) {
    return []
  }

  let activePlanNorm: string | null = null
  if (activePlanPath) {
    try {
      const activePlanAbs = path.resolve(projectRoot, activePlanPath)
      activePlanNorm = activePlanAbs
    } catch {
      // If normalization fails, just skip active plan filtering
    }
  }

  const results: UnintiatedPlan[] = []

  try {
    const files = fs.readdirSync(plansDir, { withFileTypes: true })

    for (const file of files) {
      if (file.isDirectory() && file.name === "_archive") continue
      if (!file.isFile()) continue
      if (!file.name.endsWith(".md")) continue
      if (file.name.startsWith("_archive_")) continue

      const filePath = path.join(plansDir, file.name)
      const filePathAbs = path.resolve(filePath)

      if (activePlanNorm && filePathAbs === activePlanNorm) {
        continue
      }

      try {
        assertAllowedPath({
          candidatePath: filePath,
          allowedRoots: [projectRoot],
        })

        const content = fs.readFileSync(filePath, "utf8")
        const progress = getPlanProgressFromMarkdown(content)
        const steps = getPlanStepsFromMarkdown(content)

        if (progress.total > 0 && progress.completed === 0) {
          const planName = file.name.replace(/\.md$/, "")
          const relativePath = path.relative(projectRoot, filePath)
          results.push({
            name: planName,
            path: relativePath,
            total: progress.total,
            steps,
          })
        }
      } catch {
      }
    }
  } catch {
    return []
  }

  results.sort((a, b) => a.name.localeCompare(b.name))

  return results
}
