import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const spawnMock = vi.fn()
if (typeof vi.stubGlobal !== "function") {
  Object.assign(vi, {
    stubGlobal(name: string, value: unknown) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
      if (descriptor && !descriptor.configurable) {
        const existingValue = (globalThis as Record<string, unknown>)[name]
        if (
          existingValue !== null
          && typeof existingValue === "object"
          && value !== null
          && typeof value === "object"
        ) {
          Object.assign(existingValue as object, value as object)
          return
        }

        throw new TypeError(`Cannot stub global ${name}`)
      }

      Object.defineProperty(globalThis, name, {
        value,
        configurable: true,
        writable: true,
      })
    },
  })
}

if (typeof vi.advanceTimersByTimeAsync !== "function") {
  Object.assign(vi, {
    async advanceTimersByTimeAsync(ms: number) {
      vi.advanceTimersByTime(ms)
      await Promise.resolve()
      await Promise.resolve()
    },
  })
}

vi.stubGlobal("Bun", { spawn: spawnMock })

import { getWorktreeInfo } from "../ingest/git-worktrees"

type MockSpawnResultOptions = {
  stdout?: string
  stderr?: string
  exitCode?: number | Promise<number>
  kill?: ReturnType<typeof vi.fn>
  hangStdout?: boolean
}

