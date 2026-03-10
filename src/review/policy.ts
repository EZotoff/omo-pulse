import type {
  ReviewDimension,
  ReviewFinding,
  ReviewFindingConfidence,
  ReviewPolicyResult,
  ReviewRiskLevel,
  ReviewScorecard,
  ReviewScores,
  ReviewSeverity,
} from "./types"

const DIMENSIONS: ReviewDimension[] = ["security", "safety", "performance", "featureQuality"]
const FINDING_CONFIDENCE: ReviewFindingConfidence[] = ["low", "medium", "high"]
const FINDING_SEVERITY: ReviewSeverity[] = ["info", "warning", "critical"]
const RISK_LEVELS: ReviewRiskLevel[] = ["low", "medium", "high"]

export const BLOCK_MINIMUM_SCORE = 2
export const AUTO_APPROVE_MINIMUM_SCORE = 4.5
export const AUTO_APPROVE_MINIMUM_COMPOSITE = 4.7
export const AUTO_APPROVE_MINIMUM_CONFIDENCE = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isDimension(value: unknown): value is ReviewDimension {
  return typeof value === "string" && DIMENSIONS.includes(value as ReviewDimension)
}

function isFindingSeverity(value: unknown): value is ReviewSeverity {
  return typeof value === "string" && FINDING_SEVERITY.includes(value as ReviewSeverity)
}

function isFindingConfidence(value: unknown): value is ReviewFindingConfidence {
  return typeof value === "string" && FINDING_CONFIDENCE.includes(value as ReviewFindingConfidence)
}

function isRiskLevel(value: unknown): value is ReviewRiskLevel {
  return typeof value === "string" && RISK_LEVELS.includes(value as ReviewRiskLevel)
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided`)
  }

  return value
}

function roundScore(score: number): number {
  return Number(score.toFixed(2))
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a number`)
  }

  if (value < 0 || value > 5) {
    throw new Error(`${fieldName} must be between 0 and 5`)
  }

  return value
}

function parseReviewScores(value: unknown): ReviewScores {
  if (!isRecord(value)) {
    throw new Error("scores must be an object")
  }

  return {
    security: readNumber(value.security, "scores.security"),
    safety: readNumber(value.safety, "scores.safety"),
    performance: readNumber(value.performance, "scores.performance"),
    featureQuality: readNumber(value.featureQuality, "scores.featureQuality"),
    confidence: readNumber(value.confidence, "scores.confidence"),
  }
}

function parseReviewFinding(value: unknown, index: number): ReviewFinding {
  if (!isRecord(value)) {
    throw new Error(`findings[${index}] must be an object`)
  }

  if (!isDimension(value.dimension)) {
    throw new Error(`findings[${index}].dimension must be one of ${DIMENSIONS.join(", ")}`)
  }

  if (!isFindingSeverity(value.severity)) {
    throw new Error(`findings[${index}].severity must be one of ${FINDING_SEVERITY.join(", ")}`)
  }

  if (!isFindingConfidence(value.confidence)) {
    throw new Error(`findings[${index}].confidence must be one of ${FINDING_CONFIDENCE.join(", ")}`)
  }

  if (typeof value.summary !== "string" || value.summary.trim().length === 0) {
    throw new Error(`findings[${index}].summary must be a non-empty string`)
  }

  const rawLine = value.line
  let line: number | undefined
  if (rawLine !== undefined) {
    if (typeof rawLine !== "number" || !Number.isInteger(rawLine) || rawLine < 1) {
      throw new Error(`findings[${index}].line must be a positive integer when provided`)
    }

    line = rawLine
  }

  return {
    dimension: value.dimension,
    severity: value.severity,
    confidence: value.confidence,
    summary: value.summary,
    file: readOptionalString(value.file, `findings[${index}].file`),
    line,
    suggestion: readOptionalString(value.suggestion, `findings[${index}].suggestion`),
  }
}

export function parseReviewScorecard(value: unknown): ReviewScorecard {
  if (!isRecord(value)) {
    throw new Error("Scorecard must be a JSON object")
  }

  if (!isRiskLevel(value.risk)) {
    throw new Error(`risk must be one of ${RISK_LEVELS.join(", ")}`)
  }

  if (typeof value.autoApproveAllowed !== "boolean") {
    throw new Error("autoApproveAllowed must be a boolean")
  }

  if (!Array.isArray(value.findings)) {
    throw new Error("findings must be an array")
  }

  return {
    summary: readOptionalString(value.summary, "summary"),
    source: readOptionalString(value.source, "source"),
    scores: parseReviewScores(value.scores),
    risk: value.risk,
    autoApproveAllowed: value.autoApproveAllowed,
    findings: value.findings.map((finding, index) => parseReviewFinding(finding, index)),
  }
}

export function calculateCompositeScore(scores: ReviewScores): number {
  return roundScore((scores.security + scores.safety + scores.performance + scores.featureQuality) / 4)
}

