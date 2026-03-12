import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { scanUnintiatedPlans } from "../ingest/boulder"
import type { UnintiatedPlan } from "../types"

function makeProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-uninitiated-plans-"))
}

function ensurePlansDir(projectRoot: string): string {
  const plansDir = path.join(projectRoot, ".sisyphus", "plans")
  fs.mkdirSync(plansDir, { recursive: true })
  return plansDir
}

function writePlan(projectRoot: string, fileName: string, content: string): string {
  const plansDir = ensurePlansDir(projectRoot)
  const filePath = path.join(plansDir, fileName)
  fs.writeFileSync(filePath, content)
  return filePath
}

const projectRoots: string[] = []

function createProjectRoot(): string {
  const projectRoot = makeProjectRoot()
  projectRoots.push(projectRoot)
  return projectRoot
}

afterEach(() => {
  for (const projectRoot of projectRoots.splice(0)) {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

describe("scanUnintiatedPlans", () => {
  it("returns only zero-completion plans from mixed plan states", () => {
    const projectRoot = createProjectRoot()

    writePlan(projectRoot, "active-work.md", "- [x] Started\n- [ ] Remaining")
    writePlan(projectRoot, "completed.md", "- [x] Done\n- [x] Ship it")
    writePlan(projectRoot, "new-feature.md", "- [ ] Draft API\n- [ ] Add tests")
    writePlan(projectRoot, "research.md", "* [ ] Compare options\n* [ ] Write summary")

    expect(scanUnintiatedPlans(projectRoot, null)).toEqual([
      {
        name: "new-feature",
        path: ".sisyphus/plans/new-feature.md",
        total: 2,
        steps: [
          { checked: false, text: "Draft API" },
          { checked: false, text: "Add tests" },
        ],
      },
      {
        name: "research",
        path: ".sisyphus/plans/research.md",
        total: 2,
        steps: [
          { checked: false, text: "Compare options" },
          { checked: false, text: "Write summary" },
        ],
      },
    ])
  })

  it("excludes the active plan from otherwise matching results", () => {
    const projectRoot = createProjectRoot()

    writePlan(projectRoot, "alpha.md", "- [ ] First\n- [ ] Second")
    const betaPath = writePlan(projectRoot, "beta.md", "- [ ] Third\n- [ ] Fourth")

    expect(scanUnintiatedPlans(projectRoot, betaPath).map((plan) => plan.name)).toEqual(["alpha"])
  })

  it("returns an empty array when the plans directory is missing", () => {
    const projectRoot = createProjectRoot()

    expect(scanUnintiatedPlans(projectRoot, null)).toEqual([])
  })

  it("skips markdown files that contain no checkbox tasks", () => {
    const projectRoot = createProjectRoot()

    writePlan(projectRoot, "notes-only.md", "# Notes\n\nNo tasks here yet.")
    writePlan(projectRoot, "todo.md", "- [ ] Add parser\n- [ ] Cover edge cases")

    expect(scanUnintiatedPlans(projectRoot, null).map((plan) => plan.name)).toEqual(["todo"])
  })

  it("sorts matching plans alphabetically by plan name", () => {
    const projectRoot = createProjectRoot()

    writePlan(projectRoot, "zebra.md", "- [ ] Last")
    writePlan(projectRoot, "alpha.md", "- [ ] First")
    writePlan(projectRoot, "middle.md", "- [ ] Second")

    expect(scanUnintiatedPlans(projectRoot, null).map((plan) => plan.name)).toEqual(["alpha", "middle", "zebra"])
  })

  it("matches the public UnintiatedPlan shape at compile time", () => {
    const projectRoot = createProjectRoot()
    writePlan(projectRoot, "typed.md", "- [ ] Preserve public shape")

    const result: UnintiatedPlan[] = scanUnintiatedPlans(projectRoot, null)
    const firstPlan = result[0]

    expect(result).toHaveLength(1)

    expect(firstPlan).toMatchObject({
      name: "typed",
      path: ".sisyphus/plans/typed.md",
      total: 1,
    } satisfies Pick<UnintiatedPlan, "name" | "path" | "total">)
  })
})
