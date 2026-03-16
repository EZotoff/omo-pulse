#!/usr/bin/env bun

import * as fs from "node:fs"
import * as path from "node:path"

import { parseReviewScorecard } from "../src/review/policy"
import type {
  ReviewDimension,
  ReviewFinding,
  ReviewFindingConfidence,
  ReviewRiskLevel,
  ReviewScorecard,
  ReviewScores,
  ReviewSeverity,
} from "../src/review/types"

const DEFAULT_POLL_INTERVAL_MS = 30000
const DEFAULT_TIMEOUT_MS = 300000
const GITHUB_API_VERSION = "2022-11-28"
const COPILOT_REVIEW_AUTHORS = ["copilot-pull-request-reviewer", "github-copilot[bot]"] as const
const REVIEW_DIMENSIONS: ReviewDimension[] = ["security", "safety", "performance", "featureQuality"]
const REVIEW_RISKS: ReviewRiskLevel[] = ["low", "medium", "high"]
const COPILOT_SEVERITY_TOKENS = ["critical", "warning", "info", "nit"] as const

const USAGE_TEXT = `Usage: bun run scripts/copilot-review-parser.ts --repository <owner/repo> --pull-number <number> --output <path> [--poll-interval-ms <ms>] [--timeout-ms <ms>] [--token <token>]\n\nOptions:\n  --repository         GitHub repository in owner/repo format\n  --pull-number        Pull request number to review\n  --output             Path to write the ReviewScorecard JSON or literal null\n  --poll-interval-ms   Poll interval while waiting for Copilot review (default: ${DEFAULT_POLL_INTERVAL_MS})\n  --timeout-ms         Timeout while waiting for Copilot review (default: ${DEFAULT_TIMEOUT_MS})\n  --token              GitHub token (defaults to GITHUB_TOKEN or GH_TOKEN)\n  --help               Show this help text`

type CliArgs = {
  repository: string
  pullNumber: number
  outputPath: string
  pollIntervalMs: number
  timeoutMs: number
  token?: string
}

type GitHubApiResponse<T> = {
  data: T
  headers: Headers
}

type GitHubUser = {
  login?: string | null
} | null

type GitHubPullRequestReview = {
  id?: number
  body?: string | null
  submitted_at?: string | null
  user?: GitHubUser
}

type GitHubPullRequestReviewComment = {
  body?: string | null
  path?: string | null
  line?: number | null
  user?: GitHubUser
  pull_request_review_id?: number | null
}

type CopilotSeverityToken = (typeof COPILOT_SEVERITY_TOKENS)[number]

export type ParsedInlineFinding = {
  finding: ReviewFinding
  rawSeverity: CopilotSeverityToken
}

export type ParsedReviewBody = {
  scores: ReviewScores | null
  risk: ReviewRiskLevel | null
  summary: string | undefined
}

class UsageError extends Error {}

function readArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) {
    return undefined
  }

  return args[index + 1]
}

function readNumberArg(value: string | undefined, flag: string, defaultValue?: number): number {
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue
    }

    throw new UsageError(`Missing required argument ${flag}`)
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new UsageError(`${flag} must be a non-negative integer`)
  }

  return parsed
}

function printUsage(stream: "stdout" | "stderr" = "stderr"): void {
  if (stream === "stdout") {
    process.stdout.write(`${USAGE_TEXT}\n`)
    return
  }

  process.stderr.write(`${USAGE_TEXT}\n`)
}

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h")
}

export function parseArgs(argv: string[]): CliArgs {
  if (wantsHelp(argv)) {
    printUsage("stdout")
    process.exit(0)
  }

  if (argv.length === 0) {
    throw new UsageError("Missing required arguments")
  }

  const repository = readArgValue(argv, "--repository")
  const outputPath = readArgValue(argv, "--output")

  if (!repository) {
    throw new UsageError("Missing required argument --repository")
  }

  if (!outputPath) {
    throw new UsageError("Missing required argument --output")
  }

  return {
    repository,
    pullNumber: readNumberArg(readArgValue(argv, "--pull-number"), "--pull-number"),
    outputPath,
    pollIntervalMs: readNumberArg(readArgValue(argv, "--poll-interval-ms"), "--poll-interval-ms", DEFAULT_POLL_INTERVAL_MS),
    timeoutMs: readNumberArg(readArgValue(argv, "--timeout-ms"), "--timeout-ms", DEFAULT_TIMEOUT_MS),
    token: readArgValue(argv, "--token"),
  }
}

