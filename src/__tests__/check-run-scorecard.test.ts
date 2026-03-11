import { describe, expect, it } from "vitest"

import { evaluateReviewScorecard } from "../review/policy"
import {
  areRequiredSignalsComplete,
  buildReviewScorecardFromChecks,
  collectReviewCheckSignals,
  type GitHubCheckRun,
} from "../review/check-run-scorecard"

function makeCheckRun(overrides: Partial<GitHubCheckRun> & Pick<GitHubCheckRun, "name">): GitHubCheckRun {
  return {
    name: overrides.name,
    status: overrides.status ?? "completed",
    conclusion: overrides.conclusion ?? "success",
    detailsUrl: overrides.detailsUrl ?? null,
    app: overrides.app ?? null,
  }
}

describe("collectReviewCheckSignals", () => {
  it("collects build, test, and security checks while ignoring unrelated checks", () => {
    const signals = collectReviewCheckSignals([
      makeCheckRun({ name: "label" }),
      makeCheckRun({ name: "build" }),
      makeCheckRun({ name: "test" }),
      makeCheckRun({ name: "Analyze", app: { slug: "github-code-scanning" } }),
      makeCheckRun({ name: "CodeQL" }),
    ])

    expect(signals.build?.name).toBe("build")
    expect(signals.test?.name).toBe("test")
    expect(signals.security.map((checkRun) => checkRun.name)).toEqual(["Analyze", "CodeQL"])
  })
})

describe("areRequiredSignalsComplete", () => {
  it("returns false while required checks are still missing or pending", () => {
    expect(
      areRequiredSignalsComplete({
        build: makeCheckRun({ name: "build", status: "in_progress", conclusion: null }),
        test: null,
        security: [],
      }),
    ).toBe(false)
  })

  it("returns true once build, test, and security checks are completed", () => {
    expect(
      areRequiredSignalsComplete({
        build: makeCheckRun({ name: "build" }),
        test: makeCheckRun({ name: "test" }),
        security: [makeCheckRun({ name: "CodeQL" })],
      }),
    ).toBe(true)
  })
})

describe("buildReviewScorecardFromChecks", () => {
  it("requests fixes when core checks pass but dedicated performance and feature-quality signals are absent", () => {
    const scorecard = buildReviewScorecardFromChecks({
      repository: "EZotoff/omo-pulse",
      headSha: "abc123",
      pullRequestUrl: "https://github.com/EZotoff/omo-pulse/pull/21",
      autoApproveAllowed: true,
      timedOut: false,
      checkRuns: [
        makeCheckRun({ name: "build" }),
        makeCheckRun({ name: "test" }),
        makeCheckRun({ name: "Analyze", app: { slug: "github-code-scanning" } }),
        makeCheckRun({ name: "CodeQL" }),
      ],
    })

    const result = evaluateReviewScorecard(scorecard)

    expect(scorecard.scores.security).toBe(4.9)
    expect(scorecard.scores.safety).toBe(4.8)
    expect(scorecard.scores.performance).toBe(4)
    expect(scorecard.scores.featureQuality).toBe(4.1)
    expect(scorecard.scores.confidence).toBe(4.2)
    expect(scorecard.risk).toBe("low")
    expect(result.decision).toBe("request_fixes")
    expect(result.blocked).toBe(false)
    expect(scorecard.findings.some((finding) => finding.dimension === "performance")).toBe(true)
    expect(scorecard.findings.some((finding) => finding.dimension === "featureQuality")).toBe(true)
  })

  it("blocks when test automation fails", () => {
    const result = evaluateReviewScorecard(
      buildReviewScorecardFromChecks({
        repository: "EZotoff/omo-pulse",
        headSha: "abc123",
        autoApproveAllowed: true,
        timedOut: false,
        checkRuns: [
          makeCheckRun({ name: "build" }),
          makeCheckRun({ name: "test", conclusion: "failure" }),
          makeCheckRun({ name: "CodeQL" }),
        ],
      }),
    )

    expect(result.decision).toBe("block")
    expect(result.reasons.some((reason) => reason.includes("Safety score"))).toBe(true)
  })

  it("blocks when security automation fails", () => {
    const result = evaluateReviewScorecard(
      buildReviewScorecardFromChecks({
        repository: "EZotoff/omo-pulse",
        headSha: "abc123",
        autoApproveAllowed: true,
        timedOut: false,
        checkRuns: [
          makeCheckRun({ name: "build" }),
          makeCheckRun({ name: "test" }),
          makeCheckRun({ name: "Analyze", conclusion: "failure", app: { slug: "github-code-scanning" } }),
        ],
      }),
    )

    expect(result.decision).toBe("block")
    expect(result.reasons.some((reason) => reason.includes("Security score"))).toBe(true)
  })

  it("requests fixes when required checks never become available", () => {
    const scorecard = buildReviewScorecardFromChecks({
      repository: "EZotoff/omo-pulse",
      headSha: "abc123",
      autoApproveAllowed: true,
      timedOut: true,
      checkRuns: [makeCheckRun({ name: "label" })],
    })

    const result = evaluateReviewScorecard(scorecard)

    expect(scorecard.risk).toBe("medium")
    expect(result.decision).toBe("request_fixes")
    expect(scorecard.findings.some((finding) => finding.summary.includes("not available"))).toBe(true)
  })
})
