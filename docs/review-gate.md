# AI Review Gate

This document describes the Copilot-based AI review gate architecture that evaluates pull requests across four dimensions and produces one of three outcomes: block, request fixes, or auto-approve.

## Overview

The system uses a two-scorecard merging strategy:

1. **Check-run scorecard** — derived deterministically from CI signals (build, test, security scans)
2. **Copilot scorecard** — parsed from GitHub Copilot's review comments and structured output

The `src/review/merge-scorecards.ts` module combines these into a single merged scorecard that feeds into the policy gate.

```
                    ┌─────────────────────────────────────┐
                    │   PR opened / synchronized          │
                    └─────────────────┬───────────────────┘
                                      │
           ┌──────────────────────────┴──────────────────────────┐
           │                                                     │
           ▼                                                     ▼
┌─────────────────────┐                              ┌─────────────────────┐
│  generate-review-   │                              │  copilot-review-    │
│  scorecard.ts       │                              │  parser.ts          │
│                     │                              │                     │
│  Polls CI checks    │                              │  Polls for Copilot  │
│  (build, test,      │                              │  review via API     │
│  security)          │                              │                     │
└─────────┬───────────┘                              └─────────┬───────────┘
          │                                                    │
          ▼                                                    ▼
┌─────────────────────┐                              ┌─────────────────────┐
│  check-run-         │                              │  copilot-           │
│  scorecard.json     │                              │  scorecard.json     │
└─────────┬───────────┘                              └─────────┬───────────┘
          │                                                    │
          └──────────────────────────┬─────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────┐
                    │  mergeScorecards()                  │
                    │  src/review/merge-scorecards.ts     │
                    │                                     │
                    │  - security/safety: check-run only  │
                    │  - performance/featureQuality:      │
                    │    Copilot if present               │
                    │  - confidence: minimum of both      │
                    │  - risk: most severe                │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │  scorecard.json (merged)            │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │  ai-review-gate.ts                  │
                    │  src/review/policy.ts               │
                    │                                     │
                    │  Evaluates merged scorecard         │
                    │  against thresholds                 │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │  Decision: block / request_fixes /  │
                    │  auto_approve                       │
                    └─────────────────────────────────────┘
```

## Copilot Integration

GitHub Copilot provides AI review through two mechanisms:

1. **Repo-level auto-review** — When enabled, Copilot automatically reviews pull requests and posts findings as inline comments and a review summary
2. **`.github/copilot-instructions.md`** — Structured output format instructions that tell Copilot how to format scores and findings

The `scripts/copilot-review-parser.ts` polls the GitHub API for Copilot reviews, parses the structured tokens, and produces a normalized scorecard. It handles graceful degradation when structured output is missing or malformed.

## Structured Output Format

Copilot includes structured tokens in review output. The parser extracts these blocks:

**Inline comment format:**
```
[SEVERITY:critical|warning|info|nit] [DIM:security|safety|performance|featureQuality]

Finding description here.
```

**Review body format:**
```
[RISK:low|medium|high]

[SCORES]
{"security": N, "safety": N, "performance": N, "featureQuality": N, "confidence": N}
[/SCORES]

[SUMMARY]
Overall assessment text.
[/SUMMARY]
```

The parser validates all tokens and falls back to deriving scores from inline findings when the `[SCORES]` block is missing or malformed.

## Graceful Degradation

When Copilot review is unavailable or structured output is incomplete:

- **Copilot review absent** — The merge step labels the source as `check-run-only:copilot-unavailable` and adds an informational finding. Performance and feature quality scores fall back to check-run proxies.

- **Structured output missing/malformed** — If Copilot reviewed but did not include a `[SCORES]` block, the parser derives scores from `[SEVERITY]` tokens found in inline comments. The source is labeled `copilot:degraded`. If no structured tokens are found at all, conservative default scores are applied.

In all cases, the gate continues to operate using available data. The `continue-on-error: true` flag in the workflow ensures transient Copilot delays do not block the PR.

## Score Dimensions

All scores are on a 0-5 scale:

| Dimension | Description |
|-----------|-------------|
| `security` | Vulnerabilities, authentication, authorization, encryption |
| `safety` | Runtime errors, crashes, undefined behavior, null safety |
| `performance` | Efficiency, memory usage, algorithmic complexity |
| `featureQuality` | Correctness, maintainability, API design, test coverage |
| `confidence` | Confidence in the overall assessment (0-5) |

Severity tokens in inline comments:
- `critical` — Blocks deployment or causes runtime failure
- `warning` — Significant issue before merge
- `info` — Minor improvement or best practice
- `nit` — Stylistic or cosmetic comment (mapped to `info`)

## Policy Thresholds

The gate in `src/review/policy.ts` evaluates merged scorecards against these baseline thresholds:

- **Blocking floor**: any dimension `< 2` triggers a block
- **Auto-approve baseline**: all dimensions `>= 4.5` required for auto-approve eligibility

See `src/review/policy.ts` for the complete decision logic including risk, confidence, and composite score handling.

## Key Files

| File | Purpose |
|------|---------|
| `scripts/copilot-review-parser.ts` | Polls GitHub API for Copilot reviews, parses structured tokens, writes Copilot scorecard |
| `scripts/generate-review-scorecard.ts` | Polls CI checks, derives deterministic check-run scorecard |
| `scripts/ai-review-gate.ts` | CLI that evaluates merged scorecard and emits GitHub Action outputs |
| `src/review/merge-scorecards.ts` | Merges check-run and Copilot scorecards with source-attribution rules |
| `src/review/policy.ts` | Threshold policy engine — implements block/fix/approve logic |
| `src/review/types.ts` | TypeScript contracts: dimensions, scores, findings, risk levels |
| `src/review/check-run-scorecard.ts` | Derives scorecard from CI check-run signals |
| `.github/copilot-instructions.md` | Instructions for Copilot structured output format |
| `.github/workflows/ai-review-pr-gate.yml` | Main PR gate workflow — prepares scorecards and invokes gate |
| `.github/workflows/ai-review-gate.yml` | Reusable workflow that evaluates scorecard and optionally auto-approves |

## Workflow Trigger

The gate runs on:
- `pull_request` events: opened, synchronize, reopened, ready_for_review
- `workflow_dispatch` for manual re-evaluation

Required permissions: `contents: read`, `checks: read`, `pull-requests: write`.
