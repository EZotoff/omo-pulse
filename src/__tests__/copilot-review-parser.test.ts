import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { pathToFileURL } from "node:url"

import { afterEach, describe, expect, it } from "vitest"

import {
  buildCopilotScorecard,
  deriveScoresFromFindings,
  isCopilotReviewAuthor,
  normalizeCopilotSeverity,
  parseInlineCommentFinding,
  parseReviewBody,
  parseRiskToken,
  parseScoresBlock,
  parseSummaryBlock,
  selectLatestCopilotReview,
  stripReviewTokens,
} from "../../scripts/copilot-review-parser"

type CopilotParserRunResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omo-pulse-copilot-review-parser-"))
  tempDirs.push(dir)
  return dir
}

function runCopilotParser(args: string[]): CopilotParserRunResult {
  const proc = spawnSync("bun", ["run", "scripts/copilot-review-parser.ts", ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  })

  return {
    exitCode: proc.status ?? -1,
    stdout: proc.stdout,
    stderr: proc.stderr,
  }
}

async function loadCopilotParserInternals(): Promise<{
  filterCommentsForReview: (
    review: { id?: number },
    comments: Array<{
      body?: string | null
      path?: string | null
      line?: number | null
      user?: { login?: string | null } | null
      pull_request_review_id?: number | null
    }>,
  ) => Array<{
    body?: string | null
    path?: string | null
    line?: number | null
    user?: { login?: string | null } | null
    pull_request_review_id?: number | null
  }>
}> {
  const sourcePath = path.join(process.cwd(), "scripts", "copilot-review-parser.ts")
  const tempDir = makeTempDir()
  const tempModulePath = path.join(tempDir, "copilot-review-parser.internals.ts")
  const policyModuleUrl = pathToFileURL(path.join(process.cwd(), "src", "review", "policy.ts")).href
  const typesModuleUrl = pathToFileURL(path.join(process.cwd(), "src", "review", "types.ts")).href

  const patchedSource = fs
    .readFileSync(sourcePath, "utf8")
    .replace(/^#!.*\n/, "")
    .replace('"../src/review/policy"', `"${policyModuleUrl}"`)
    .replace('"../src/review/types"', `"${typesModuleUrl}"`)

  fs.writeFileSync(tempModulePath, `${patchedSource}\nexport { filterCommentsForReview }\n`, "utf8")

  return import(`${pathToFileURL(tempModulePath).href}?t=${Date.now()}`) as Promise<{
    filterCommentsForReview: (
      review: { id?: number },
      comments: Array<{
        body?: string | null
        path?: string | null
        line?: number | null
        user?: { login?: string | null } | null
        pull_request_review_id?: number | null
      }>,
    ) => Array<{
      body?: string | null
      path?: string | null
      line?: number | null
      user?: { login?: string | null } | null
      pull_request_review_id?: number | null
    }>
  }>
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("copilot-review-parser CLI", () => {
  it("exits 0 and prints usage to stdout for --help", () => {
    const result = runCopilotParser(["--help"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Usage: bun run scripts/copilot-review-parser.ts")
    expect(result.stdout).toContain("--repository")
    expect(result.stdout).toContain("--pull-number")
    expect(result.stdout).toContain("--output")
    expect(result.stderr).toBe("")
  })

  it("exits 1 and prints usage to stderr when no arguments are provided", () => {
    const result = runCopilotParser([])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Missing required arguments")
    expect(result.stderr).toContain("Usage: bun run scripts/copilot-review-parser.ts")
  })

  it("exits 1 when --pull-number is missing", () => {
    const tempDir = makeTempDir()
    const outputPath = path.join(tempDir, "scorecard.json")
    const result = runCopilotParser(["--repository", "owner/repo", "--output", outputPath])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Missing required argument --pull-number")
    expect(result.stderr).toContain("Usage: bun run scripts/copilot-review-parser.ts")
  })
})

describe("copilot-review-parser helpers", () => {
  it("parses a valid structured scores block with 0-5 values", () => {
    const scores = parseScoresBlock(`
[SCORES]
{"security":0,"safety":1.25,"performance":2.5,"featureQuality":4.75,"confidence":5}
[/SCORES]
`)

    expect(scores).toEqual({
      security: 0,
      safety: 1.25,
      performance: 2.5,
      featureQuality: 4.75,
      confidence: 5,
    })
  })

  it("returns null for malformed or out-of-range structured scores", () => {
    expect(parseScoresBlock("[SCORES]{not json}[/SCORES]")).toBeNull()
    expect(
      parseScoresBlock(
        '[SCORES]{"security":6,"safety":5,"performance":5,"featureQuality":5,"confidence":5}[/SCORES]',
      ),
    ).toBeNull()
  })

  it("parses risk and summary blocks while collapsing whitespace", () => {
    expect(parseRiskToken("prefix [RISK:medium] suffix")).toBe("medium")
    expect(parseSummaryBlock("[SUMMARY]\n  Review   summary\r\n  details.\n[/SUMMARY]")).toBe("Review summary details.")
  })

  it("falls back to stripped review text when no explicit summary block exists", () => {
    const body = `
[RISK:high]

Copilot found an issue after removing structured tokens.
`

    expect(stripReviewTokens(body)).toBe("Copilot found an issue after removing structured tokens.")
    expect(parseReviewBody(body)).toEqual({
      scores: null,
      risk: "high",
      summary: "Copilot found an issue after removing structured tokens.",
    })
  })

  it("normalizes nit severity to info and rejects unknown severities", () => {
    expect(normalizeCopilotSeverity("nit")).toBe("info")
    expect(normalizeCopilotSeverity("warning")).toBe("warning")
    expect(normalizeCopilotSeverity("unknown")).toBeNull()
  })

  it("parses inline comment findings with severity and dimension tokens", () => {
    const parsed = parseInlineCommentFinding({
      body: "[SEVERITY:nit] [DIM:featureQuality]\n\nRefactor this branch for readability.",
      path: "src/example.ts",
      line: 12,
    })

    expect(parsed).toEqual({
      rawSeverity: "nit",
      finding: {
        dimension: "featureQuality",
        severity: "info",
        confidence: "low",
        summary: "Refactor this branch for readability.",
        file: "src/example.ts",
        line: 12,
      },
    })
  })

  it("returns null for inline comments without the required finding tokens", () => {
    expect(parseInlineCommentFinding({ body: "Plain comment without tokens.", path: "src/example.ts", line: 9 })).toBeNull()
  })

  it("derives degraded scores from raw Copilot severities", () => {
    const findings = [
      {
        rawSeverity: "critical",
        finding: { dimension: "security", severity: "critical", confidence: "high", summary: "Critical issue" },
      },
      {
        rawSeverity: "warning",
        finding: { dimension: "safety", severity: "warning", confidence: "medium", summary: "Warning issue" },
      },
      {
        rawSeverity: "info",
        finding: { dimension: "performance", severity: "info", confidence: "low", summary: "Info issue" },
      },
      {
        rawSeverity: "nit",
        finding: { dimension: "featureQuality", severity: "info", confidence: "low", summary: "Nit issue" },
      },
    ] as const

    expect(deriveScoresFromFindings([...findings])).toEqual({
      security: 0,
      safety: 2.5,
      performance: 4,
      featureQuality: 4.5,
      confidence: 3,
    })
  })

  it("builds a structured Copilot scorecard and ignores non-Copilot comments", () => {
    const scorecard = buildCopilotScorecard(
      {
        id: 22,
        body: `
[RISK:low]

[SCORES]
{"security":4.5,"safety":4,"performance":3.5,"featureQuality":4.25,"confidence":5}
[/SCORES]

[SUMMARY]
Structured summary from Copilot.
[/SUMMARY]
`,
        user: { login: "github-copilot[bot]" },
      },
      [
        {
          body: "[SEVERITY:warning] [DIM:safety]\n\nGuard the nullable access.",
          path: "src/app.ts",
          line: 7,
          user: { login: "github-copilot[bot]" },
          pull_request_review_id: 22,
        },
        {
          body: "[SEVERITY:critical] [DIM:security]\n\nHuman comment should be ignored.",
          path: "src/app.ts",
          line: 8,
          user: { login: "octocat" },
          pull_request_review_id: 22,
        },
      ],
    )

    expect(scorecard.source).toBe("copilot")
    expect(scorecard.summary).toBe("Structured summary from Copilot.")
    expect(scorecard.risk).toBe("low")
    expect(scorecard.scores).toEqual({
      security: 4.5,
      safety: 4,
      performance: 3.5,
      featureQuality: 4.25,
      confidence: 5,
    })
    expect(scorecard.findings).toEqual([
      {
        dimension: "safety",
        severity: "warning",
        confidence: "medium",
        summary: "Guard the nullable access.",
        file: "src/app.ts",
        line: 7,
      },
    ])
  })

  it("scopes Copilot comments to the selected review id before building the scorecard", async () => {
    const { filterCommentsForReview } = await loadCopilotParserInternals()
    const review = selectLatestCopilotReview([
      { id: 21, submitted_at: "2026-03-11T10:01:00Z", user: { login: "github-copilot[bot]" } },
      {
        id: 22,
        submitted_at: "2026-03-11T10:02:00Z",
        body: `
[RISK:low]

[SCORES]
{"security":4.5,"safety":4,"performance":3.5,"featureQuality":4.25,"confidence":5}
[/SCORES]

[SUMMARY]
Structured summary from Copilot.
[/SUMMARY]
`,
        user: { login: "github-copilot[bot]" },
      },
    ])

    expect(review?.id).toBe(22)

    const filteredComments = filterCommentsForReview(review ?? {}, [
      {
        body: "[SEVERITY:warning] [DIM:safety]\n\nGuard the nullable access.",
        path: "src/app.ts",
        line: 7,
        user: { login: "github-copilot[bot]" },
        pull_request_review_id: 22,
      },
      {
        body: "[SEVERITY:critical] [DIM:security]\n\nLeaked from an older Copilot review.",
        path: "src/app.ts",
        line: 8,
        user: { login: "github-copilot[bot]" },
        pull_request_review_id: 21,
      },
    ])

    const scorecard = buildCopilotScorecard(review ?? {}, filteredComments)

    expect(filteredComments).toEqual([
      {
        body: "[SEVERITY:warning] [DIM:safety]\n\nGuard the nullable access.",
        path: "src/app.ts",
        line: 7,
        user: { login: "github-copilot[bot]" },
        pull_request_review_id: 22,
      },
    ])
    expect(scorecard.source).toBe("copilot")
    expect(scorecard.risk).toBe("low")
    expect(scorecard.scores).toEqual({
      security: 4.5,
      safety: 4,
      performance: 3.5,
      featureQuality: 4.25,
      confidence: 5,
    })
    expect(scorecard.findings).toEqual([
      {
        dimension: "safety",
        severity: "warning",
        confidence: "medium",
        summary: "Guard the nullable access.",
        file: "src/app.ts",
        line: 7,
      },
    ])
  })

  it("builds a degraded Copilot scorecard when structured scores are malformed", () => {
    const scorecard = buildCopilotScorecard(
      {
        id: 31,
        body: `
[SCORES]
{"security":9,"safety":4,"performance":4,"featureQuality":4,"confidence":4}
[/SCORES]

[SUMMARY]
Malformed scores should degrade gracefully.
[/SUMMARY]
`,
        user: { login: "copilot-pull-request-reviewer" },
      },
      [
        {
          body: "[SEVERITY:warning] [DIM:performance]\n\nThis loop does extra work on every render.",
          path: "src/render.ts",
          line: 19,
          user: { login: "copilot-pull-request-reviewer" },
          pull_request_review_id: 31,
        },
      ],
    )

    expect(scorecard.source).toBe("copilot:degraded")
    expect(scorecard.summary).toBe("Malformed scores should degrade gracefully.")
    expect(scorecard.risk).toBe("medium")
    expect(scorecard.scores).toEqual({
      security: 5,
      safety: 5,
      performance: 2.5,
      featureQuality: 5,
      confidence: 4.5,
    })
    expect(scorecard.findings).toHaveLength(1)
    expect(scorecard.findings[0]?.summary).toBe("This loop does extra work on every render.")
  })

  it("uses degraded fallback values when review text has no valid score block or findings", () => {
    const scorecard = buildCopilotScorecard(
      {
        body: "Copilot review text without structured scores.",
        user: { login: "github-copilot[bot]" },
      },
      [],
    )

    expect(scorecard.source).toBe("copilot:degraded")
    expect(scorecard.summary).toBe("Copilot review text without structured scores.")
    expect(scorecard.scores).toEqual({
      security: 3,
      safety: 3,
      performance: 3,
      featureQuality: 3,
      confidence: 3,
    })
    expect(scorecard.risk).toBe("low")
    expect(scorecard.findings).toEqual([
      {
        dimension: "featureQuality",
        severity: "info",
        confidence: "low",
        summary: "Copilot review text without structured scores.",
      },
    ])
  })

  it("uses low risk when degraded findings contain no warning or critical severities", () => {
    const scorecard = buildCopilotScorecard(
      {
        body: "[SUMMARY]Copilot left only informational feedback.[/SUMMARY]",
        user: { login: "github-copilot[bot]" },
      },
      [
        {
          body: "[SEVERITY:info] [DIM:performance]\n\nConsider simplifying this branch.",
          path: "src/example.ts",
          line: 5,
          user: { login: "github-copilot[bot]" },
        },
      ],
    )

    expect(scorecard.source).toBe("copilot:degraded")
    expect(scorecard.risk).toBe("low")
    expect(scorecard.findings).toEqual([
      {
        dimension: "performance",
        severity: "info",
        confidence: "low",
        summary: "Consider simplifying this branch.",
        file: "src/example.ts",
        line: 5,
      },
    ])
  })

  it("selects the latest Copilot review and returns null when none are present", () => {
    const latest = selectLatestCopilotReview([
      { id: 1, submitted_at: "2026-03-11T10:00:00Z", user: { login: "octocat" } },
      { id: 2, submitted_at: "2026-03-11T10:01:00Z", user: { login: "github-copilot[bot]" } },
      { id: 3, submitted_at: "2026-03-11T10:02:00Z", user: { login: "copilot-pull-request-reviewer" } },
    ])

    expect(latest?.id).toBe(3)
    expect(selectLatestCopilotReview([])).toBeNull()
    expect(selectLatestCopilotReview([{ id: 4, submitted_at: "2026-03-11T10:03:00Z", user: { login: "octocat" } }])).toBeNull()
  })

  it("recognizes Copilot review authors only for the accepted bot logins", () => {
    expect(isCopilotReviewAuthor("github-copilot[bot]")).toBe(true)
    expect(isCopilotReviewAuthor("copilot-pull-request-reviewer")).toBe(true)
    expect(isCopilotReviewAuthor("octocat")).toBe(false)
    expect(isCopilotReviewAuthor(null)).toBe(false)
  })
})
