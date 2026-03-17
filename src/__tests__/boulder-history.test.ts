import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readBoulderHistory } from "../ingest/boulder"
import type { BoulderHistoryEntry } from "../types"

const projectRoots: string[] = []

function createProjectRoot(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-boulder-history-"))
  projectRoots.push(projectRoot)
  return projectRoot
}

function ensureSisyphusDir(projectRoot: string): string {
  const sisyphusDir = path.join(projectRoot, ".sisyphus")
  fs.mkdirSync(sisyphusDir, { recursive: true })
  return sisyphusDir
}

function writeHistoryLines(projectRoot: string, lines: string[]): void {
  const historyPath = path.join(ensureSisyphusDir(projectRoot), "boulder-history.jsonl")
  fs.writeFileSync(historyPath, lines.join("\n"))
}

afterEach(() => {
  for (const projectRoot of projectRoots.splice(0)) {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

describe("readBoulderHistory", () => {
  it("returns empty array when boulder-history.jsonl is missing", () => {
    const projectRoot = createProjectRoot()

    expect(readBoulderHistory(projectRoot)).toEqual([])
  })

  it("parses valid JSONL entries", () => {
    const projectRoot = createProjectRoot()
    const first: BoulderHistoryEntry = {
      plan_name: "first-plan",
      plan_path: ".sisyphus/plans/first-plan.md",
      archived_path: ".sisyphus/plans/_archive/first-plan.md",
      started_at: "2026-03-01T10:00:00Z",
      completed_at: "2026-03-01T10:10:00Z",
      session_ids: ["ses-1", "ses-2"],
      total_tasks: 3,
      completed_tasks: 3,
    }
    const second: BoulderHistoryEntry = {
      plan_name: "second-plan",
      plan_path: ".sisyphus/plans/second-plan.md",
      archived_path: ".sisyphus/plans/_archive/second-plan.md",
      started_at: "2026-03-02T10:00:00Z",
      completed_at: "2026-03-02T10:15:00Z",
      session_ids: ["ses-3"],
      total_tasks: 5,
      completed_tasks: 5,
    }

    writeHistoryLines(projectRoot, [JSON.stringify(first), JSON.stringify(second)])

    expect(readBoulderHistory(projectRoot)).toEqual([second, first])
  })

  it("sorts entries by completed_at descending", () => {
    const projectRoot = createProjectRoot()

    writeHistoryLines(projectRoot, [
      JSON.stringify({
        plan_name: "oldest",
        plan_path: ".sisyphus/plans/oldest.md",
        archived_path: ".sisyphus/plans/_archive/oldest.md",
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T02:00:00Z",
        session_ids: ["ses-1"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
      JSON.stringify({
        plan_name: "newest",
        plan_path: ".sisyphus/plans/newest.md",
        archived_path: ".sisyphus/plans/_archive/newest.md",
        started_at: "2026-03-01T00:00:00Z",
        completed_at: "2026-03-01T02:00:00Z",
        session_ids: ["ses-2"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
      JSON.stringify({
        plan_name: "middle",
        plan_path: ".sisyphus/plans/middle.md",
        archived_path: ".sisyphus/plans/_archive/middle.md",
        started_at: "2026-02-01T00:00:00Z",
        completed_at: "2026-02-01T02:00:00Z",
        session_ids: ["ses-3"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
    ])

    expect(readBoulderHistory(projectRoot).map((entry) => entry.plan_name)).toEqual(["newest", "middle", "oldest"])
  })

  it("skips malformed JSON lines", () => {
    const projectRoot = createProjectRoot()

    writeHistoryLines(projectRoot, [
      JSON.stringify({
        plan_name: "valid-one",
        plan_path: ".sisyphus/plans/valid-one.md",
        archived_path: ".sisyphus/plans/_archive/valid-one.md",
        started_at: "2026-03-01T00:00:00Z",
        completed_at: "2026-03-01T02:00:00Z",
        session_ids: ["ses-1"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
      "{ not valid json",
      JSON.stringify({
        plan_name: "valid-two",
        plan_path: ".sisyphus/plans/valid-two.md",
        archived_path: ".sisyphus/plans/_archive/valid-two.md",
        started_at: "2026-03-02T00:00:00Z",
        completed_at: "2026-03-02T02:00:00Z",
        session_ids: ["ses-2"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
      "not-json-at-all",
    ])

    expect(readBoulderHistory(projectRoot).map((entry) => entry.plan_name)).toEqual(["valid-two", "valid-one"])
  })

  it("ignores empty lines", () => {
    const projectRoot = createProjectRoot()

    writeHistoryLines(projectRoot, [
      "",
      "  ",
      JSON.stringify({
        plan_name: "only-plan",
        plan_path: ".sisyphus/plans/only-plan.md",
        archived_path: ".sisyphus/plans/_archive/only-plan.md",
        started_at: "2026-03-03T00:00:00Z",
        completed_at: "2026-03-03T02:00:00Z",
        session_ids: ["ses-1"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
      "",
    ])

    expect(readBoulderHistory(projectRoot)).toHaveLength(1)
  })

  it("preserves optional agent when present and absent", () => {
    const projectRoot = createProjectRoot()

    writeHistoryLines(projectRoot, [
      JSON.stringify({
        plan_name: "without-agent",
        plan_path: ".sisyphus/plans/without-agent.md",
        archived_path: ".sisyphus/plans/_archive/without-agent.md",
        started_at: "2026-03-01T00:00:00Z",
        completed_at: "2026-03-01T02:00:00Z",
        session_ids: ["ses-1"],
        total_tasks: 1,
        completed_tasks: 1,
      }),
      JSON.stringify({
        plan_name: "with-agent",
        plan_path: ".sisyphus/plans/with-agent.md",
        archived_path: ".sisyphus/plans/_archive/with-agent.md",
        started_at: "2026-03-02T00:00:00Z",
        completed_at: "2026-03-02T02:00:00Z",
        session_ids: ["ses-2"],
        total_tasks: 1,
        completed_tasks: 1,
        agent: "build",
      }),
    ])

    const result = readBoulderHistory(projectRoot)

    expect(result[0].agent).toBe("build")
    expect(result[1].agent).toBeUndefined()
  })
})