function getGitHubToken(cliToken: string | undefined): string {
  const token = cliToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (!token) {
    throw new Error("--token or GITHUB_TOKEN or GH_TOKEN is required for GitHub API authentication")
  }

  return token
}

async function fetchGitHubJson<T>(url: string, token: string): Promise<GitHubApiResponse<T>> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${url}: ${await response.text()}`)
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
  }
}

function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null
  }

  const segments = linkHeader.split(",")
  for (const segment of segments) {
    const trimmed = segment.trim()
    const match = trimmed.match(/^<([^>]+)>;\s*rel="([^"]+)"$/)
    if (match?.[2] === "next") {
      return match[1]
    }
  }

  return null
}

async function fetchAllGitHubPages<T>(initialUrl: string, token: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = initialUrl

  while (nextUrl) {
    const { data, headers } = await fetchGitHubJson<T[]>(nextUrl, token)
    items.push(...data)
    nextUrl = getNextPageUrl(headers.get("link"))
  }

  return items
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isCopilotReviewAuthor(login: string | null | undefined): boolean {
  if (!login) {
    return false
  }

  return COPILOT_REVIEW_AUTHORS.includes(login as (typeof COPILOT_REVIEW_AUTHORS)[number])
}

export function selectLatestCopilotReview(reviews: GitHubPullRequestReview[]): GitHubPullRequestReview | null {
  const copilotReviews = reviews.filter((review) => isCopilotReviewAuthor(review.user?.login ?? null))
  if (copilotReviews.length === 0) {
    return null
  }

  return [...copilotReviews].sort((left, right) => {
    const leftTime = Date.parse(left.submitted_at ?? "")
    const rightTime = Date.parse(right.submitted_at ?? "")
    const leftValue = Number.isFinite(leftTime) ? leftTime : 0
    const rightValue = Number.isFinite(rightTime) ? rightTime : 0
    return rightValue - leftValue
  })[0] ?? null
}

async function fetchPullRequestReviews(repository: string, pullNumber: number, token: string): Promise<GitHubPullRequestReview[]> {
  return fetchAllGitHubPages<GitHubPullRequestReview>(
    `https://api.github.com/repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`,
    token,
  )
}

async function fetchPullRequestReviewComments(
  repository: string,
  pullNumber: number,
  token: string,
): Promise<GitHubPullRequestReviewComment[]> {
  return fetchAllGitHubPages<GitHubPullRequestReviewComment>(
    `https://api.github.com/repos/${repository}/pulls/${pullNumber}/comments?per_page=100`,
    token,
  )
}

