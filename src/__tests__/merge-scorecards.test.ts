import { describe, expect, it } from "vitest"
import { mergeScorecards } from "../review/merge-scorecards"
import { evaluateReviewScorecard } from "../review/policy"
import type { ReviewScorecard } from "../review/types"

function makeScorecard(overrides: Partial<ReviewScorecard> = {}): ReviewScorecard {
  return {
    summary: "Test scorecard",
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

describe("mergeScorecards", () => {
  describe("Normal Copilot-present path", () => {
    it("takes security and safety always from check-run, never from Copilot", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 3.5,
          safety: 2.8,
          performance: 4.0,
          featureQuality: 4.1,
          confidence: 4.2,
        },
      })
      const copilot = makeScorecard({
        scores: {
          security: 4.9,
          safety: 4.95,
          performance: 4.8,
          featureQuality: 4.8,
          confidence: 4.7,
        },
      })

      const merged = mergeScorecards(checkRun, copilot)

      // Security and safety come from check-run only
      expect(merged.scores.security).toBe(3.5)
      expect(merged.scores.safety).toBe(2.8)
    })

    it("takes performance and featureQuality from Copilot when present", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 3.5,
          featureQuality: 3.8,
          confidence: 4.6,
        },
      })
      const copilot = makeScorecard({
        scores: {
          security: 4.0,
          safety: 4.0,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.5,
        },
      })

      const merged = mergeScorecards(checkRun, copilot)

      // Performance and featureQuality come from Copilot
      expect(merged.scores.performance).toBe(4.7)
      expect(merged.scores.featureQuality).toBe(4.9)
    })

    it("computes confidence as minimum of check-run and Copilot", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.2,
        },
      })
      const copilot = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.6,
        },
      })

      const merged = mergeScorecards(checkRun, copilot)

      // Confidence is minimum
      expect(merged.scores.confidence).toBe(4.2)
    })

    it("selects most-severe risk level from both scorecards", () => {
      const checkRun = makeScorecard({
        risk: "low",
      })
      const copilot = makeScorecard({
        risk: "high",
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.risk).toBe("high")
    })

    it("respects risk precedence: high > medium > low", () => {
      const checkRun = makeScorecard({
        risk: "medium",
      })
      const copilot = makeScorecard({
        risk: "low",
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.risk).toBe("medium")
    })

    it("concatenates findings from both scorecards", () => {
      const checkRun = makeScorecard({
        findings: [
          {
            dimension: "security",
            severity: "warning",
            confidence: "high",
            summary: "Check-run finding",
          },
        ],
      })
      const copilot = makeScorecard({
        findings: [
          {
            dimension: "performance",
            severity: "info",
            confidence: "medium",
            summary: "Copilot finding",
          },
        ],
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.findings).toHaveLength(2)
      expect(merged.findings[0].summary).toBe("Check-run finding")
      expect(merged.findings[1].summary).toBe("Copilot finding")
    })

    it("combines summaries with source attribution", () => {
      const checkRun = makeScorecard({
        summary: "Check-run analysis",
      })
      const copilot = makeScorecard({
        summary: "Copilot review",
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.summary).toBe("[check-run] Check-run analysis [copilot] Copilot review")
    })

    it("omits check-run summary attribution when summary is empty", () => {
      const checkRun = makeScorecard({
        summary: undefined,
      })
      const copilot = makeScorecard({
        summary: "Copilot review",
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.summary).toBe("[copilot] Copilot review")
    })

    it("omits Copilot summary attribution when Copilot summary is empty", () => {
      const checkRun = makeScorecard({
        summary: "Check-run analysis",
      })
      const copilot = makeScorecard({
        summary: undefined,
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.summary).toBe("[check-run] Check-run analysis")
    })

    it("computes logical AND for autoApproveAllowed", () => {
      const checkRun = makeScorecard({
        autoApproveAllowed: true,
      })
      const copilot = makeScorecard({
        autoApproveAllowed: true,
      })

      let merged = mergeScorecards(checkRun, copilot)
      expect(merged.autoApproveAllowed).toBe(true)

      // One false blocks approval
      merged = mergeScorecards(
        makeScorecard({ autoApproveAllowed: true }),
        makeScorecard({ autoApproveAllowed: false }),
      )
      expect(merged.autoApproveAllowed).toBe(false)

      // Both false blocks approval
      merged = mergeScorecards(
        makeScorecard({ autoApproveAllowed: false }),
        makeScorecard({ autoApproveAllowed: false }),
      )
      expect(merged.autoApproveAllowed).toBe(false)
    })

    it("sets source to 'merged:check-run+copilot' when Copilot is present", () => {
      const checkRun = makeScorecard()
      const copilot = makeScorecard()

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.source).toBe("merged:check-run+copilot")
    })
  })

  describe("Null-Copilot degradation path", () => {
    it("uses check-run fallback for performance when Copilot is null", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 4.3,
          featureQuality: 4.2,
          confidence: 4.6,
        },
      })

      const merged = mergeScorecards(checkRun, null)

      // Fallback to check-run when Copilot is null
      expect(merged.scores.performance).toBe(4.3)
      expect(merged.scores.featureQuality).toBe(4.2)
    })

    it("uses check-run confidence when Copilot is null", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.6,
        },
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.scores.confidence).toBe(4.6)
    })

    it("respects check-run risk level when Copilot is null", () => {
      const checkRun = makeScorecard({
        risk: "medium",
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.risk).toBe("medium")
    })

    it("uses only check-run findings when Copilot is null", () => {
      const checkRun = makeScorecard({
        findings: [
          {
            dimension: "security",
            severity: "warning",
            confidence: "high",
            summary: "Check-run finding",
          },
        ],
      })

      const merged = mergeScorecards(checkRun, null)

      // Check-run finding + degradation finding
      expect(merged.findings).toHaveLength(2)
      expect(merged.findings[0].summary).toBe("Check-run finding")
    })

    it("adds informational degradation finding when Copilot is null", () => {
      const checkRun = makeScorecard({
        findings: [],
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.findings).toHaveLength(1)
      const degradationFinding = merged.findings[0]
      expect(degradationFinding.dimension).toBe("performance")
      expect(degradationFinding.severity).toBe("info")
      expect(degradationFinding.confidence).toBe("low")
      expect(degradationFinding.summary).toBe("Copilot review unavailable — using check-run proxy scores only")
    })

    it("degrades autoApproveAllowed when check-run disallows approval and Copilot is null", () => {
      const checkRun = makeScorecard({
        autoApproveAllowed: false,
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.autoApproveAllowed).toBe(false)
    })

    it("allows approval when check-run allows and Copilot is null", () => {
      const checkRun = makeScorecard({
        autoApproveAllowed: true,
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.autoApproveAllowed).toBe(true)
    })

    it("uses only check-run summary when Copilot is null", () => {
      const checkRun = makeScorecard({
        summary: "Check-run analysis",
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.summary).toBe("[check-run] Check-run analysis")
    })

    it("handles empty check-run summary when Copilot is null", () => {
      const checkRun = makeScorecard({
        summary: undefined,
      })

      const merged = mergeScorecards(checkRun, null)

      // No summary from check-run, only degradation finding
      expect(merged.summary).toBeUndefined()
      expect(merged.findings.some((f) => f.summary.includes("unavailable"))).toBe(true)
    })

    it("sets source to 'check-run-only:copilot-unavailable' when Copilot is null", () => {
      const checkRun = makeScorecard()

      const merged = mergeScorecards(checkRun, null)

      expect(merged.source).toBe("check-run-only:copilot-unavailable")
    })
  })

  describe("Edge cases", () => {
    it("handles all five dimensions in both scorecards", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 3.0,
          safety: 3.1,
          performance: 3.2,
          featureQuality: 3.3,
          confidence: 3.4,
        },
      })
      const copilot = makeScorecard({
        scores: {
          security: 5.0,
          safety: 5.0,
          performance: 4.9,
          featureQuality: 4.8,
          confidence: 4.7,
        },
      })

      const merged = mergeScorecards(checkRun, copilot)

      // All dimensions preserved as per merge rules
      expect(merged.scores.security).toBe(3.0)
      expect(merged.scores.safety).toBe(3.1)
      expect(merged.scores.performance).toBe(4.9)
      expect(merged.scores.featureQuality).toBe(4.8)
      expect(merged.scores.confidence).toBe(3.4)
    })

    it("produces deterministic output given same input", () => {
      const checkRun = makeScorecard()
      const copilot = makeScorecard()

      const merged1 = mergeScorecards(checkRun, copilot)
      const merged2 = mergeScorecards(checkRun, copilot)

      expect(JSON.stringify(merged1)).toBe(JSON.stringify(merged2))
    })

    it("does not mutate input scorecards", () => {
      const checkRun = makeScorecard({
        findings: [
          {
            dimension: "security",
            severity: "warning",
            confidence: "high",
            summary: "Original finding",
          },
        ],
      })
      const copilot = makeScorecard({
        findings: [
          {
            dimension: "performance",
            severity: "info",
            confidence: "medium",
            summary: "Copilot finding",
          },
        ],
      })

      const checkRunFindingsLength = checkRun.findings.length
      const copilotFindingsLength = copilot.findings.length

      mergeScorecards(checkRun, copilot)

      // Input arrays remain unchanged
      expect(checkRun.findings).toHaveLength(checkRunFindingsLength)
      expect(copilot.findings).toHaveLength(copilotFindingsLength)
    })

    it("handles multiple findings from each scorecard", () => {
      const checkRun = makeScorecard({
        findings: [
          {
            dimension: "security",
            severity: "warning",
            confidence: "high",
            summary: "Check-run finding 1",
          },
          {
            dimension: "safety",
            severity: "critical",
            confidence: "high",
            summary: "Check-run finding 2",
          },
        ],
      })
      const copilot = makeScorecard({
        findings: [
          {
            dimension: "performance",
            severity: "info",
            confidence: "medium",
            summary: "Copilot finding 1",
          },
          {
            dimension: "featureQuality",
            severity: "warning",
            confidence: "high",
            summary: "Copilot finding 2",
          },
        ],
      })

      const merged = mergeScorecards(checkRun, copilot)

      expect(merged.findings).toHaveLength(4)
      expect(merged.findings.map((f) => f.summary)).toEqual([
        "Check-run finding 1",
        "Check-run finding 2",
        "Copilot finding 1",
        "Copilot finding 2",
      ])
    })
  })
})

