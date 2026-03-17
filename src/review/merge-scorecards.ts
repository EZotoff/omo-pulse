import type { ReviewFinding, ReviewRiskLevel, ReviewScorecard } from "./types"

/**
 * Merges a check-run scorecard with an optional LLM scorecard following these rules:
 *
 * - `security` and `safety`: Always from check-run (LLM cannot override)
 * - `performance` and `featureQuality`: From LLM if present, else from check-run
 * - `confidence`: Minimum of available scorecards
 * - `risk`: Most-severe ordering (high > medium > low)
 * - `findings`: Concatenated from both; null LLM adds an informational fallback finding
 * - `summary`: Combined from available summaries with source labels when present
 * - `autoApproveAllowed`: Logical AND of both
 * - `source`: "merged:check-run+llm" for normal case, "check-run-only:llm-unavailable" when LLM is null
 *
 * When LLM is null, an informational finding is added with the summary:
 * "LLM analysis unavailable — using check-run proxy scores only"
 */
export function mergeScorecards(
  checkRunScorecard: ReviewScorecard,
  llmScorecard: ReviewScorecard | null,
): ReviewScorecard {
  // Extract scores: security and safety always from check-run
  const security = checkRunScorecard.scores.security
  const safety = checkRunScorecard.scores.safety

  // Performance and featureQuality from LLM if present, else check-run
  const performance = llmScorecard?.scores.performance ?? checkRunScorecard.scores.performance
  const featureQuality = llmScorecard?.scores.featureQuality ?? checkRunScorecard.scores.featureQuality

  // Confidence is the minimum of available scorecards
  const checkRunConfidence = checkRunScorecard.scores.confidence
  const llmConfidence = llmScorecard?.scores.confidence ?? checkRunConfidence
  const confidence = Math.min(checkRunConfidence, llmConfidence)

  // Risk: most-severe ordering (high > medium > low)
  const riskOrdering: { [key in ReviewRiskLevel]: number } = { high: 3, medium: 2, low: 1 }
  const checkRunRiskValue = riskOrdering[checkRunScorecard.risk]
  const llmRiskValue = llmScorecard ? riskOrdering[llmScorecard.risk] : 0
  const mergedRiskValue = Math.max(checkRunRiskValue, llmRiskValue)
  const riskLevels: ReviewRiskLevel[] = ["low", "medium", "high"]
  const risk = riskLevels[mergedRiskValue - 1] ?? "low"

  // Findings: concatenate from both
  const findings: ReviewFinding[] = [...checkRunScorecard.findings]
  if (llmScorecard) {
    findings.push(...llmScorecard.findings)
  } else {
    // Add informational degradation finding when LLM is unavailable
    findings.push({
      dimension: "performance",
      severity: "info",
      confidence: "low",
      summary: "LLM analysis unavailable — using check-run proxy scores only",
    })
  }

  // Summary: combine with source attribution
  const summaryParts: string[] = []
  if (checkRunScorecard.summary) {
    summaryParts.push(`[check-run] ${checkRunScorecard.summary}`)
  }
  if (llmScorecard?.summary) {
    summaryParts.push(`[llm] ${llmScorecard.summary}`)
  }
  const summary = summaryParts.join(" ")

  // autoApproveAllowed: logical AND
  const autoApproveAllowed =
    checkRunScorecard.autoApproveAllowed && (llmScorecard?.autoApproveAllowed ?? true)

  // Source: normal case vs null LLM case
  const source = llmScorecard ? "merged:check-run+llm" : "check-run-only:llm-unavailable"

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
