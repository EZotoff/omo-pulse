import type { WorktreeInfo, WorktreeSummary } from "../types"

export const GIT_WORKTREE_CACHE_TTL_MS = 30_000

const cache = new Map<string, { data: WorktreeInfo; fetchedAt: number }>()

const GIT_COMMAND_TIMEOUT_MS = 5_000

type ParsedWorktree = {
  path: string
  branch: string | null
  commitHash: string
  isMainWorktree: boolean
  isLocked: boolean
  isPrunable: boolean
}

export async function getWorktreeInfo(projectRoot: string): Promise<WorktreeInfo | undefined> {
  try {
    const cached = cache.get(projectRoot)
    if (cached && Date.now() - cached.fetchedAt < GIT_WORKTREE_CACHE_TTL_MS) {
      return cached.data
    }

    const porcelain = await runGitCommand(projectRoot, ["worktree", "list", "--porcelain"])
    if (porcelain === undefined) return undefined

    const mainBranch = await detectMainBranch(projectRoot)
    if (mainBranch === undefined) return undefined

    const parsedWorktrees = parseWorktreeListPorcelain(porcelain)
    if (parsedWorktrees === undefined) return undefined

    const worktrees: WorktreeSummary[] = []
    for (const worktree of parsedWorktrees) {
      let commitsAhead = 0
      let diffStat: WorktreeSummary["diffStat"] = null

      if (!worktree.isMainWorktree && !worktree.isPrunable) {
        const aheadOutput = await runGitCommand(worktree.path, ["log", `${mainBranch}..HEAD`, "--oneline"])
        if (aheadOutput === undefined) return undefined

        commitsAhead = countNonEmptyLines(aheadOutput)

        const diffStatOutput = await runGitCommand(worktree.path, ["diff", mainBranch, "--shortstat"])
        if (diffStatOutput === undefined) return undefined

        const parsedDiffStat = parseShortStat(diffStatOutput)
        if (parsedDiffStat === undefined) return undefined

        diffStat = parsedDiffStat
      }

      worktrees.push({
        ...worktree,
        commitsAhead,
        diffStat,
      })
    }

    worktrees.sort(compareWorktrees)

    const data: WorktreeInfo = {
      totalCount: worktrees.length,
      activeCount: worktrees.filter((worktree) => !worktree.isMainWorktree && !worktree.isPrunable).length,
      hotCount: worktrees.filter(isHotWorktree).length,
      worktrees,
    }

    cache.set(projectRoot, { data, fetchedAt: Date.now() })
    return data
  } catch {
    return undefined
  }
}

async function detectMainBranch(projectRoot: string): Promise<string | undefined> {
  const originHeadRef = await runGitCommand(projectRoot, ["symbolic-ref", "refs/remotes/origin/HEAD"])
  const trimmedOriginHeadRef = originHeadRef?.trim()
  if (trimmedOriginHeadRef) {
    return parseMainBranchRef(trimmedOriginHeadRef)
  }

  for (const branch of ["main", "master"]) {
    const localRef = await runGitCommand(projectRoot, ["rev-parse", "--verify", branch])
    if (localRef !== undefined) {
      return branch
    }
  }

  return undefined
}

async function runGitCommand(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })

    const timeoutPromise = new Promise<undefined>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve(undefined)
      }, GIT_COMMAND_TIMEOUT_MS)
    })

    const workPromise = (async (): Promise<string | undefined> => {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) return undefined

      return stdout
    })()

    return await Promise.race([workPromise, timeoutPromise])
  } catch {
    return undefined
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
