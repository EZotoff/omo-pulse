import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import {
  expandTilde,
  getDataDir,
  getOpenCodeStorageDir,
  getOpenCodeStorageDirFromDataDir,
  realpathSafe,
  isPathInside,
  getMessageDir,
  assertAllowedPath,
} from "../ingest/paths"

const HOME = "/home/tester"

describe("expandTilde", () => {
  it("expands a bare tilde to the homedir", () => {
    expect(expandTilde("~", HOME)).toBe(HOME)
  })

  it("expands tilde-prefixed paths onto the homedir", () => {
    expect(expandTilde("~/projects", HOME)).toBe(path.join(HOME, "projects"))
  })

  it("normalizes windows-style separators after the tilde", () => {
    expect(expandTilde("~\\projects", HOME)).toBe(path.join(HOME, "projects"))
    expect(expandTilde("~\\docs\\notes", HOME)).toBe(path.join(HOME, "docs", "notes"))
    expect(expandTilde("~/a//b///c", HOME)).toBe(path.join(HOME, "a", "b", "c"))
  })

  it("leaves non-tilde and non-leading-tilde paths untouched", () => {
    expect(expandTilde("plain/path", HOME)).toBe("plain/path")
    expect(expandTilde("", HOME)).toBe("")
    expect(expandTilde("user@~/data", HOME)).toBe("user@~/data")
    expect(expandTilde("x~/y", HOME)).toBe("x~/y")
  })
})

describe("getDataDir", () => {
  it("returns XDG_DATA_HOME verbatim when set", () => {
    expect(getDataDir({ XDG_DATA_HOME: "/custom/data" }, HOME)).toBe("/custom/data")
  })

  it("defaults to ~/.local/share when unset; empty XDG_DATA_HOME passes through", () => {
    expect(getDataDir({}, HOME)).toBe(path.join(HOME, ".local", "share"))
    expect(getDataDir({ XDG_DATA_HOME: "" }, HOME)).toBe("")
  })

  it("expands a tilde XDG_DATA_HOME against the homedir", () => {
    expect(getDataDir({ XDG_DATA_HOME: "~" }, HOME)).toBe(HOME)
    expect(getDataDir({ XDG_DATA_HOME: "~/data" }, HOME)).toBe(path.join(HOME, "data"))
    expect(getDataDir({ XDG_DATA_HOME: "~\\data" }, HOME)).toBe(path.join(HOME, "data"))
  })
})

describe("getOpenCodeStorageDir", () => {
  it("appends opencode/storage to a given data dir", () => {
    expect(getOpenCodeStorageDirFromDataDir("/data")).toBe(path.join("/data", "opencode", "storage"))
    expect(getOpenCodeStorageDirFromDataDir("/data/")).toBe(path.join("/data", "opencode", "storage"))
  })

  it("composes getDataDir with the storage suffix", () => {
    expect(getOpenCodeStorageDir({ XDG_DATA_HOME: "/xdg" }, HOME)).toBe(
      path.join("/xdg", "opencode", "storage"),
    )
    expect(getOpenCodeStorageDir({}, HOME)).toBe(
      path.join(HOME, ".local", "share", "opencode", "storage"),
    )
  })
})

describe("realpathSafe", () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-paths-"))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("resolves an existing path", () => {
    expect(realpathSafe(root)).toBe(fs.realpathSync(root))
  })

  it("resolves a symlink to its target", () => {
    const target = path.join(root, "target")
    fs.mkdirSync(target)
    fs.symlinkSync(target, path.join(root, "link"))
    expect(realpathSafe(path.join(root, "link"))).toBe(fs.realpathSync(target))
  })

  it("returns null for a missing path", () => {
    expect(realpathSafe(path.join(root, "does-not-exist"))).toBe(null)
  })
})

describe("isPathInside", () => {
  it("accepts the root itself and nested children", () => {
    expect(isPathInside("/data/root", "/data/root")).toBe(true)
    expect(isPathInside("/data/root", "/data/root/child")).toBe(true)
    expect(isPathInside("/data/root", "/data/root/a/b/c")).toBe(true)
  })

  it("rejects parents, siblings and prefix-sharing names", () => {
    expect(isPathInside("/data/root", "/data")).toBe(false)
    expect(isPathInside("/data/root", "/data/root-evil")).toBe(false)
    expect(isPathInside("/data/root", "/data/other/child")).toBe(false)
  })
})