function formatScore(score: number): string {
  const roundedToTwoDecimals = Number(score.toFixed(2))

  if (Math.abs(score - roundedToTwoDecimals) < Number.EPSILON) {
    return score.toFixed(2)
  }

  return score.toString()
}

function isBlockingCriticalFinding(finding: ReviewFinding): boolean {
  return (
    (finding.dimension === "security" || finding.dimension === "safety") &&
    finding.severity === "critical" &&
    (finding.confidence === "medium" || finding.confidence === "high")
  )
}

function getBlockingReasons(scorecard: ReviewScorecard): string[] {
  const reasons: string[] = []

  if (scorecard.scores.security < BLOCK_MINIMUM_SCORE) {
    reasons.push(`Security score ${formatScore(scorecard.scores.security)} is below the blocking threshold of ${formatScore(BLOCK_MINIMUM_SCORE)}`)
  }

  if (scorecard.scores.safety < BLOCK_MINIMUM_SCORE) {
    reasons.push(`Safety score ${formatScore(scorecard.scores.safety)} is below the blocking threshold of ${formatScore(BLOCK_MINIMUM_SCORE)}`)
  }

  for (const finding of scorecard.findings) {
    if (!isBlockingCriticalFinding(finding)) {
      continue
    }

    const location = finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""
    reasons.push(`Critical ${finding.dimension} finding with ${finding.confidence} confidence: ${finding.summary}${location}`)
  }

  return reasons
}

function getAutoApprovalGapReasons(scorecard: ReviewScorecard, compositeScore: number): string[] {
  const reasons: string[] = []

  for (const dimension of DIMENSIONS) {
    const score = scorecard.scores[dimension]
    if (score < AUTO_APPROVE_MINIMUM_SCORE) {
      reasons.push(`${dimension} score ${formatScore(score)} is below the auto-approval threshold of ${formatScore(AUTO_APPROVE_MINIMUM_SCORE)}`)
    }
  }

  if (compositeScore < AUTO_APPROVE_MINIMUM_COMPOSITE) {
    reasons.push(`Composite score ${formatScore(compositeScore)} is below the auto-approval threshold of ${formatScore(AUTO_APPROVE_MINIMUM_COMPOSITE)}`)
  }

  if (scorecard.scores.confidence < AUTO_APPROVE_MINIMUM_CONFIDENCE) {
    reasons.push(`Confidence score ${formatScore(scorecard.scores.confidence)} is below the auto-approval threshold of ${formatScore(AUTO_APPROVE_MINIMUM_CONFIDENCE)}`)
  }

  if (scorecard.risk !== "low") {
    reasons.push(`Risk level ${scorecard.risk} is not eligible for auto-approval`)
  }

  if (!scorecard.autoApproveAllowed) {
    reasons.push("Auto-approval is disabled for this change set")
  }

  return reasons
}

function summarizeDecision(decision: ReviewPolicyResult["decision"], compositeScore: number, reasons: string[]): string {
  const label = decision.replace(/_/g, " ")
  const primaryReason = reasons[0]

  if (!primaryReason) {
    return `Decision: ${label}. Composite score ${formatScore(compositeScore)}.`
  }

  return `Decision: ${label}. Composite score ${formatScore(compositeScore)}. Primary reason: ${primaryReason}.`
}

export function evaluateReviewScorecard(scorecard: ReviewScorecard): ReviewPolicyResult {
  const compositeScore = calculateCompositeScore(scorecard.scores)
  const blockingReasons = getBlockingReasons(scorecard)

  if (blockingReasons.length > 0) {
    return {
      decision: "block",
      summary: summarizeDecision("block", compositeScore, blockingReasons),
      reasons: blockingReasons,
      blocked: true,
      autoApprove: false,
      compositeScore,
      scores: scorecard.scores,
      risk: scorecard.risk,
      autoApproveAllowed: scorecard.autoApproveAllowed,
    }
  }

  const autoApprovalGapReasons = getAutoApprovalGapReasons(scorecard, compositeScore)
  if (autoApprovalGapReasons.length > 0) {
    return {
      decision: "request_fixes",
      summary: summarizeDecision("request_fixes", compositeScore, autoApprovalGapReasons),
      reasons: autoApprovalGapReasons,
      blocked: false,
      autoApprove: false,
      compositeScore,
      scores: scorecard.scores,
      risk: scorecard.risk,
      autoApproveAllowed: scorecard.autoApproveAllowed,
    }
  }

  const reasons = ["All review thresholds satisfied for auto-approval eligibility"]

  return {
    decision: "auto_approve",
    summary: summarizeDecision("auto_approve", compositeScore, reasons),
    reasons,
    blocked: false,
    autoApprove: true,
    compositeScore,
    scores: scorecard.scores,
    risk: scorecard.risk,
    autoApproveAllowed: scorecard.autoApproveAllowed,
  }
}
