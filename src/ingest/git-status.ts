/**
 * Git uncommitted changes counter.
 * Runs `git status --porcelain` via Bun.spawn with caching.
 */

export const GIT_STATUS_CACHE_TTL_MS = 30_000

const cache = new Map<string, { count: number; fetchedAt: number }>()

export async function getGitUncommittedCount(projectRoot: string): Promise<number | undefined> {
  try {
    const cached = cache.get(projectRoot)
    if (cached && Date.now() - cached.fetchedAt < GIT_STATUS_CACHE_TTL_MS) {
      return cached.count
    }

    const proc = Bun.spawn(["git", "status", "--porcelain"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    })

    const timeoutMs = 5_000
    const timeoutPromise = new Promise<undefined>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve(undefined)
      }, timeoutMs)
    })

    const workPromise = (async (): Promise<number | undefined> => {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) return undefined

      const lines = stdout.split("\n").filter((line) => line.length > 0)
      return lines.length
    })()

    const result = await Promise.race([workPromise, timeoutPromise])
    if (result === undefined) return undefined

    cache.set(projectRoot, { count: result, fetchedAt: Date.now() })
    return result
  } catch {
    return undefined
  }
}