describe("Confidence contradiction regression", () => {
  it("deterministic-only path still produces request_fixes due to performance/featureQuality caps", () => {
    // Simulates a healthy PR: all checks pass, but no Copilot analysis
    const healthyDeterministic = makeScorecard({
      scores: {
        security: 4.9,
        safety: 4.8,
        performance: 4.0, // Capped proxy for build
        featureQuality: 4.1, // Capped proxy for test
        confidence: 4.2, // Healthy deterministic confidence (was 3.8)
      },
      risk: "low",
      autoApproveAllowed: true,
    })

    const result = evaluateReviewScorecard(healthyDeterministic)

    // Deterministic alone should still request_fixes due to perf/quality caps
    expect(result.decision).toBe("request_fixes")
    expect(result.reasons.some((reason) => reason.includes("performance"))).toBe(true)
  })

  it("merged path with strong Copilot scores and healthy deterministic confidence can auto_approve", () => {
    // Simulates a healthy PR with strong Copilot analysis
    const healthyDeterministic = makeScorecard({
      scores: {
        security: 4.9,
        safety: 4.8,
        performance: 4.0,
        featureQuality: 4.1,
        confidence: 4.2, // Healthy deterministic confidence (>= 4.0 for auto-approve)
      },
      risk: "low",
      autoApproveAllowed: true,
    })

    const strongCopilot = makeScorecard({
      scores: {
        security: 4.8, // Copilot security/safety ignored, check-run takes precedence
        safety: 4.9,
        performance: 4.8, // Strong Copilot performance
        featureQuality: 4.9, // Strong Copilot quality
        confidence: 4.6, // Copilot confidence (min will be 4.2)
      },
      risk: "low",
      autoApproveAllowed: true,
    })

    const merged = mergeScorecards(healthyDeterministic, strongCopilot)
    const result = evaluateReviewScorecard(merged)

    // Merged with strong Copilot should auto_approve now
    expect(merged.scores.security).toBe(4.9) // From check-run
    expect(merged.scores.safety).toBe(4.8) // From check-run
    expect(merged.scores.performance).toBe(4.8) // From Copilot
    expect(merged.scores.featureQuality).toBe(4.9) // From Copilot
    expect(merged.scores.confidence).toBe(4.2) // Minimum of 4.2 and 4.6
    expect(result.decision).toBe("auto_approve") // Can now reach auto_approve!
    expect(result.autoApprove).toBe(true)
  })
})
