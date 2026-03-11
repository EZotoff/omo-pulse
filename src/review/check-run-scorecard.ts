import type { ReviewFinding, ReviewRiskLevel, ReviewScorecard } from "./types"

export type GitHubCheckApp = {
  slug?: string | null
  name?: string | null
}

export type GitHubCheckRun = {
  name: string
  status: string
  conclusion: string | null
  detailsUrl?: string | null
  app?: GitHubCheckApp | null
}

export type ReviewCheckSignals = {
  build: GitHubCheckRun | null
  test: GitHubCheckRun | null
  security: GitHubCheckRun[]
}

export type BuildReviewScorecardFromChecksOptions = {
  repository: string
  headSha: string
  pullRequestUrl?: string
  autoApproveAllowed: boolean
  timedOut: boolean
  checkRuns: GitHubCheckRun[]
}

const PASSING_SECURITY_SCORE = 4.9
const PASSING_SAFETY_SCORE = 4.8
const PARTIAL_SIGNAL_SCORE = 3.2
const FAILING_REQUIRED_SCORE = 1.5
const PERFORMANCE_PROXY_SCORE = 4.0
const FEATURE_QUALITY_PROXY_SCORE = 4.1
const HEALTHY_CONFIDENCE_SCORE = 4.2
const PARTIAL_CONFIDENCE_SCORE = 3.2
const HIGH_CONFIDENCE_SCORE = 4.4

function matchesCheckName(name: string, pattern: RegExp): boolean {
  return pattern.test(name.trim())
}

function isSecurityCheck(checkRun: GitHubCheckRun): boolean {
  const name = checkRun.name.trim().toLowerCase()
  const appSlug = checkRun.app?.slug?.trim().toLowerCase()

  return name === "codeql" || name.startsWith("analyze") || appSlug === "github-code-scanning"
}

function isCompleted(checkRun: GitHubCheckRun): boolean {
  return checkRun.status === "completed"
}

function isPassingConclusion(conclusion: string | null): boolean {
  return conclusion === "success"
}

function isUnavailableConclusion(conclusion: string | null): boolean {
  return conclusion === null || conclusion === "neutral" || conclusion === "skipped"
}

function isFailingConclusion(conclusion: string | null): boolean {
  return !isPassingConclusion(conclusion) && !isUnavailableConclusion(conclusion)
}

function formatCheckRunLabel(checkRun: GitHubCheckRun): string {
  if (!isCompleted(checkRun)) {
    return `${checkRun.name} (${checkRun.status})`
  }

  return `${checkRun.name} (${checkRun.conclusion ?? "unknown"})`
}

function getBuildState(build: GitHubCheckRun | null): "pass" | "fail" | "pending" {
  if (!build || !isCompleted(build)) {
    return "pending"
  }

  return isPassingConclusion(build.conclusion) ? "pass" : "fail"
}

function getTestState(test: GitHubCheckRun | null): "pass" | "fail" | "pending" {
  if (!test || !isCompleted(test)) {
    return "pending"
  }

  return isPassingConclusion(test.conclusion) ? "pass" : "fail"
}

function getSecurityState(checkRuns: GitHubCheckRun[]): "pass" | "fail" | "pending" {
  if (checkRuns.length === 0) {
    return "pending"
  }

  if (checkRuns.some((checkRun) => !isCompleted(checkRun))) {
    return "pending"
  }

  if (checkRuns.some((checkRun) => isFailingConclusion(checkRun.conclusion))) {
    return "fail"
  }

  if (checkRuns.every((checkRun) => isPassingConclusion(checkRun.conclusion))) {
    return "pass"
  }

  return "pending"
}

function pushRequiredCheckFindings(
  findings: ReviewFinding[],
  dimension: "security" | "safety",
  checkRuns: GitHubCheckRun[],
  timedOut: boolean,
  missingSummary: string,
): void {
  if (checkRuns.length === 0) {
    findings.push({
      dimension,
      severity: timedOut ? "warning" : "info",
      confidence: "medium",
      summary: missingSummary,
    })
    return
  }

  for (const checkRun of checkRuns) {
    if (!isCompleted(checkRun)) {
      findings.push({
        dimension,
        severity: timedOut ? "warning" : "info",
        confidence: "medium",
        summary: `${checkRun.name} is still ${checkRun.status}.`,
        suggestion: "Wait for the required check to complete before relying on auto-approval.",
      })
      continue
    }

    if (isFailingConclusion(checkRun.conclusion)) {
      findings.push({
        dimension,
        severity: "warning",
        confidence: "high",
        summary: `${checkRun.name} concluded with ${checkRun.conclusion ?? "unknown"}.`,
        suggestion: "Fix the failing required check before expecting the gate to pass cleanly.",
      })
      continue
    }

    if (isUnavailableConclusion(checkRun.conclusion)) {
      findings.push({
        dimension,
        severity: "warning",
        confidence: "medium",
        summary: `${checkRun.name} completed without a passing conclusion (${checkRun.conclusion ?? "unknown"}).`,
      })
    }
  }
}

