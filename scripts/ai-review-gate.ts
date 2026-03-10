#!/usr/bin/env bun

import * as fs from "node:fs"
import { evaluateReviewScorecard, parseReviewScorecard } from "../src/review/policy"
import type { ReviewPolicyResult } from "../src/review/types"

function getInputPath(argv: string[]): string {
  const inputFlagIndex = argv.indexOf("--input")
  if (inputFlagIndex !== -1) {
    const inputPath = argv[inputFlagIndex + 1]
    if (!inputPath) {
      throw new Error("Missing value for --input")
    }

    return inputPath
  }

  const envPath = process.env.AI_REVIEW_SCORECARD_PATH
  if (envPath && envPath.trim().length > 0) {
    return envPath
  }

  throw new Error("Provide a scorecard path via --input <path> or AI_REVIEW_SCORECARD_PATH")
}

function readScorecardFile(inputPath: string): unknown {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Scorecard file not found: ${inputPath}`)
  }

  return JSON.parse(fs.readFileSync(inputPath, "utf8")) as unknown
}

function formatBoolean(value: boolean): string {
  return value ? "true" : "false"
}

function createHeredocDelimiter(): string {
  return `__OMO_${globalThis.crypto.randomUUID().replace(/-/g, "")}_EOF__`
}

function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) {
    return
  }

  const encodedValue = value.includes("\n")
    ? (() => {
        const delimiter = createHeredocDelimiter()

        return `${name}<<${delimiter}\n${value}\n${delimiter}\n`
      })()
    : `${name}=${value}\n`

  fs.appendFileSync(outputPath, encodedValue)
}

function writeStepSummary(result: ReviewPolicyResult): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    return
  }

  const lines = [
    "# AI Review Gate",
    "",
    `- Decision: \`${result.decision}\``,
    `- Composite score: \`${result.compositeScore.toFixed(2)}\``,
    `- Risk: \`${result.risk}\``,
    `- Auto-approval allowed: \`${formatBoolean(result.autoApproveAllowed)}\``,
    "",
    "## Reasons",
    ...result.reasons.map((reason) => `- ${reason}`),
    "",
  ]

  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`)
}

function getExitCode(result: ReviewPolicyResult): number {
  return result.decision === "auto_approve" ? 0 : 1
}

function writeGitHubOutputs(result: ReviewPolicyResult): void {
  writeOutput("decision", result.decision)
  writeOutput("summary", result.summary)
  writeOutput("reasons_json", JSON.stringify(result.reasons))
  writeOutput("composite_score", result.compositeScore.toFixed(2))
  writeOutput("blocked", formatBoolean(result.blocked))
  writeOutput("auto_approve", formatBoolean(result.autoApprove))
}

function writeFailureOutputs(message: string): void {
  writeOutput("decision", "block")
  writeOutput("summary", `Decision: block. Unable to evaluate AI review gate input. Primary reason: ${message}.`)
  writeOutput("reasons_json", JSON.stringify([message]))
  writeOutput("composite_score", "")
  writeOutput("blocked", "true")
  writeOutput("auto_approve", "false")
}

function main(): void {
  try {
    const inputPath = getInputPath(process.argv.slice(2))
    const scorecard = parseReviewScorecard(readScorecardFile(inputPath))
    const result = evaluateReviewScorecard(scorecard)

    console.log(JSON.stringify(result, null, 2))
    writeGitHubOutputs(result)
    writeStepSummary(result)
    process.exit(getExitCode(result))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown review gate failure"
    console.error(message)
    writeFailureOutputs(message)
    process.exit(2)
  }
}

main()
