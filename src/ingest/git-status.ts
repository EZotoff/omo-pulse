/**
 * Git uncommitted changes counter.
 * Runs `git status --porcelain` via Bun.spawn with caching.
 */

export const GIT_STATUS_CACHE_TTL_MS = 30_000
const MAX_CACHE_SIZE = 100
const GIT_STATUS_TIMEOUT_MS = 5_000
const GIT_SIGKILL_GRACE_MS = 500
const NEGATIVE_CACHE_BASE_MS = 2_000
const NEGATIVE_CACHE_MAX_MS = GIT_STATUS_CACHE_TTL_MS

const cache = new Map<string, { count: number; fetchedAt: number }>()
const negativeCache = new Map<string, { nextRetryAt: number; failureCount: number }>()

function evictOldestIfFull(): void {
  if (cache.size < MAX_CACHE_SIZE) return
  let oldestKey: string | null = null
  let oldestAt = Infinity
  for (const [key, entry] of cache) {
    if (entry.fetchedAt < oldestAt) {
      oldestAt = entry.fetchedAt
      oldestKey = key
    }
  }
  if (oldestKey) cache.delete(oldestKey)
}

export async function getGitUncommittedCount(projectRoot: string): Promise<number | undefined> {
  const cached = cache.get(projectRoot)
  if (cached && Date.now() - cached.fetchedAt < GIT_STATUS_CACHE_TTL_MS) {
    return cached.count
  }

  const negative = negativeCache.get(projectRoot)
  if (negative && Date.now() < negative.nextRetryAt) {
    return undefined
  }

  const result = await runGitStatusPorcelain(projectRoot)

  if (result === undefined) {
    recordFailure(projectRoot)
    return undefined
  }

  evictOldestIfFull()
  cache.set(projectRoot, { count: result, fetchedAt: Date.now() })
  negativeCache.delete(projectRoot)
  return result
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

async function runGitStatusPorcelain(projectRoot: string): Promise<number | undefined> {
  let outerTimer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    })

    const workPromise = (async (): Promise<number | undefined> => {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) return undefined

      const lines = stdout.split("\n").filter((line) => line.length > 0)
      return lines.length
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
      }, GIT_STATUS_TIMEOUT_MS)
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
