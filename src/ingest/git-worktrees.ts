import type { WorktreeInfo, WorktreeSummary } from "../types"

export const GIT_WORKTREE_CACHE_TTL_MS = 30_000

const cache = new Map<string, { data: WorktreeInfo; fingerprint: string | null; fetchedAt: number }>()

const negativeCache = new Map<string, { nextRetryAt: number; failureCount: number }>()

const GIT_COMMAND_TIMEOUT_MS = 5_000
const GIT_SIGKILL_GRACE_MS = 500
const NEGATIVE_CACHE_BASE_MS = 2_000
const NEGATIVE_CACHE_MAX_MS = GIT_WORKTREE_CACHE_TTL_MS
export const WORKTREE_SKIP_MS = 10 * 60_000

const worktreeSkipUntil = new Map<string, number>()

type ParsedWorktree = {
  path: string
  branch: string | null
  commitHash: string
  isMainWorktree: boolean
  isLocked: boolean
  isPrunable: boolean
}

export async function getWorktreeInfo(projectRoot: string): Promise<WorktreeInfo | undefined> {
  const cached = cache.get(projectRoot)
  if (cached && Date.now() - cached.fetchedAt < GIT_WORKTREE_CACHE_TTL_MS) {
    return cached.data
  }

  const negative = negativeCache.get(projectRoot)
  if (negative && Date.now() < negative.nextRetryAt) {
    return undefined
  }

  const previous = cached !== undefined && cached.fingerprint !== null
    ? { fingerprint: cached.fingerprint, data: cached.data }
    : undefined

  const computed = await computeWorktreeInfo(projectRoot, previous)

  if (computed === undefined) {
    recordFailure(projectRoot)
    return undefined
  }

  cache.set(projectRoot, { data: computed.data, fingerprint: computed.fingerprint, fetchedAt: Date.now() })
  negativeCache.delete(projectRoot)
  return computed.data
}

function recordFailure(projectRoot: string): void {
  const prev = negativeCache.get(projectRoot)
  const failureCount = (prev?.failureCount ?? 0) + 1
  negativeCache.set(projectRoot, {
    nextRetryAt: Date.now() + backoffDelayMs(failureCount),
    failureCount,
  })
}

function backoffDelayMs(failureCount: number): number {
  return Math.min(NEGATIVE_CACHE_BASE_MS * 2 ** (failureCount - 1), NEGATIVE_CACHE_MAX_MS)
}

async function computeWorktreeInfo(
  projectRoot: string,
  previous?: { fingerprint: string; data: WorktreeInfo },
): Promise<{ data: WorktreeInfo; fingerprint: string | null } | undefined> {
  try {
    const porcelain = await runGitCommand(projectRoot, ["worktree", "list", "--porcelain"])
    if (porcelain === undefined) return undefined

    const mainBranch = await detectMainBranch(projectRoot)
    if (mainBranch === undefined) return undefined

    const parsedWorktrees = parseWorktreeListPorcelain(porcelain)
    if (parsedWorktrees === undefined) return undefined

    const fingerprint = JSON.stringify([
      mainBranch.sha,
      parsedWorktrees
        .map((worktree) => [worktree.path, worktree.commitHash] as const)
        .sort((left, right) => left[0].localeCompare(right[0])),
    ])
    if (previous !== undefined && previous.fingerprint === fingerprint) {
      return { data: previous.data, fingerprint }
    }

    const worktrees: WorktreeSummary[] = []
    let degraded = false
    for (const worktree of parsedWorktrees) {
      let commitsAhead = 0
      let diffStat: WorktreeSummary["diffStat"] = null

      if (!worktree.isMainWorktree && !worktree.isPrunable) {
        const skipUntil = worktreeSkipUntil.get(worktree.path) ?? 0
        if (Date.now() < skipUntil) {
          degraded = true
          worktrees.push({ ...worktree, commitsAhead: 0, diffStat: null })
          continue
        }

        const aheadOutput = await runGitCommand(worktree.path, ["log", `${mainBranch.branch}..HEAD`, "--oneline"])
        if (aheadOutput === undefined) {
          degraded = true
          worktreeSkipUntil.set(worktree.path, Date.now() + WORKTREE_SKIP_MS)
          worktrees.push({ ...worktree, commitsAhead: 0, diffStat: null })
          continue
        }

        commitsAhead = countNonEmptyLines(aheadOutput)

        const diffStatOutput = await runGitCommand(worktree.path, ["diff", `${mainBranch.branch}...HEAD`, "--shortstat"])
        if (diffStatOutput === undefined) {
          degraded = true
          worktreeSkipUntil.set(worktree.path, Date.now() + WORKTREE_SKIP_MS)
          worktrees.push({ ...worktree, commitsAhead, diffStat: null })
          continue
        }

        diffStat = parseShortStat(diffStatOutput) ?? null
      }

      worktrees.push({
        ...worktree,
        commitsAhead,
        diffStat,
      })
    }

    worktrees.sort(compareWorktrees)

    return {
      data: {
        totalCount: worktrees.length,
        activeCount: worktrees.filter((worktree) => !worktree.isMainWorktree && !worktree.isPrunable).length,
        hotCount: worktrees.filter(isHotWorktree).length,
        worktrees,
      },
      fingerprint: degraded ? null : fingerprint,
    }
  } catch {
    return undefined
  }
}

