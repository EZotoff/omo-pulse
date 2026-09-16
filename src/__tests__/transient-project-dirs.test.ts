import { describe, expect, it } from "vitest"
import { isTransientProjectDir } from "../ingest/paths"

const HOME = "/home/tester"

describe("isTransientProjectDir", () => {
  it("rejects tmp and throw-away session dirs", () => {
    expect(isTransientProjectDir("/tmp/opencode", "/home/tester", "/tmp")).toBe(true)
    expect(isTransientProjectDir("/tmp/opencode/smoke-boot.iQI4SE", "/home/tester", "/tmp")).toBe(true)
    expect(isTransientProjectDir("/tmp/tmp.Rn0LUKe618", "/home/tester", "/tmp")).toBe(true)
    expect(isTransientProjectDir("/var/tmp/scratch", "/home/tester", "/tmp")).toBe(true)
    expect(isTransientProjectDir(`${HOME}/tmp/inner`, HOME, "/tmp")).toBe(true)
    expect(isTransientProjectDir(`${HOME}/projects/tmp`, HOME, "/tmp")).toBe(true)
  })

  it("rejects worktree directories", () => {
    expect(isTransientProjectDir(`${HOME}/repo/.worktrees/feat-x`, HOME, "/tmp")).toBe(true)
    expect(isTransientProjectDir(`${HOME}/repo/worktrees/feat-x`, HOME, "/tmp")).toBe(true)
    expect(isTransientProjectDir(`${HOME}/repo-worktrees/feat-x`, HOME, "/tmp")).toBe(true)
    expect(isTransientProjectDir(`${HOME}/some/Worktree-2`, HOME, "/tmp")).toBe(true)
  })

  it("accepts real project directories", () => {
    expect(isTransientProjectDir(`${HOME}/AI_projects/ez-omo-dash`, HOME, "/tmp")).toBe(false)
    expect(isTransientProjectDir(`${HOME}/ez-omo-config`, HOME, "/tmp")).toBe(false)
    expect(isTransientProjectDir("/opt/srv/my-service", HOME, "/tmp")).toBe(false)
    expect(isTransientProjectDir(`${HOME}/projects/template`, HOME, "/tmp")).toBe(false)
  })

  it("rejects empty or relative paths defensively", () => {
    expect(isTransientProjectDir("", HOME, "/tmp")).toBe(true)
    expect(isTransientProjectDir("relative/path", HOME, "/tmp")).toBe(true)
  })
})