async function waitForCopilotReview(args: CliArgs, token: string): Promise<GitHubPullRequestReview | null> {
  const deadline = Date.now() + args.timeoutMs

  while (true) {
    const reviews = await fetchPullRequestReviews(args.repository, args.pullNumber, token)
    const latestCopilotReview = selectLatestCopilotReview(reviews)
    if (latestCopilotReview) {
      return latestCopilotReview
    }

    if (Date.now() >= deadline) {
      return null
    }

    await sleep(args.pollIntervalMs)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function collapseWhitespace(value: string): string {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim()
}

export function stripReviewTokens(value: string): string {
  return collapseWhitespace(
    value
      .replace(/\[SCORES\][\s\S]*?\[\/SCORES\]/gi, " ")
      .replace(/\[SUMMARY\]/gi, " ")
      .replace(/\[\/SUMMARY\]/gi, " ")
      .replace(/\[RISK:(low|medium|high)\]/gi, " ")
      .replace(/\[SEVERITY:(critical|warning|info|nit)\]/gi, " ")
      .replace(/\[DIM:(security|safety|performance|featureQuality)\]/gi, " "),
  )
}

function readScoreValue(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a number`)
  }

  if (value < 0 || value > 5) {
    throw new Error(`${fieldName} must be between 0 and 5`)
  }

  return Number(value.toFixed(2))
}

export function parseScoresBlock(body: string): ReviewScores | null {
  const match = body.match(/\[SCORES\]([\s\S]*?)\[\/SCORES\]/i)
  if (!match?.[1]) {
    return null
  }

  try {
    const parsed = JSON.parse(match[1].trim()) as unknown
    if (!isRecord(parsed)) {
      return null
    }

    return {
      security: readScoreValue(parsed.security, "scores.security"),
      safety: readScoreValue(parsed.safety, "scores.safety"),
      performance: readScoreValue(parsed.performance, "scores.performance"),
      featureQuality: readScoreValue(parsed.featureQuality, "scores.featureQuality"),
      confidence: readScoreValue(parsed.confidence, "scores.confidence"),
    }
  } catch {
    return null
  }
}

export function parseRiskToken(body: string): ReviewRiskLevel | null {
  const match = body.match(/\[RISK:(low|medium|high)\]/i)
  if (!match?.[1]) {
    return null
  }

  const risk = match[1].toLowerCase() as ReviewRiskLevel
  return REVIEW_RISKS.includes(risk) ? risk : null
}

export function parseSummaryBlock(body: string): string | undefined {
  const match = body.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/i)
  if (!match?.[1]) {
    return undefined
  }

  const summary = collapseWhitespace(match[1])
  return summary.length > 0 ? summary : undefined
}

export function parseReviewBody(body: string | null | undefined): ParsedReviewBody {
  const normalizedBody = body ?? ""
  const explicitSummary = parseSummaryBlock(normalizedBody)
  const strippedSummary = stripReviewTokens(normalizedBody)

  return {
    scores: parseScoresBlock(normalizedBody),
    risk: parseRiskToken(normalizedBody),
    summary: explicitSummary ?? (strippedSummary.length > 0 ? strippedSummary : undefined),
  }
}

export function normalizeCopilotSeverity(token: string): ReviewSeverity | null {
  const normalized = token.trim().toLowerCase()
  if (normalized === "nit") {
    return "info"
  }

  if (normalized === "critical" || normalized === "warning" || normalized === "info") {
    return normalized
  }

  return null
}

function mapConfidenceFromSeverity(severity: ReviewSeverity): ReviewFindingConfidence {
  switch (severity) {
    case "critical":
      return "high"
    case "warning":
      return "medium"
    case "info":
      return "low"
  }
}

function parseDimensionToken(value: string): ReviewDimension | null {
  const normalized = value.trim() as ReviewDimension
  return REVIEW_DIMENSIONS.includes(normalized) ? normalized : null
}

export function parseInlineCommentFinding(comment: GitHubPullRequestReviewComment): ParsedInlineFinding | null {
  const body = comment.body ?? ""
  const severityMatch = body.match(/\[SEVERITY:(critical|warning|info|nit)\]/i)
  const dimensionMatch = body.match(/\[DIM:(security|safety|performance|featureQuality)\]/i)
  if (!severityMatch?.[1] || !dimensionMatch?.[1]) {
    return null
  }

  const rawSeverity = severityMatch[1].toLowerCase() as CopilotSeverityToken
  const severity = normalizeCopilotSeverity(rawSeverity)
  const dimension = parseDimensionToken(dimensionMatch[1])
  if (!severity || !dimension) {
    return null
  }

  const strippedSummary = stripReviewTokens(body)
  const summary = strippedSummary.length > 0 ? strippedSummary : "Copilot flagged an issue without a written summary."
  const line = typeof comment.line === "number" && Number.isInteger(comment.line) && comment.line > 0 ? comment.line : undefined

  return {
    rawSeverity,
    finding: {
      dimension,
      severity,
      confidence: mapConfidenceFromSeverity(severity),
      summary,
      file: comment.path ?? undefined,
      line,
    },
  }
}

function clampScore(value: number): number {
  return Number(Math.min(5, Math.max(0, value)).toFixed(2))
}

function getSeverityWeight(severity: CopilotSeverityToken): number {
  switch (severity) {
    case "critical":
      return 0
    case "warning":
      return 2.5
    case "info":
      return 4
    case "nit":
      return 4.5
  }
}

export function deriveScoresFromFindings(findings: ParsedInlineFinding[]): ReviewScores {
  const penalties = {
    security: 0,
    safety: 0,
    performance: 0,
    featureQuality: 0,
  } satisfies Record<ReviewDimension, number>

  for (const finding of findings) {
    penalties[finding.finding.dimension] += 5 - getSeverityWeight(finding.rawSeverity)
  }

  const confidencePenalty = findings.length === 0 ? 2 : Math.min(2, findings.length * 0.5)

  return {
    security: clampScore(5 - penalties.security),
    safety: clampScore(5 - penalties.safety),
    performance: clampScore(5 - penalties.performance),
    featureQuality: clampScore(5 - penalties.featureQuality),
    confidence: clampScore(5 - confidencePenalty),
  }
}

function inferRiskFromFindings(findings: ParsedInlineFinding[]): ReviewRiskLevel {
  if (findings.some((finding) => finding.rawSeverity === "critical")) {
    return "high"
  }

  if (findings.some((finding) => finding.rawSeverity === "warning")) {
    return "medium"
  }

  return "medium"
}

function createFallbackFinding(summary: string): ReviewFinding {
  return {
    dimension: "featureQuality",
    severity: "info",
    confidence: "low",
    summary,
  }
}

export function buildCopilotScorecard(review: GitHubPullRequestReview, comments: GitHubPullRequestReviewComment[]): ReviewScorecard {
  const parsedBody = parseReviewBody(review.body)
  const parsedFindings = comments
    .filter((comment) => isCopilotReviewAuthor(comment.user?.login ?? null))
    .map((comment) => parseInlineCommentFinding(comment))
    .filter((finding): finding is ParsedInlineFinding => finding !== null)

  const findings = parsedFindings.map((entry) => entry.finding)
  const reviewTextSummary = parsedBody.summary ?? "Copilot review parsed without a structured summary."

  if (parsedBody.scores) {
    return {
      summary: reviewTextSummary,
      source: "copilot",
      scores: parsedBody.scores,
      risk: parsedBody.risk ?? inferRiskFromFindings(parsedFindings),
      autoApproveAllowed: true,
      findings,
    }
  }

  const degradedFindings = findings.length > 0 ? findings : [createFallbackFinding(reviewTextSummary)]
  const degradedSummary = parsedBody.summary ?? (stripReviewTokens(review.body ?? "") || "Copilot review was present but did not include a structured score block.")
  const scores = parsedFindings.length > 0
    ? deriveScoresFromFindings(parsedFindings)
    : { security: 3, safety: 3, performance: 3, featureQuality: 3, confidence: 3 }

  return {
    summary: degradedSummary,
    source: "copilot:degraded",
    scores,
    risk: parsedBody.risk ?? inferRiskFromFindings(parsedFindings),
    autoApproveAllowed: true,
    findings: degradedFindings,
  }
}

function filterCommentsForReview(
  review: GitHubPullRequestReview,
  comments: GitHubPullRequestReviewComment[],
): GitHubPullRequestReviewComment[] {
  const reviewId = typeof review.id === "number" ? review.id : null
  return comments.filter((comment) => {
    if (!isCopilotReviewAuthor(comment.user?.login ?? null)) {
      return false
    }

    if (reviewId === null) {
      return true
    }

    return comment.pull_request_review_id === reviewId
  })
}

function writeOutput(value: ReviewScorecard | null, outputPath: string): void {
  const contents = `${JSON.stringify(value, null, 2)}\n`
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, contents, "utf8")
  process.stdout.write(contents)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const token = getGitHubToken(args.token)
  const review = await waitForCopilotReview(args, token)

  if (!review) {
    writeOutput(null, args.outputPath)
    return
  }

  const comments = filterCommentsForReview(
    review,
    await fetchPullRequestReviewComments(args.repository, args.pullNumber, token),
  )
  const scorecard = parseReviewScorecard(buildCopilotScorecard(review, comments))
  writeOutput(scorecard, args.outputPath)
}

if (import.meta.main) {
  main().catch((error) => {
    if (error instanceof UsageError) {
      console.error(error.message)
      printUsage()
      process.exit(1)
    }

    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