async function detectMainBranch(projectRoot: string): Promise<{ branch: string; sha: string } | undefined> {
  const originHeadRef = await runGitCommand(projectRoot, ["symbolic-ref", "refs/remotes/origin/HEAD"])
  const trimmedOriginHeadRef = originHeadRef?.trim()
  if (trimmedOriginHeadRef) {
    const branch = parseMainBranchRef(trimmedOriginHeadRef)
    const sha = await runGitCommand(projectRoot, ["rev-parse", "--verify", branch])
    if (sha !== undefined) {
      return { branch, sha: sha.trim() }
    }
  }

  for (const branch of ["main", "master"]) {
    const localRef = await runGitCommand(projectRoot, ["rev-parse", "--verify", branch])
    if (localRef !== undefined) {
      return { branch, sha: localRef.trim() }
    }
  }

  return undefined
}

async function runGitCommand(cwd: string, args: string[]): Promise<string | undefined> {
  let outerTimer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })

    const workPromise = (async (): Promise<string | undefined> => {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) return undefined

      return stdout
    })()

    const timeoutPromise = new Promise<undefined>((resolve) => {
      outerTimer = setTimeout(() => {
        timedOut = true
        try {
          proc.kill()
        } catch {}
        setTimeout(() => {
          try {
            proc.kill("SIGKILL")
          } catch {}
        }, GIT_SIGKILL_GRACE_MS)
        resolve(undefined)
      }, GIT_COMMAND_TIMEOUT_MS)
    })

    return await Promise.race([workPromise, timeoutPromise])
  } catch {
    return undefined
  } finally {
    if (!timedOut && outerTimer !== undefined) {
      clearTimeout(outerTimer)
    }
  }
}

function parseWorktreeListPorcelain(output: string): ParsedWorktree[] | undefined {
  const lines = output.split("\n")
  const worktrees: ParsedWorktree[] = []

  let current: Partial<ParsedWorktree> | null = null

  const finalizeCurrent = (): boolean => {
    if (current === null) return true
    if (typeof current.path !== "string" || current.path.length === 0) return false
    if (typeof current.commitHash !== "string" || current.commitHash.length === 0) return false

    worktrees.push({
      path: current.path,
      branch: current.branch ?? null,
      commitHash: current.commitHash,
      isMainWorktree: worktrees.length === 0,
      isLocked: current.isLocked === true,
      isPrunable: current.isPrunable === true,
    })

    current = null
    return true
  }

  for (const line of lines) {
    if (line.length === 0) {
      if (!finalizeCurrent()) return undefined
      continue
    }

    if (line.startsWith("worktree ")) {
      if (!finalizeCurrent()) return undefined
      current = {
        path: line.slice("worktree ".length),
        branch: null,
      }
      continue
    }

    if (current === null) return undefined

    if (line.startsWith("HEAD ")) {
      current.commitHash = line.slice("HEAD ".length)
      continue
    }

    if (line.startsWith("branch ")) {
      current.branch = parseBranchRef(line.slice("branch ".length))
      continue
    }

    if (line === "detached" || line.startsWith("detached ")) {
      current.branch = null
      continue
    }

    if (line === "locked" || line.startsWith("locked ")) {
      current.isLocked = true
      continue
    }

    if (line === "prunable" || line.startsWith("prunable ")) {
      current.isPrunable = true
    }
  }

  if (!finalizeCurrent()) return undefined
  if (worktrees.length === 0) return undefined

  return worktrees
}

function parseBranchRef(ref: string): string {
  const prefix = "refs/heads/"
  if (ref.startsWith(prefix)) {
    return ref.slice(prefix.length)
  }

  return ref
}

function parseMainBranchRef(ref: string): string {
  const lastSlashIndex = ref.lastIndexOf("/")
  if (lastSlashIndex >= 0 && lastSlashIndex < ref.length - 1) {
    return ref.slice(lastSlashIndex + 1)
  }

  return ref
}

function parseShortStat(output: string): WorktreeSummary["diffStat"] | undefined {
  const trimmed = output.trim()
  if (trimmed.length === 0) {
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }

  const filesChangedMatch = trimmed.match(/(\d+)\s+files?\s+changed/)
  if (filesChangedMatch === null) return undefined

  const insertionsMatch = trimmed.match(/(\d+)\s+insertions?\(\+\)/)
  const deletionsMatch = trimmed.match(/(\d+)\s+deletions?\(-\)/)

  return {
    filesChanged: Number(filesChangedMatch[1]),
    insertions: insertionsMatch ? Number(insertionsMatch[1]) : 0,
    deletions: deletionsMatch ? Number(deletionsMatch[1]) : 0,
  }
}

function countNonEmptyLines(output: string): number {
  return output.split("\n").filter((line) => line.length > 0).length
}

function isHotWorktree(worktree: WorktreeSummary): boolean {
  return worktree.commitsAhead > 0 && (worktree.diffStat?.filesChanged ?? 0) > 0
}

function compareWorktrees(left: WorktreeSummary, right: WorktreeSummary): number {
  const leftHot = isHotWorktree(left)
  const rightHot = isHotWorktree(right)
  if (leftHot !== rightHot) {
    return leftHot ? -1 : 1
  }

  const branchComparison = (left.branch ?? "~").localeCompare(right.branch ?? "~")
  if (branchComparison !== 0) {
    return branchComparison
  }

  return left.path.localeCompare(right.path)
}
