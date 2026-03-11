import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { spawnSync } from "node:child_process"

import { afterEach, describe, expect, it } from "vitest"
import { createEmptyDiffScorecard, normalizeModelScorecard } from "../../scripts/ai-diff-review"
import { parseReviewScorecard } from "../review/policy"
import type { ReviewScorecard } from "../review/types"

type DiffReviewRunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-ai-diff-review-"))
  tempDirs.push(dir)
  return dir
}

function runDiffReview(args: string[], env?: Record<string, string | undefined>): DiffReviewRunResult {
  const processEnv: Record<string, string | undefined> = { ...process.env, ...env }

  const proc = spawnSync("bun", ["run", "scripts/ai-diff-review.ts", ...args], {
    cwd: process.cwd(),
    env: processEnv,
    encoding: "utf8",
  })

  return {
    exitCode: proc.status ?? -1,
    stdout: proc.stdout,
    stderr: proc.stderr,
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("ai-diff-review CLI", () => {
  it("exits 0 and prints usage for --help flag", () => {
    const result = runDiffReview(["--help"])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("Usage: bun run scripts/ai-diff-review.ts")
    expect(result.stderr).toContain("--repository")
    expect(result.stderr).toContain("--pull-number")
    expect(result.stderr).toContain("--output")
  })

  it("exits 1 with usage message when no arguments provided", () => {
    const result = runDiffReview([])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required arguments")
    expect(result.stderr).toContain("Usage: bun run scripts/ai-diff-review.ts")
  })

  it("exits 1 when GITHUB_TOKEN is not set", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")

    const result = runDiffReview(
      ["--repository", "owner/repo", "--pull-number", "1", "--output", outputPath],
      { GITHUB_TOKEN: undefined, GH_TOKEN: undefined },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("GITHUB_TOKEN or GH_TOKEN is required")
  })

  it("exits 1 when --repository is missing", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")

    const result = runDiffReview(
      ["--pull-number", "1", "--output", outputPath],
      { GITHUB_TOKEN: "test-token" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required argument --repository")
  })

  it("exits 1 when --pull-number is missing", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")

    const result = runDiffReview(
      ["--repository", "owner/repo", "--output", outputPath],
      { GITHUB_TOKEN: "test-token" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required argument --pull-number")
  })

  it("exits 1 when --output is missing", () => {
    const result = runDiffReview(
      ["--repository", "owner/repo", "--pull-number", "1"],
      { GITHUB_TOKEN: "test-token" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required argument --output")
  })

  it("exits 1 when --pull-number is not a positive integer", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")

    const result = runDiffReview(
      ["--repository", "owner/repo", "--pull-number", "abc", "--output", outputPath],
      { GITHUB_TOKEN: "test-token" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("--pull-number must be a positive integer")
  })

  it("exits 1 when --pull-number is zero", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")

    const result = runDiffReview(
      ["--repository", "owner/repo", "--pull-number", "0", "--output", outputPath],
      { GITHUB_TOKEN: "test-token" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("--pull-number must be a positive integer")
  })

  it("exits 1 when --max-diff-chars is not a positive integer", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")

    const result = runDiffReview(
      [
        "--repository",
        "owner/repo",
        "--pull-number",
        "1",
        "--output",
        outputPath,
        "--max-diff-chars",
        "-100",
      ],
      { GITHUB_TOKEN: "test-token" },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("--max-diff-chars must be a positive integer")
  })
})

describe("createEmptyDiffScorecard", () => {
  it("returns scorecard with all required fields when diff contains only excluded files", () => {
    const scorecard = createEmptyDiffScorecard()

    expect(scorecard.summary).toBe("No reviewable diff remained after filtering excluded files.")
    expect(scorecard.source).toBe("llm-empty-diff")
    expect(scorecard.scores.security).toBe(4.5)
    expect(scorecard.scores.safety).toBe(4.5)
    expect(scorecard.scores.performance).toBe(4.5)
    expect(scorecard.scores.featureQuality).toBe(4.5)
    expect(scorecard.scores.confidence).toBe(4.5)
    expect(scorecard.risk).toBe("low")
    expect(scorecard.autoApproveAllowed).toBe(false)
    expect(scorecard.findings).toEqual([])
  })
})

describe("normalizeModelScorecard", () => {
  it("rejects non-object responses", () => {
    expect(() => normalizeModelScorecard(null, "gpt-4o-mini")).toThrow(
      "GitHub Models response must be a JSON object",
    )
    expect(() => normalizeModelScorecard("invalid", "gpt-4o-mini")).toThrow(
      "GitHub Models response must be a JSON object",
    )
    expect(() => normalizeModelScorecard(123, "gpt-4o-mini")).toThrow(
      "GitHub Models response must be a JSON object",
    )
  })

  it("normalizes valid model output and clamps scores to 1-5 range with 2 decimals", () => {
    const rawResponse = {
      summary: "Code looks good",
      source: "custom-source",
      scores: {
        security: 0.5,
        safety: 6.5,
        performance: 3.456,
        featureQuality: 4.8,
        confidence: 4.2,
      },
      risk: "low",
      autoApproveAllowed: true,
      findings: [],
    }

    const normalized = normalizeModelScorecard(rawResponse, "gpt-4o-mini")

    expect(normalized.summary).toBe("Code looks good")
    expect(normalized.source).toBe("custom-source")
    expect(normalized.scores.security).toBe(1)
    expect(normalized.scores.safety).toBe(5)
    expect(normalized.scores.performance).toBe(3.46)
    expect(normalized.scores.featureQuality).toBe(4.8)
    expect(normalized.scores.confidence).toBe(4.2)
    expect(normalized.risk).toBe("low")
    expect(normalized.autoApproveAllowed).toBe(true)
  })

  it("uses model source when response does not provide source", () => {
    const rawResponse = {
      summary: "Review complete",
      scores: {
        security: 4.5,
        safety: 4.5,
        performance: 4.5,
        featureQuality: 4.5,
        confidence: 4.5,
      },
      risk: "low",
      autoApproveAllowed: false,
      findings: [],
    }

    const normalized = normalizeModelScorecard(rawResponse, "claude-3.5-sonnet")

    expect(normalized.source).toBe("llm-claude-3-5-sonnet")
  })

  it("throws when scores field contains non-numbers", () => {
    const rawResponse = {
      summary: "Review",
      scores: {
        security: "invalid",
        safety: 4.5,
        performance: 4.5,
        featureQuality: 4.5,
        confidence: 4.5,
      },
      risk: "low",
      autoApproveAllowed: false,
      findings: [],
    }

    expect(() => normalizeModelScorecard(rawResponse, "gpt-4o-mini")).toThrow("scores.security must be a number")
  })

  it("parses and validates result through parseReviewScorecard", () => {
    const rawResponse = {
      summary: "All good",
      source: "test",
      scores: {
        security: 4.9,
        safety: 4.9,
        performance: 4.8,
        featureQuality: 4.9,
        confidence: 4.8,
      },
      risk: "low",
      autoApproveAllowed: true,
      findings: [],
    }

    const normalized = normalizeModelScorecard(rawResponse, "gpt-4o-mini")

    expect(normalized).toMatchObject({
      summary: "All good",
      source: "test",
      scores: expect.objectContaining({
        security: 4.9,
        safety: 4.9,
      }),
      risk: "low",
      autoApproveAllowed: true,
    })
  })
})
