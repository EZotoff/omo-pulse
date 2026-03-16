import type { ReviewFinding, ReviewRiskLevel, ReviewScorecard } from "./types"

/**
 * Merges a check-run scorecard with an optional Copilot scorecard following these rules:
 *
 * - `security` and `safety`: Always from check-run (Copilot cannot override)
 * - `performance` and `featureQuality`: From Copilot if present, else from check-run
 * - `confidence`: Minimum of available scorecards
 * - `risk`: Most-severe ordering (high > medium > low)
 * - `findings`: Concatenated from both, with source attribution
 * - `summary`: Combined from both with source attribution; null Copilot uses informational degradation message
 * - `autoApproveAllowed`: Logical AND of both
 * - `source`: "merged:check-run+copilot" for normal case, "check-run-only:copilot-unavailable" when Copilot is null
 *
 * When Copilot is null, an informational finding is added with the summary:
 * "Copilot review unavailable — using check-run proxy scores only"
 */
export function mergeScorecards(
  checkRunScorecard: ReviewScorecard,
  copilotScorecard: ReviewScorecard | null,
): ReviewScorecard {
  // Extract scores: security and safety always from check-run
  const security = checkRunScorecard.scores.security
  const safety = checkRunScorecard.scores.safety

  // Performance and featureQuality from Copilot if present, else check-run
  const performance = copilotScorecard?.scores.performance ?? checkRunScorecard.scores.performance
  const featureQuality = copilotScorecard?.scores.featureQuality ?? checkRunScorecard.scores.featureQuality

  // Confidence is the minimum of available scorecards
  const checkRunConfidence = checkRunScorecard.scores.confidence
  const copilotConfidence = copilotScorecard?.scores.confidence ?? checkRunConfidence
  const confidence = Math.min(checkRunConfidence, copilotConfidence)

  // Risk: most-severe ordering (high > medium > low)
  const riskOrdering: { [key in ReviewRiskLevel]: number } = { high: 3, medium: 2, low: 1 }
  const checkRunRiskValue = riskOrdering[checkRunScorecard.risk]
  const copilotRiskValue = copilotScorecard ? riskOrdering[copilotScorecard.risk] : 0
  const mergedRiskValue = Math.max(checkRunRiskValue, copilotRiskValue)
  const riskLevels: ReviewRiskLevel[] = ["low", "medium", "high"]
  const risk = riskLevels[mergedRiskValue - 1] ?? "low"

  // Findings: concatenate from both
  const findings: ReviewFinding[] = [...checkRunScorecard.findings]
  if (copilotScorecard) {
    findings.push(...copilotScorecard.findings)
  } else {
    // Add informational degradation finding when Copilot is unavailable
    findings.push({
      dimension: "performance",
      severity: "info",
      confidence: "low",
      summary: "Copilot review unavailable — using check-run proxy scores only",
    })
  }

  // Summary: combine with source attribution
  const summaryParts: string[] = []
  if (checkRunScorecard.summary) {
    summaryParts.push(`[check-run] ${checkRunScorecard.summary}`)
  }
  if (copilotScorecard?.summary) {
    summaryParts.push(`[copilot] ${copilotScorecard.summary}`)
  }
  const summary = summaryParts.join(" ")

  // autoApproveAllowed: logical AND
  const autoApproveAllowed =
    checkRunScorecard.autoApproveAllowed && (copilotScorecard?.autoApproveAllowed ?? true)

  // Source: normal case vs null Copilot case
  const source = copilotScorecard ? "merged:check-run+copilot" : "check-run-only:copilot-unavailable"

  return {
    summary: summary || undefined,
    source,
    scores: {
      security,
      safety,
      performance,
      featureQuality,
      confidence,
    },
    risk,
    autoApproveAllowed,
    findings,
  }
}
