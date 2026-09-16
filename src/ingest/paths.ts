import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

export type Env = Record<string, string | undefined>

export function expandTilde(p: string, hd?: string): string {
  const home = hd ?? os.homedir()
  if (p === "~") return home
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(home, p.slice(2).replace(/[\\/]+/g, path.sep))
  }
  return p
}

export function getDataDir(env: Env = process.env, homedir: string = os.homedir()): string {
  // Match oh-my-opencode behavior exactly:
  // XDG_DATA_HOME or ~/.local/share on all platforms.
  let dataDir = env.XDG_DATA_HOME
  if (dataDir) {
    if (dataDir === "~") {
      dataDir = homedir
    } else if (dataDir.startsWith("~/") || dataDir.startsWith("~\\")) {
      const suffix = dataDir.slice(2).replace(/[\\/]+/g, path.sep)
      dataDir = path.join(homedir, suffix)
    }
  }
  return dataDir ?? path.join(homedir, ".local", "share")
}

export function getOpenCodeStorageDirFromDataDir(dataDir: string): string {
  return path.join(dataDir, "opencode", "storage")
}

export function getOpenCodeStorageDir(env: Env = process.env, homedir: string = os.homedir()): string {
  return getOpenCodeStorageDirFromDataDir(getDataDir(env, homedir))
}

export function realpathSafe(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

export function isPathInside(rootReal: string, candidateReal: string): boolean {
  const rel = path.relative(rootReal, candidateReal)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

function resolveCandidateReal(candidateAbs: string): string | null {
  const existing = realpathSafe(candidateAbs)
  if (existing) return existing

  // If the target doesn't exist, resolve the nearest existing parent and
  // re-append the relative suffix.
  let cur = candidateAbs
  let prev = ""
  while (cur !== prev) {
    if (fs.existsSync(cur)) {
      const parentReal = realpathSafe(cur)
      if (!parentReal) return null
      const suffix = path.relative(cur, candidateAbs)
      return suffix ? path.join(parentReal, suffix) : parentReal
    }
    prev = cur
    cur = path.dirname(cur)
  }

  return null
}

export type AssertAllowedPathOptions = {
  candidatePath: string
  allowedRoots: string[]
  baseDir?: string
}

export function getMessageDir(messageStorage: string, sessionID: string): string {
  const directPath = path.join(messageStorage, sessionID)
  if (fs.existsSync(directPath)) return directPath

  try {
    for (const dir of fs.readdirSync(messageStorage)) {
      const sessionPath = path.join(messageStorage, dir, sessionID)
      if (fs.existsSync(sessionPath)) return sessionPath
    }
  } catch {
    return ""
  }

  return ""
}

export function assertAllowedPath(opts: AssertAllowedPathOptions): string {
  const baseDir = opts.baseDir ?? process.cwd()
  const candidateAbs = path.resolve(baseDir, opts.candidatePath)

  const candidateReal = resolveCandidateReal(candidateAbs)
  if (!candidateReal) {
    throw new Error("Access denied")
  }

  for (const root of opts.allowedRoots) {
    const rootAbs = path.resolve(baseDir, root)
    const rootReal = resolveCandidateReal(rootAbs) ?? rootAbs
    if (isPathInside(rootReal, candidateReal)) {
      return candidateReal
    }
  }

  throw new Error("Access denied")
}

/** Segment names that mark a directory as throw-away (tmp-style scratch space) */
const TRANSIENT_SEGMENTS = new Set(["tmp", ".tmp"])

/**
 * Decide whether a project directory discovered from session storage is a
 * transient workspace rather than a real project — e.g. git worktrees of a
 * parent repo or tmp dirs for throw-away sessions. Those should never be
 * auto-listed on the dashboard.
 */
export function isTransientProjectDir(
  dir: string,
  homedir: string = os.homedir(),
  tmpdir: string = os.tmpdir(),
): boolean {
  if (!dir || !path.isAbsolute(dir)) return true

  const normalized = path.normalize(dir)
  const tmpNormalized = path.normalize(tmpdir)
  if (
    normalized === tmpNormalized ||
    normalized.startsWith(tmpNormalized + path.sep) ||
    normalized.startsWith(path.sep + "tmp" + path.sep) ||
    normalized.startsWith(path.sep + "var" + path.sep + "tmp" + path.sep) ||
    normalized === path.join(homedir, "tmp") ||
    normalized === path.join(homedir, ".tmp")
  ) {
    return true
  }

  for (const segment of normalized.split(path.sep)) {
    if (TRANSIENT_SEGMENTS.has(segment)) return true
    /* Matches "worktrees", ".worktrees", "my-repo-worktrees", "worktree-2", etc. */
    if (/worktree/i.test(segment)) return true
  }

  return false
}
