#!/usr/bin/env bun

declare const Bun: {
  argv: string[]
  env: Record<string, string | undefined>
  spawnSync(args: string[]): { exitCode: number; stderr: Uint8Array | string }
  write(path: string, data: string): Promise<number>
}

declare const process: {
  exit(code?: number): never
}

import { parseReviewScorecard } from "../src/review/policy"
import type { ReviewScorecard } from "../src/review/types"

const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_MAX_DIFF_CHARS = 50000
const DEFAULT_FETCH_TIMEOUT_MS = 30000
const GITHUB_API_VERSION = "2022-11-28"
const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions"
const USAGE_TEXT = `Usage: bun run scripts/ai-diff-review.ts --repository <owner/repo> --pull-number <number> --output <path> [--model <model>] [--max-diff-chars <chars>]\n\nOptions:\n  --repository      GitHub repository in owner/repo format\n  --pull-number     Pull request number to review\n  --output          Path to write the ReviewScorecard JSON\n  --model           GitHub Models model name (default: ${DEFAULT_MODEL})\n  --max-diff-chars  Maximum diff characters sent to the model (default: ${DEFAULT_MAX_DIFF_CHARS})\n  --help            Show this help text`

type CliArgs = {
  repository: string
  pullNumber: number
  outputPath: string
  model: string
  maxDiffChars: number
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
      refusal?: string | null
    }
  }>
}

type JsonSchema = {
  type: "object"
  additionalProperties: boolean
  properties: Record<string, unknown>
  required?: string[]
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

    throw new Error(`Missing required argument ${flag}`)
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`)
  }

  return parsed
}

function printUsage(): void {
  console.error(USAGE_TEXT)
}

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h")
}

function parseArgs(argv: string[]): CliArgs {
  if (wantsHelp(argv)) {
    printUsage()
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
    model: readArgValue(argv, "--model") ?? DEFAULT_MODEL,
    maxDiffChars: readNumberArg(readArgValue(argv, "--max-diff-chars"), "--max-diff-chars", DEFAULT_MAX_DIFF_CHARS),
  }
}

function dirnameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/")
  const lastSlashIndex = normalized.lastIndexOf("/")
  return lastSlashIndex <= 0 ? "." : normalized.slice(0, lastSlashIndex)
}

function getGitHubToken(): string {
  const token = Bun.env.GITHUB_TOKEN ?? Bun.env.GH_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required for GitHub API authentication")
  }

  return token
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`)
    }

    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function fetchPullRequestDiff(repository: string, pullNumber: number, token: string): Promise<string> {
  const response = await fetchWithTimeout(`https://api.github.com/repos/${repository}/pulls/${pullNumber}`, {
    headers: {
      Accept: "application/vnd.github.v3.diff",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  }, DEFAULT_FETCH_TIMEOUT_MS, `GitHub diff fetch for ${repository}#${pullNumber}`)

  if (!response.ok) {
    throw new Error(
      `GitHub diff request failed (${response.status} ${response.statusText}) for ${repository}#${pullNumber}: ${await response.text()}`,
    )
  }

  return await response.text()
}

function splitDiffSections(diffText: string): string[] {
  const lines = diffText.split("\n")
  const sections: string[] = []
  let currentSection: string[] = []

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentSection.length > 0) {
        sections.push(currentSection.join("\n"))
      }

      currentSection = [line]
      continue
    }

    if (currentSection.length > 0) {
      currentSection.push(line)
    }
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join("\n"))
  }

  return sections
}

function trimDiffPathPrefix(value: string): string {
  const unquoted = value.replace(/^"|"$/g, "")
  if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) {
    return unquoted.slice(2)
  }

  return unquoted
}

function readFilePathFromSection(section: string): string | null {
  const plusMatch = section.match(/^\+\+\+\s+(.*)$/m)
  const minusMatch = section.match(/^---\s+(.*)$/m)

  for (const candidate of [plusMatch?.[1], minusMatch?.[1]]) {
    if (!candidate || candidate === "/dev/null") {
      continue
    }

    return trimDiffPathPrefix(candidate.trim())
  }

  const headerMatch = section.match(/^diff --git\s+(?:"?a\/(.+?)"?)\s+(?:"?b\/(.+?)"?)$/m)
  if (!headerMatch) {
    return null
  }

  return trimDiffPathPrefix(headerMatch[2] ?? headerMatch[1])
}

function isExcludedFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase()

  return (
    normalized.endsWith(".lock") ||
    normalized.endsWith(".lockb") ||
    normalized.endsWith("package-lock.json") ||
    normalized.endsWith("bun.lockb") ||
    normalized.endsWith("yarn.lock") ||
    normalized.endsWith(".min.js") ||
    normalized.endsWith(".min.css") ||
    normalized.endsWith(".map") ||
    normalized.endsWith(".ttf") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".gif") ||
    normalized.endsWith(".svg") ||
    normalized.endsWith(".ico") ||
    normalized.endsWith(".woff") ||
    normalized.endsWith(".woff2")
  )
}

function filterExcludedDiffSections(diffText: string): string {
  const sections = splitDiffSections(diffText)
  if (sections.length === 0) {
    return diffText.trim()
  }

  return sections
    .filter((section) => {
      const filePath = readFilePathFromSection(section)
      return filePath ? !isExcludedFile(filePath) : true
    })
    .join("\n")
    .trim()
}

function truncateDiff(diffText: string, maxChars: number): string {
  if (diffText.length <= maxChars) {
    return diffText
  }

  return `${diffText.slice(0, maxChars)}\n\n[TRUNCATED: diff exceeded ${maxChars} chars]`
}

function createModelSource(model: string): string {
  const normalized = model.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return `llm-${normalized || DEFAULT_MODEL}`
}