function summarizeObservedChecks(signals: ReviewCheckSignals): string {
  const parts = [
    `build=${signals.build ? formatCheckRunLabel(signals.build) : "missing"}`,
    `test=${signals.test ? formatCheckRunLabel(signals.test) : "missing"}`,
    `security=${signals.security.length > 0 ? signals.security.map(formatCheckRunLabel).join(", ") : "missing"}`,
  ]

  return parts.join("; ")
}

export function collectReviewCheckSignals(checkRuns: GitHubCheckRun[]): ReviewCheckSignals {
  let build: GitHubCheckRun | null = null
  let test: GitHubCheckRun | null = null
  const security: GitHubCheckRun[] = []

  for (const checkRun of checkRuns) {
    if (!build && matchesCheckName(checkRun.name, /^build$/i)) {
      build = checkRun
      continue
    }

    if (!test && matchesCheckName(checkRun.name, /^test$/i)) {
      test = checkRun
      continue
    }

    if (isSecurityCheck(checkRun)) {
      security.push(checkRun)
    }
  }

  return { build, test, security }
}

export function areRequiredSignalsComplete(signals: ReviewCheckSignals): boolean {
  return Boolean(
    signals.build &&
      signals.test &&
      signals.security.length > 0 &&
      isCompleted(signals.build) &&
      isCompleted(signals.test) &&
      signals.security.every(isCompleted),
  )
}

export function buildReviewScorecardFromChecks(
  options: BuildReviewScorecardFromChecksOptions,
): ReviewScorecard {
  const signals = collectReviewCheckSignals(options.checkRuns)
  const buildState = getBuildState(signals.build)
  const testState = getTestState(signals.test)
  const securityState = getSecurityState(signals.security)

  const safetyFailed = buildState === "fail" || testState === "fail"
  const safetyPassed = buildState === "pass" && testState === "pass"
  const securityFailed = securityState === "fail"
  const securityPassed = securityState === "pass"
  const allCoreChecksPassed = safetyPassed && securityPassed

  const findings: ReviewFinding[] = []
  pushRequiredCheckFindings(
    findings,
    "safety",
    [signals.build, signals.test].filter((checkRun): checkRun is GitHubCheckRun => checkRun !== null),
    options.timedOut,
    "Required build/test checks are not available for this commit yet.",
  )
  pushRequiredCheckFindings(
    findings,
    "security",
    signals.security,
    options.timedOut,
    "Required CodeQL/analysis checks are not available for this commit yet.",
  )

  findings.push({
    dimension: "performance",
    severity: "info",
    confidence: "medium",
    summary: "No dedicated performance auto-check is available yet; the performance score is intentionally capped below auto-approval.",
  })
  findings.push({
    dimension: "featureQuality",
    severity: "info",
    confidence: "medium",
    summary: "No dedicated feature-quality auto-check is available yet; the feature-quality score is intentionally capped below auto-approval.",
  })

  const securityScore = securityFailed ? FAILING_REQUIRED_SCORE : securityPassed ? PASSING_SECURITY_SCORE : PARTIAL_SIGNAL_SCORE
  const safetyScore = safetyFailed ? FAILING_REQUIRED_SCORE : safetyPassed ? PASSING_SAFETY_SCORE : PARTIAL_SIGNAL_SCORE

  const performanceScore = buildState === "pass" ? PERFORMANCE_PROXY_SCORE : PARTIAL_SIGNAL_SCORE
  const featureQualityScore = testState === "pass" ? FEATURE_QUALITY_PROXY_SCORE : PARTIAL_SIGNAL_SCORE
  const confidenceScore = safetyFailed || securityFailed ? HIGH_CONFIDENCE_SCORE : allCoreChecksPassed ? HEALTHY_CONFIDENCE_SCORE : PARTIAL_CONFIDENCE_SCORE

  const risk: ReviewRiskLevel = safetyFailed || securityFailed ? "high" : allCoreChecksPassed ? "low" : "medium"

  const target = options.pullRequestUrl ?? `${options.repository}@${options.headSha}`

  return {
    summary: `Derived from GitHub auto-checks for ${target}. Observed ${summarizeObservedChecks(signals)}.`,
    source: "github-check-runs",
    scores: {
      security: securityScore,
      safety: safetyScore,
      performance: performanceScore,
      featureQuality: featureQualityScore,
      confidence: confidenceScore,
    },
    risk,
    autoApproveAllowed: options.autoApproveAllowed,
    findings,
  }
}
