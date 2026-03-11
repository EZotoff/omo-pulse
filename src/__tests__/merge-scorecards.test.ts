import { describe, expect, it } from "vitest"
import { mergeScorecards } from "../review/merge-scorecards"
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
  describe("Normal LLM-present path", () => {
    it("takes security and safety always from check-run, never from LLM", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 3.5,
          safety: 2.8,
          performance: 4.0,
          featureQuality: 4.1,
          confidence: 4.2,
        },
      })
      const llm = makeScorecard({
        scores: {
          security: 4.9,
          safety: 4.95,
          performance: 4.8,
          featureQuality: 4.8,
          confidence: 4.7,
        },
      })

      const merged = mergeScorecards(checkRun, llm)

      // Security and safety come from check-run only
      expect(merged.scores.security).toBe(3.5)
      expect(merged.scores.safety).toBe(2.8)
    })

    it("takes performance and featureQuality from LLM when present", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 3.5,
          featureQuality: 3.8,
          confidence: 4.6,
        },
      })
      const llm = makeScorecard({
        scores: {
          security: 4.0,
          safety: 4.0,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.5,
        },
      })

      const merged = mergeScorecards(checkRun, llm)

      // Performance and featureQuality come from LLM
      expect(merged.scores.performance).toBe(4.7)
      expect(merged.scores.featureQuality).toBe(4.9)
    })

    it("computes confidence as minimum of check-run and LLM", () => {
      const checkRun = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.2,
        },
      })
      const llm = makeScorecard({
        scores: {
          security: 4.8,
          safety: 4.9,
          performance: 4.7,
          featureQuality: 4.9,
          confidence: 4.6,
        },
      })

      const merged = mergeScorecards(checkRun, llm)

      // Confidence is minimum
      expect(merged.scores.confidence).toBe(4.2)
    })

    it("selects most-severe risk level from both scorecards", () => {
      const checkRun = makeScorecard({
        risk: "low",
      })
      const llm = makeScorecard({
        risk: "high",
      })

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.risk).toBe("high")
    })

    it("respects risk precedence: high > medium > low", () => {
      const checkRun = makeScorecard({
        risk: "medium",
      })
      const llm = makeScorecard({
        risk: "low",
      })

      const merged = mergeScorecards(checkRun, llm)

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
      const llm = makeScorecard({
        findings: [
          {
            dimension: "performance",
            severity: "info",
            confidence: "medium",
            summary: "LLM finding",
          },
        ],
      })

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.findings).toHaveLength(2)
      expect(merged.findings[0].summary).toBe("Check-run finding")
      expect(merged.findings[1].summary).toBe("LLM finding")
    })

    it("combines summaries with source attribution", () => {
      const checkRun = makeScorecard({
        summary: "Check-run analysis",
      })
      const llm = makeScorecard({
        summary: "LLM review",
      })

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.summary).toBe("[check-run] Check-run analysis [llm] LLM review")
    })

    it("omits check-run summary attribution when summary is empty", () => {
      const checkRun = makeScorecard({
        summary: undefined,
      })
      const llm = makeScorecard({
        summary: "LLM review",
      })

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.summary).toBe("[llm] LLM review")
    })

    it("omits LLM summary attribution when LLM summary is empty", () => {
      const checkRun = makeScorecard({
        summary: "Check-run analysis",
      })
      const llm = makeScorecard({
        summary: undefined,
      })

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.summary).toBe("[check-run] Check-run analysis")
    })

    it("computes logical AND for autoApproveAllowed", () => {
      const checkRun = makeScorecard({
        autoApproveAllowed: true,
      })
      const llm = makeScorecard({
        autoApproveAllowed: true,
      })

      let merged = mergeScorecards(checkRun, llm)
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

    it("sets source to 'merged:check-run+llm' when LLM is present", () => {
      const checkRun = makeScorecard()
      const llm = makeScorecard()

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.source).toBe("merged:check-run+llm")
    })
  })

  describe("Null-LLM degradation path", () => {
    it("uses check-run fallback for performance when LLM is null", () => {
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

      // Fallback to check-run when LLM is null
      expect(merged.scores.performance).toBe(4.3)
      expect(merged.scores.featureQuality).toBe(4.2)
    })

    it("uses check-run confidence when LLM is null", () => {
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

    it("respects check-run risk level when LLM is null", () => {
      const checkRun = makeScorecard({
        risk: "medium",
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.risk).toBe("medium")
    })

    it("uses only check-run findings when LLM is null", () => {
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

    it("adds informational degradation finding when LLM is null", () => {
      const checkRun = makeScorecard({
        findings: [],
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.findings).toHaveLength(1)
      const degradationFinding = merged.findings[0]
      expect(degradationFinding.dimension).toBe("performance")
      expect(degradationFinding.severity).toBe("info")
      expect(degradationFinding.confidence).toBe("low")
      expect(degradationFinding.summary).toBe("LLM analysis unavailable — using check-run proxy scores only")
    })

    it("degrades autoApproveAllowed when check-run disallows approval and LLM is null", () => {
      const checkRun = makeScorecard({
        autoApproveAllowed: false,
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.autoApproveAllowed).toBe(false)
    })

    it("allows approval when check-run allows and LLM is null", () => {
      const checkRun = makeScorecard({
        autoApproveAllowed: true,
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.autoApproveAllowed).toBe(true)
    })

    it("uses only check-run summary when LLM is null", () => {
      const checkRun = makeScorecard({
        summary: "Check-run analysis",
      })

      const merged = mergeScorecards(checkRun, null)

      expect(merged.summary).toBe("[check-run] Check-run analysis")
    })

    it("handles empty check-run summary when LLM is null", () => {
      const checkRun = makeScorecard({
        summary: undefined,
      })

      const merged = mergeScorecards(checkRun, null)

      // No summary from check-run, only degradation finding
      expect(merged.summary).toBeUndefined()
      expect(merged.findings.some((f) => f.summary.includes("unavailable"))).toBe(true)
    })

    it("sets source to 'check-run-only:llm-unavailable' when LLM is null", () => {
      const checkRun = makeScorecard()

      const merged = mergeScorecards(checkRun, null)

      expect(merged.source).toBe("check-run-only:llm-unavailable")
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
      const llm = makeScorecard({
        scores: {
          security: 5.0,
          safety: 5.0,
          performance: 4.9,
          featureQuality: 4.8,
          confidence: 4.7,
        },
      })

      const merged = mergeScorecards(checkRun, llm)

      // All dimensions preserved as per merge rules
      expect(merged.scores.security).toBe(3.0)
      expect(merged.scores.safety).toBe(3.1)
      expect(merged.scores.performance).toBe(4.9)
      expect(merged.scores.featureQuality).toBe(4.8)
      expect(merged.scores.confidence).toBe(3.4)
    })

    it("produces deterministic output given same input", () => {
      const checkRun = makeScorecard()
      const llm = makeScorecard()

      const merged1 = mergeScorecards(checkRun, llm)
      const merged2 = mergeScorecards(checkRun, llm)

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
      const llm = makeScorecard({
        findings: [
          {
            dimension: "performance",
            severity: "info",
            confidence: "medium",
            summary: "LLM finding",
          },
        ],
      })

      const checkRunFindingsLength = checkRun.findings.length
      const llmFindingsLength = llm.findings.length

      mergeScorecards(checkRun, llm)

      // Input arrays remain unchanged
      expect(checkRun.findings).toHaveLength(checkRunFindingsLength)
      expect(llm.findings).toHaveLength(llmFindingsLength)
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
      const llm = makeScorecard({
        findings: [
          {
            dimension: "performance",
            severity: "info",
            confidence: "medium",
            summary: "LLM finding 1",
          },
          {
            dimension: "featureQuality",
            severity: "warning",
            confidence: "high",
            summary: "LLM finding 2",
          },
        ],
      })

      const merged = mergeScorecards(checkRun, llm)

      expect(merged.findings).toHaveLength(4)
      expect(merged.findings.map((f) => f.summary)).toEqual([
        "Check-run finding 1",
        "Check-run finding 2",
        "LLM finding 1",
        "LLM finding 2",
      ])
    })
  })
})