function createReadableStream(text: string, hang = false): ReadableStream<Uint8Array> {
  if (hang) {
    return new ReadableStream({ start() {} })
  }

  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function mockSpawnResult(options: MockSpawnResultOptions = {}) {
  return {
    stdout: createReadableStream(options.stdout ?? "", options.hangStdout ?? false),
    stderr: createReadableStream(options.stderr ?? ""),
    exited: options.exitCode instanceof Promise ? options.exitCode : Promise.resolve(options.exitCode ?? 0),
    kill: options.kill ?? vi.fn(),
    pid: 1234,
  }
}

function queueSpawnResults(...results: ReturnType<typeof mockSpawnResult>[]): void {
  for (const result of results) {
    spawnMock.mockReturnValueOnce(result)
  }
}

describe("getWorktreeInfo", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("parses multiple worktrees", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: [
          "worktree /repo/normal",
          "HEAD aaaaaaaa",
          "branch refs/heads/main",
          "",
          "worktree /repo/normal-feature-one",
          "HEAD bbbbbbbb",
          "branch refs/heads/feature-one",
          "",
          "worktree /repo/normal-feature-two",
          "HEAD cccccccc",
          "branch refs/heads/feature-two",
          "",
        ].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
      mockSpawnResult({ stdout: "" }),
      mockSpawnResult({ stdout: "" }),
      mockSpawnResult({ stdout: "" }),
      mockSpawnResult({ stdout: "" }),
    )

    const result = await getWorktreeInfo("/repo/normal")

    expect(result).toEqual({
      totalCount: 3,
      activeCount: 2,
      hotCount: 0,
      worktrees: [
        {
          path: "/repo/normal-feature-one",
          branch: "feature-one",
          commitHash: "bbbbbbbb",
          isMainWorktree: false,
          commitsAhead: 0,
          diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
          isLocked: false,
          isPrunable: false,
        },
        {
          path: "/repo/normal-feature-two",
          branch: "feature-two",
          commitHash: "cccccccc",
          isMainWorktree: false,
          commitsAhead: 0,
          diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
          isLocked: false,
          isPrunable: false,
        },
        {
          path: "/repo/normal",
          branch: "main",
          commitHash: "aaaaaaaa",
          isMainWorktree: true,
          commitsAhead: 0,
          diffStat: null,
          isLocked: false,
          isPrunable: false,
        },
      ],
    })
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      ["git", "worktree", "list", "--porcelain"],
      expect.objectContaining({ cwd: "/repo/normal", stdout: "pipe", stderr: "pipe" }),
    )
  })

  it("uses null for detached HEAD branches", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: [
          "worktree /repo/detached",
          "HEAD 11111111",
          "branch refs/heads/main",
          "",
          "worktree /repo/detached-feature",
          "HEAD 22222222",
          "detached",
          "",
        ].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
      mockSpawnResult({ stdout: "ahead-one\n" }),
      mockSpawnResult({ stdout: " 2 files changed, 4 deletions(-)\n" }),
    )

    const result = await getWorktreeInfo("/repo/detached")
    const detachedWorktree = result?.worktrees.find((worktree) => worktree.path === "/repo/detached-feature")

    expect(detachedWorktree).toEqual({
      path: "/repo/detached-feature",
      branch: null,
      commitHash: "22222222",
      isMainWorktree: false,
      commitsAhead: 1,
      diffStat: { filesChanged: 2, insertions: 0, deletions: 4 },
      isLocked: false,
      isPrunable: false,
    })
  })

  it("parses locked flags", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: [
          "worktree /repo/locked",
          "HEAD 11111111",
          "branch refs/heads/main",
          "",
          "worktree /repo/locked-feature",
          "HEAD 22222222",
          "branch refs/heads/feature-locked",
          "locked by maintenance",
          "",
        ].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
      mockSpawnResult({ stdout: "" }),
      mockSpawnResult({ stdout: "" }),
    )

    const result = await getWorktreeInfo("/repo/locked")
    const lockedWorktree = result?.worktrees.find((worktree) => worktree.path === "/repo/locked-feature")

    expect(lockedWorktree).toEqual({
      path: "/repo/locked-feature",
      branch: "feature-locked",
      commitHash: "22222222",
      isMainWorktree: false,
      commitsAhead: 0,
      diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
      isLocked: true,
      isPrunable: false,
    })
  })

  it("marks prunable worktrees and skips ahead and diff probes", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: [
          "worktree /repo/prunable",
          "HEAD 11111111",
          "branch refs/heads/main",
          "",
          "worktree /repo/prunable-feature",
          "HEAD 22222222",
          "branch refs/heads/feature-prunable",
          "prunable gitdir file points nowhere",
          "",
        ].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
    )

    const result = await getWorktreeInfo("/repo/prunable")
    const commands = spawnMock.mock.calls.map(([args]) => (args as string[]).join(" "))

    expect(result).toEqual({
      totalCount: 2,
      activeCount: 0,
      hotCount: 0,
      worktrees: [
        {
          path: "/repo/prunable-feature",
          branch: "feature-prunable",
          commitHash: "22222222",
          isMainWorktree: false,
          commitsAhead: 0,
          diffStat: null,
          isLocked: false,
          isPrunable: true,
        },
        {
          path: "/repo/prunable",
          branch: "main",
          commitHash: "11111111",
          isMainWorktree: true,
          commitsAhead: 0,
          diffStat: null,
          isLocked: false,
          isPrunable: false,
        },
      ],
    })
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(commands.some((command) => command.includes(" log "))).toBe(false)
    expect(commands.some((command) => command.includes(" diff "))).toBe(false)
  })

  it("returns undefined for non-git directories", async () => {
    spawnMock.mockReturnValue(mockSpawnResult({ exitCode: 128 }))

    const result = await getWorktreeInfo("/repo/not-a-git-repo")

    expect(result).toBeUndefined()
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it("returns undefined and kills the process after 5 seconds on timeout", async () => {
    const killFn = vi.fn()
    spawnMock.mockReturnValue(
      mockSpawnResult({
        exitCode: new Promise<number>(() => {}),
        kill: killFn,
        hangStdout: true,
      }),
    )

    const promise = getWorktreeInfo("/repo/timeout")
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await promise

    expect(result).toBeUndefined()
    expect(killFn).toHaveBeenCalled()
  })

  it("returns cached worktree info on repeated calls within TTL", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: ["worktree /repo/cache-hit", "HEAD aaaaaaaa", "branch refs/heads/main", ""].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
    )

    const first = await getWorktreeInfo("/repo/cache-hit")
    const second = await getWorktreeInfo("/repo/cache-hit")

    expect(first).toEqual(second)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it("refreshes worktree info after cache expiry", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: ["worktree /repo/cache-expire", "HEAD firsthash", "branch refs/heads/main", ""].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
    )

    const first = await getWorktreeInfo("/repo/cache-expire")
    expect(first?.worktrees[0]?.commitHash).toBe("firsthash")
    expect(spawnMock).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(30_000 + 1)

    queueSpawnResults(
      mockSpawnResult({
        stdout: ["worktree /repo/cache-expire", "HEAD secondhash", "branch refs/heads/main", ""].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
    )

    const second = await getWorktreeInfo("/repo/cache-expire")

    expect(second?.worktrees[0]?.commitHash).toBe("secondhash")
    expect(spawnMock).toHaveBeenCalledTimes(4)
  })

  it("parses shortstat output", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: [
          "worktree /repo/shortstat",
          "HEAD 11111111",
          "branch refs/heads/main",
          "",
          "worktree /repo/shortstat-feature",
          "HEAD 22222222",
          "branch refs/heads/feature-shortstat",
          "",
        ].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
      mockSpawnResult({ stdout: "ahead-one\nahead-two\n" }),
      mockSpawnResult({ stdout: " 3 files changed, 7 insertions(+)\n" }),
    )

    const result = await getWorktreeInfo("/repo/shortstat")
    const featureWorktree = result?.worktrees.find((worktree) => worktree.path === "/repo/shortstat-feature")

    expect(featureWorktree).toEqual({
      path: "/repo/shortstat-feature",
      branch: "feature-shortstat",
      commitHash: "22222222",
      isMainWorktree: false,
      commitsAhead: 2,
      diffStat: { filesChanged: 3, insertions: 7, deletions: 0 },
      isLocked: false,
      isPrunable: false,
    })
  })

  it("falls back to local main and then master when origin HEAD is unavailable", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: ["worktree /repo/fallback-main", "HEAD 11111111", "branch refs/heads/main", ""].join("\n"),
      }),
      mockSpawnResult({ exitCode: 1 }),
      mockSpawnResult({ stdout: "11111111\n" }),
      mockSpawnResult({
        stdout: ["worktree /repo/fallback-master", "HEAD 22222222", "branch refs/heads/master", ""].join("\n"),
      }),
      mockSpawnResult({ exitCode: 1 }),
      mockSpawnResult({ exitCode: 1 }),
      mockSpawnResult({ stdout: "22222222\n" }),
    )

    const mainFallback = await getWorktreeInfo("/repo/fallback-main")
    const masterFallback = await getWorktreeInfo("/repo/fallback-master")

    expect(mainFallback?.worktrees[0]).toMatchObject({ branch: "main" })
    expect(masterFallback?.worktrees[0]).toMatchObject({ branch: "master" })
    expect(spawnMock).toHaveBeenCalledTimes(7)
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
      expect.objectContaining({ cwd: "/repo/fallback-main" }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      3,
      ["git", "rev-parse", "--verify", "main"],
      expect.objectContaining({ cwd: "/repo/fallback-main" }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      5,
      ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
      expect.objectContaining({ cwd: "/repo/fallback-master" }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      6,
      ["git", "rev-parse", "--verify", "main"],
      expect.objectContaining({ cwd: "/repo/fallback-master" }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      7,
      ["git", "rev-parse", "--verify", "master"],
      expect.objectContaining({ cwd: "/repo/fallback-master" }),
    )
  })

  it("classifies hot worktrees", async () => {
    queueSpawnResults(
      mockSpawnResult({
        stdout: [
          "worktree /repo/hot",
          "HEAD 11111111",
          "branch refs/heads/main",
          "",
          "worktree /repo/hot-feature",
          "HEAD 22222222",
          "branch refs/heads/feature-hot",
          "",
          "worktree /repo/cold-feature",
          "HEAD 33333333",
          "branch refs/heads/feature-cold",
          "",
        ].join("\n"),
      }),
      mockSpawnResult({ stdout: "refs/remotes/origin/main\n" }),
      mockSpawnResult({ stdout: "ahead-one\n" }),
      mockSpawnResult({ stdout: " 1 file changed, 1 insertion(+)\n" }),
      mockSpawnResult({ stdout: "ahead-one\nahead-two\n" }),
      mockSpawnResult({ stdout: "" }),
    )

    const result = await getWorktreeInfo("/repo/hot")

    expect(result).toMatchObject({ totalCount: 3, activeCount: 2, hotCount: 1 })
    expect(result?.worktrees[0]).toEqual({
      path: "/repo/hot-feature",
      branch: "feature-hot",
      commitHash: "22222222",
      isMainWorktree: false,
      commitsAhead: 1,
      diffStat: { filesChanged: 1, insertions: 1, deletions: 0 },
      isLocked: false,
      isPrunable: false,
    })
    expect(result?.worktrees[1]).toEqual({
      path: "/repo/cold-feature",
      branch: "feature-cold",
      commitHash: "33333333",
      isMainWorktree: false,
      commitsAhead: 2,
      diffStat: { filesChanged: 0, insertions: 0, deletions: 0 },
      isLocked: false,
      isPrunable: false,
    })
  })
})
