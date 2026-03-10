import { describe, expect, it } from "vitest"
import { evaluateReviewScorecard, parseReviewScorecard } from "../review/policy"
import type { ReviewScorecard } from "../review/types"

function makeScorecard(overrides: Partial<ReviewScorecard> = {}): ReviewScorecard {
  return {
    summary: "Base review scorecard",
    source: "unit-test",
    scores: {
      security: 4.8,
      safety: 4.9,
      performance: 4.7,
      featureQuality: 4.9,
      confidence: 4.6,
    },
    risk: "low",
    autoApproveAllowed: true,
    findings: [],
    ...overrides,
  }
}

describe("parseReviewScorecard", () => {
  it("parses a valid scorecard", () => {
    const parsed = parseReviewScorecard({
      summary: "Test scorecard",
      source: "unit-test",
      scores: {
        security: 4.8,
        safety: 4.9,
        performance: 4.6,
        featureQuality: 4.8,
        confidence: 4.2,
      },
      risk: "low",
      autoApproveAllowed: true,
      findings: [],
    })

    expect(parsed.scores.performance).toBe(4.6)
    expect(parsed.risk).toBe("low")
  })

  it("rejects out-of-range scores", () => {
    expect(() =>
      parseReviewScorecard({
        scores: {
          security: 6,
          safety: 4,
          performance: 4,
          featureQuality: 4,
          confidence: 4,
        },
        risk: "low",
        autoApproveAllowed: true,
        findings: [],
      }),
    ).toThrow("scores.security must be between 0 and 5")
  })
})

describe("evaluateReviewScorecard", () => {
  it("blocks when security score is too low", () => {
    const result = evaluateReviewScorecard(
      makeScorecard({
        scores: {
          security: 1.8,
          safety: 4.9,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.6,
        },
      }),
    )

    expect(result.decision).toBe("block")
    expect(result.blocked).toBe(true)
    expect(result.reasons[0]).toContain("Security score")
  })

  it("blocks on critical security findings with medium confidence", () => {
    const result = evaluateReviewScorecard(
      makeScorecard({
        findings: [
          {
            dimension: "security",
            severity: "critical",
            confidence: "medium",
            summary: "Unsanitized shell command",
            file: "scripts/deploy.ts",
            line: 18,
          },
        ],
      }),
    )

    expect(result.decision).toBe("block")
    expect(result.reasons[0]).toContain("Critical security finding")
  })

  it("requests fixes when scores miss the auto-approval threshold", () => {
    const result = evaluateReviewScorecard(
      makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.8,
          performance: 4.2,
          featureQuality: 4.9,
          confidence: 4.6,
        },
      }),
    )

    expect(result.decision).toBe("request_fixes")
    expect(result.blocked).toBe(false)
    expect(result.reasons.some((reason) => reason.includes("performance score 4.20"))).toBe(true)
  })

  it("requests fixes when risk is not low", () => {
    const result = evaluateReviewScorecard(
      makeScorecard({
        risk: "medium",
      }),
    )

    expect(result.decision).toBe("request_fixes")
    expect(result.reasons).toContain("Risk level medium is not eligible for auto-approval")
  })

  it("does not auto-approve when auto-approval is disabled", () => {
    const result = evaluateReviewScorecard(
      makeScorecard({
        autoApproveAllowed: false,
      }),
    )

    expect(result.decision).toBe("request_fixes")
    expect(result.autoApprove).toBe(false)
    expect(result.reasons).toContain("Auto-approval is disabled for this change set")
  })

  it("auto-approves only when every threshold is satisfied", () => {
    const result = evaluateReviewScorecard(makeScorecard())

    expect(result.decision).toBe("auto_approve")
    expect(result.autoApprove).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.compositeScore).toBe(4.82)
  })
})