describe("getMessageDir", () => {
  let root: string
  let storage: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-paths-"))
    storage = path.join(root, "message")
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("returns the direct message dir when it exists", () => {
    fs.mkdirSync(path.join(storage, "ses_direct"), { recursive: true })
    expect(getMessageDir(storage, "ses_direct")).toBe(path.join(storage, "ses_direct"))
  })

  it("scans one nesting level when the direct dir is absent", () => {
    fs.mkdirSync(path.join(storage, "2026-01-01", "ses_nested"), { recursive: true })
    expect(getMessageDir(storage, "ses_nested")).toBe(
      path.join(storage, "2026-01-01", "ses_nested"),
    )
  })

  it("prefers the direct dir over a nested one", () => {
    fs.mkdirSync(path.join(storage, "ses_both"), { recursive: true })
    fs.mkdirSync(path.join(storage, "bucket", "ses_both"), { recursive: true })
    expect(getMessageDir(storage, "ses_both")).toBe(path.join(storage, "ses_both"))
  })

  it("returns an empty string when nothing matches", () => {
    fs.mkdirSync(path.join(storage, "ses_other"), { recursive: true })
    expect(getMessageDir(storage, "ses_missing")).toBe("")
  })

  it("returns an empty string when the storage root is unreadable", () => {
    expect(getMessageDir(path.join(root, "nope"), "ses_x")).toBe("")
  })
})

describe("assertAllowedPath", () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-paths-"))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("allows an existing candidate inside a root and returns its real path", () => {
    const project = path.join(root, "project")
    fs.mkdirSync(project)
    const file = path.join(project, "a.txt")
    fs.writeFileSync(file, "x")
    expect(assertAllowedPath({ candidatePath: file, allowedRoots: [project], baseDir: root })).toBe(
      fs.realpathSync(file),
    )
  })

  it("allows the root itself as candidate", () => {
    const project = path.join(root, "project")
    fs.mkdirSync(project)
    expect(assertAllowedPath({ candidatePath: project, allowedRoots: [project], baseDir: root })).toBe(
      fs.realpathSync(project),
    )
  })

  it("allows a not-yet-existing child by resolving through the nearest existing ancestor", () => {
    const project = path.join(root, "project")
    fs.mkdirSync(project)
    const future = path.join(project, "generated", "out.txt")
    expect(assertAllowedPath({ candidatePath: future, allowedRoots: [project], baseDir: root })).toBe(
      path.join(fs.realpathSync(project), "generated", "out.txt"),
    )
  })

  it("resolves relative candidates and roots against baseDir", () => {
    const project = path.join(root, "project")
    fs.mkdirSync(project)
    expect(
      assertAllowedPath({ candidatePath: "project/a.txt", allowedRoots: ["project"], baseDir: root }),
    ).toBe(path.join(fs.realpathSync(project), "a.txt"))
  })

  it("denies a candidate outside every root", () => {
    const project = path.join(root, "project")
    const outside = path.join(root, "outside")
    fs.mkdirSync(project)
    fs.mkdirSync(outside)
    const file = path.join(outside, "secret.txt")
    fs.writeFileSync(file, "x")
    expect(() =>
      assertAllowedPath({ candidatePath: file, allowedRoots: [project], baseDir: root }),
    ).toThrow("Access denied")
  })

  it("denies traversal through a symlink escaping the root", () => {
    const project = path.join(root, "project")
    const outside = path.join(root, "outside")
    fs.mkdirSync(project)
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(project, "link"))
    const file = path.join(outside, "secret.txt")
    fs.writeFileSync(file, "x")
    expect(() =>
      assertAllowedPath({
        candidatePath: path.join(project, "link", "secret.txt"),
        allowedRoots: [project],
        baseDir: root,
      }),
    ).toThrow("Access denied")
  })

  it("denies a missing candidate whose whole subtree lies outside every root", () => {
    const project = path.join(root, "project")
    fs.mkdirSync(project)
    expect(() =>
      assertAllowedPath({
        candidatePath: path.join(root, "elsewhere", "deep", "new.txt"),
        allowedRoots: [project],
        baseDir: root,
      }),
    ).toThrow("Access denied")
  })

  it("accepts a candidate under an allowed root that does not exist yet", () => {
    const future = path.join(root, "fresh-root")
    expect(
      assertAllowedPath({
        candidatePath: path.join(future, "kid.txt"),
        allowedRoots: [future],
        baseDir: root,
      }),
    ).toBe(path.join(fs.realpathSync(root), "fresh-root", "kid.txt"))
  })
})