function createEmptyDiffScorecard(): ReviewScorecard {
  return {
    summary: "No reviewable diff remained after filtering excluded files.",
    source: "llm-empty-diff",
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
}

function buildReviewScorecardSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      source: { type: "string" },
      scores: {
        type: "object",
        additionalProperties: false,
        properties: {
          security: { type: "number" },
          safety: { type: "number" },
          performance: { type: "number" },
          featureQuality: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["security", "safety", "performance", "featureQuality", "confidence"],
      },
      risk: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      autoApproveAllowed: { type: "boolean" },
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            dimension: {
              type: "string",
              enum: ["security", "safety", "performance", "featureQuality"],
            },
            severity: {
              type: "string",
              enum: ["info", "warning", "critical"],
            },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            summary: { type: "string" },
            file: { type: "string" },
            line: { type: "integer" },
            suggestion: { type: "string" },
          },
          required: ["dimension", "severity", "confidence", "summary"],
        },
      },
    },
    required: ["scores", "risk", "autoApproveAllowed", "findings"],
  }
}

function buildModelMessages(args: CliArgs, diffText: string): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content:
        "You are a strict pull-request review assistant. Analyze only the provided Git diff. Return a ReviewScorecard JSON object that matches the supplied schema exactly. Keep findings concise, grounded in the diff, and do not invent files or lines.",
    },
    {
      role: "user",
      content: [
        `Repository: ${args.repository}`,
        `Pull request: #${args.pullNumber}`,
        "",
        "Score guidance:",
        "- Scores must reflect the diff only.",
        "- Use the full 1.0 to 5.0 range.",
        "- Set autoApproveAllowed to true only when the diff appears safe, low-risk, and fully ready.",
        "- Use risk=high for severe security/safety concerns, medium for notable concerns, low otherwise.",
        "- Findings should include a file path and line only when the diff provides clear support.",
        "- If there are no meaningful issues, return an empty findings array.",
        `- Use source='${createModelSource(args.model)}'.`,
        "",
        "Unified diff:",
        diffText,
      ].join("\n"),
    },
  ]
}

function extractMessageContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    throw new Error("GitHub Models response did not include message content")
  }

  const text = content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")

  if (text.length === 0) {
    throw new Error("GitHub Models response content was empty")
  }

  return text
}

async function fetchModelResponse(args: CliArgs, token: string, diffText: string): Promise<unknown> {
  const response = await fetchWithTimeout(GITHUB_MODELS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.1,
      messages: buildModelMessages(args, diffText),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "review_scorecard",
          strict: true,
          schema: buildReviewScorecardSchema(),
        },
      },
    }),
  }, DEFAULT_FETCH_TIMEOUT_MS, `GitHub Models fetch for ${args.model}`)

  if (!response.ok) {
    throw new Error(`GitHub Models request failed (${response.status} ${response.statusText}): ${await response.text()}`)
  }

  const payload = (await response.json()) as ChatCompletionResponse
  const message = payload.choices?.[0]?.message
  if (!message) {
    throw new Error("GitHub Models response did not include a completion choice")
  }

  if (message.refusal) {
    throw new Error(`GitHub Models refused the request: ${message.refusal}`)
  }

  return JSON.parse(extractMessageContent(message.content)) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new Error("Optional string fields must be strings when provided")
  }

  return value
}

function clampScore(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a number`)
  }

  return Number(Math.min(5, Math.max(1, value)).toFixed(2))
}

function normalizeModelScorecard(value: unknown, model: string): ReviewScorecard {
  if (!isRecord(value)) {
    throw new Error("GitHub Models response must be a JSON object")
  }

  const normalized = {
    summary: readOptionalString(value.summary),
    source: readOptionalString(value.source) ?? createModelSource(model),
    scores: {
      security: clampScore(isRecord(value.scores) ? value.scores.security : undefined, "scores.security"),
      safety: clampScore(isRecord(value.scores) ? value.scores.safety : undefined, "scores.safety"),
      performance: clampScore(isRecord(value.scores) ? value.scores.performance : undefined, "scores.performance"),
      featureQuality: clampScore(isRecord(value.scores) ? value.scores.featureQuality : undefined, "scores.featureQuality"),
      confidence: clampScore(isRecord(value.scores) ? value.scores.confidence : undefined, "scores.confidence"),
    },
    risk: value.risk,
    autoApproveAllowed: value.autoApproveAllowed,
    findings: value.findings,
  }

  return parseReviewScorecard(normalized)
}

async function writeOutput(scorecard: ReviewScorecard, outputPath: string): Promise<void> {
  const contents = `${JSON.stringify(scorecard, null, 2)}\n`
  const mkdirResult = Bun.spawnSync(["mkdir", "-p", dirnameOf(outputPath)])
  if (mkdirResult.exitCode !== 0) {
    throw new Error(`Unable to create output directory for ${outputPath}`)
  }

  await Bun.write(outputPath, contents)
  console.log(contents.trimEnd())
}

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2))
  const token = getGitHubToken()
  const rawDiff = await fetchPullRequestDiff(args.repository, args.pullNumber, token)
  const filteredDiff = filterExcludedDiffSections(rawDiff)

  if (filteredDiff.length === 0) {
    await writeOutput(createEmptyDiffScorecard(), args.outputPath)
    return
  }

  const preparedDiff = truncateDiff(filteredDiff, args.maxDiffChars)
  const rawScorecard = await fetchModelResponse(args, token, preparedDiff)
  const scorecard = normalizeModelScorecard(rawScorecard, args.model)

  await writeOutput(scorecard, args.outputPath)
}

export { createEmptyDiffScorecard, normalizeModelScorecard }

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
