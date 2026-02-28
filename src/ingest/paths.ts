import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

export type Env = Record<string, string | undefined>

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
