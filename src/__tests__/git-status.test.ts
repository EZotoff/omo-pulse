import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const spawnMock = vi.fn()
vi.stubGlobal("Bun", { spawn: spawnMock })

import { getGitUncommittedCount, GIT_STATUS_CACHE_TTL_MS } from "../ingest/git-status"

function mockSpawnResult(
  stdout: string,
  exitCode: number | Promise<number>,
  opts: { kill?: ReturnType<typeof vi.fn>; hangStdout?: boolean } = {},
) {
  return {
    stdout: opts.hangStdout
      ? new ReadableStream({ start() {} })
      : new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(stdout))
            controller.close()
          },
        }),
    stderr: new ReadableStream({ start(c) { c.close() } }),
    exited: exitCode instanceof Promise ? exitCode : Promise.resolve(exitCode),
    kill: opts.kill ?? vi.fn(),
    pid: 1234,
  }
}

describe("getGitUncommittedCount", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("exports GIT_STATUS_CACHE_TTL_MS as 30_000", () => {
    expect(GIT_STATUS_CACHE_TTL_MS).toBe(30_000)
  })

  it("returns count of non-empty stdout lines", async () => {
    spawnMock.mockReturnValue(mockSpawnResult(" M file1.ts\n M file2.ts\n?? file3.ts\n", 0))

    const result = await getGitUncommittedCount("/test/normal-count")

    expect(result).toBe(3)
    expect(spawnMock).toHaveBeenCalledWith(
      ["git", "status", "--porcelain"],
      expect.objectContaining({ cwd: "/test/normal-count", stdout: "pipe", stderr: "pipe" }),
    )
  })

  it("returns 0 when stdout is empty", async () => {
    spawnMock.mockReturnValue(mockSpawnResult("", 0))

    const result = await getGitUncommittedCount("/test/zero-changes")

    expect(result).toBe(0)
  })

  it("returns undefined on non-zero exit code", async () => {
    spawnMock.mockReturnValue(mockSpawnResult("", 128))

    const result = await getGitUncommittedCount("/test/git-fail")

    expect(result).toBeUndefined()
  })

  it("returns undefined and kills process on timeout", async () => {
    const killFn = vi.fn()
    spawnMock.mockReturnValue(
      mockSpawnResult("", new Promise<number>(() => {}), { kill: killFn, hangStdout: true }),
    )

    const promise = getGitUncommittedCount("/test/timeout")
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await promise

    expect(result).toBeUndefined()
    expect(killFn).toHaveBeenCalled()
  })

  it("returns cached value on second call within TTL", async () => {
    spawnMock.mockReturnValue(mockSpawnResult("M file.ts\n", 0))

    const first = await getGitUncommittedCount("/test/cache-hit")
    expect(first).toBe(1)
    expect(spawnMock).toHaveBeenCalledTimes(1)

    const second = await getGitUncommittedCount("/test/cache-hit")
    expect(second).toBe(1)
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it("re-fetches after cache TTL expires", async () => {
    spawnMock.mockReturnValue(mockSpawnResult("M file.ts\n", 0))

    const first = await getGitUncommittedCount("/test/cache-expire")
    expect(first).toBe(1)
    expect(spawnMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(GIT_STATUS_CACHE_TTL_MS + 1)

    spawnMock.mockReturnValue(mockSpawnResult("M a.ts\nM b.ts\n", 0))

    const second = await getGitUncommittedCount("/test/cache-expire")
    expect(second).toBe(2)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it("returns undefined when Bun.spawn throws", async () => {
    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed")
    })

    const result = await getGitUncommittedCount("/test/spawn-throw")

    expect(result).toBeUndefined()
  })

  it("does not cache undefined results from failed git calls", async () => {
    spawnMock.mockReturnValue(mockSpawnResult("", 1))

    const first = await getGitUncommittedCount("/test/no-cache-fail")
    expect(first).toBeUndefined()

    spawnMock.mockReturnValue(mockSpawnResult("M file.ts\n", 0))

    const second = await getGitUncommittedCount("/test/no-cache-fail")
    expect(second).toBe(1)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })
})
