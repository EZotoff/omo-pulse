import * as fs from "node:fs"
import * as path from "node:path"

/**
 * Operator-controlled attention hide list — persisted next to the sources
 * registry. Sessions hidden here never surface in GET /api/attention
 * (the PROBE-OK problem: autonomous sessions can't be told apart from human
 * ones reliably, so the operator decides once, explicitly).
 */
const FILE_NAME = "attention-hidden.json"

export function readHiddenSessionIds(storageRoot: string): Set<string> {
  try {
    const raw = fs.readFileSync(path.join(storageRoot, FILE_NAME), "utf-8")
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id): id is string => typeof id === "string"))
    }
  } catch {
    // Absent or malformed → empty list
  }
  return new Set()
}

export function writeHiddenSessionIds(storageRoot: string, ids: Set<string>): void {
  fs.mkdirSync(storageRoot, { recursive: true })
  fs.writeFileSync(path.join(storageRoot, FILE_NAME), JSON.stringify([...ids], null, 2))
}
