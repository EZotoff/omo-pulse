# AI Review Gate

## TL;DR

> **Quick Summary**: Add a machine-enforced AI review gate that evaluates a structured review scorecard across security, safety, performance, and feature quality, then turns that into one of three PR outcomes: block, request fixes, or auto-approve eligibility.
>
> **Deliverables**:
> - New `scripts/ai-review-gate.ts` Bun CLI for scorecard evaluation and GitHub Action output emission
> - New `src/review/policy.ts` module for score normalization, threshold policy, and decision derivation
> - New `src/review/types.ts` module defining the scorecard/result contract
> - New `src/__tests__/review-policy.test.ts` unit coverage for threshold and edge-case behavior
> - Updated `.github/workflows/ci.yml` to run the gate on pull requests behind an explicit enable flag using a required-status-check-first model
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — small sequential implementation is lower-risk than splitting a new policy surface
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
The user wants the automated code review stack extended so the project can run safely without constant human oversight. They want separate checks for cybersecurity vulnerabilities, safety issues, performance degradations, and added feature quality, with meaningful thresholds that block low-quality PRs, suggest fixes for average PRs, and auto-approve very high-scoring PRs.

### Research Summary
- The repository currently has only build/test CI in `.github/workflows/ci.yml`.
- There is no executable in-repo review engine, scoring model, PR gating logic, or approval automation.
- Existing automation context outside the repo already uses structured review findings (`CRITICAL/WARNING/INFO`) and capped remediation loops.
- GitHub safest integration model is a **required status check first**. Bot approvals can be additive, but should not replace a hard gate or weaken branch protection.

### Design Interpretation
Because the repo does not contain the reviewer itself, the smallest faithful implementation is a **policy gate** that consumes structured review output rather than inventing a full reviewer. This preserves the mechanism’s purpose: reduce human oversight safely by enforcing hard cutoffs and only allowing auto-approval for narrow, demonstrably low-risk cases.

---

## Work Objectives

### Core Objective
Implement an executable AI review gate that converts structured review evidence into deterministic PR policy decisions.

### Concrete Deliverables
- `src/review/types.ts`
  - `ReviewDimension`
  - `ReviewSeverity`
  - `ReviewFinding`
  - `ReviewScorecard`
  - `ReviewPolicyDecision`
  - `ReviewPolicyResult`
- `src/review/policy.ts`
  - `evaluateReviewScorecard(scorecard: ReviewScorecard): ReviewPolicyResult`
  - helper predicates/constants for score validation and threshold checks
- `scripts/ai-review-gate.ts`
  - Bun CLI that reads a trusted JSON scorecard file path from argv or env
  - validates input, evaluates policy, prints JSON result, and emits GitHub Action outputs/step summary when available
- `src/__tests__/review-policy.test.ts`
  - block/fix/auto-approve threshold coverage
  - hard-gate cases for security/safety
  - disallowed auto-approval for high-risk change classes
- `.github/workflows/ci.yml`
  - add opt-in `review_gate` job on PRs
  - keep merge enforcement on status checks, not branch-protection bypasses

### Definition of Done
- [ ] `bun run build` succeeds
- [ ] `bun run test` passes with new review-policy tests
- [ ] `bun run scripts/ai-review-gate.ts --input <scorecard.json>` returns deterministic policy JSON
- [ ] PR workflow runs the gate job on pull requests
- [ ] Gate fails on blocked PRs, stays pending/fails for fix-required PRs, and succeeds only for auto-approve-eligible PRs

### Must Have
- Separate dimensions: `security`, `safety`, `performance`, `featureQuality`
- Decision bands: `block`, `request_fixes`, `auto_approve`
- Hard per-dimension security/safety cutoffs; no aggregate-only gating
- Confidence-aware evaluation so low-confidence evidence cannot trigger auto-approval
- High-risk change classes that disable auto-approval even with high scores
- GitHub Action outputs that can be consumed by later approval/comment automation
- No new dependencies

### Must NOT Have
- NO fake AI reviewer implemented inside the app
- NO branch protection weakening or bypass logic
- NO aggregate-score-only policy
- NO automatic approval for high-risk change classes
- NO external service dependency or secret requirement for local evaluation
- NO changes to Vite config, SQLite logic, or dashboard app behavior

---

## Verification Strategy

### Acceptance Criteria
1. A valid scorecard with low security/safety score or critical finding returns `block`.
2. A middling scorecard returns `request_fixes`.
3. A high-scoring, low-risk, high-confidence scorecard returns `auto_approve`.
4. A high-scoring but high-risk scorecard does **not** return `auto_approve`.
5. GitHub workflow exits non-zero for `block` and `request_fixes`, zero only for `auto_approve`.
6. The gate never trusts a scorecard committed in the PR itself; trusted runtime input is required.

### Manual QA
- Run the gate CLI against three local fixture scorecards: blocked, average, high-quality.
- Show the resulting decision JSON and exit codes.

---

## Execution Strategy

### Task 1 — Add review contract types
- Create `src/review/types.ts`
- Define typed dimensions, findings, scorecard fields, risk classes, and result shape

### Task 2 — Implement deterministic policy engine
- Create `src/review/policy.ts`
- Enforce these thresholds:
  - `block` when any critical security/safety finding has medium/high confidence, or `security < 2.0`, or `safety < 2.0`
  - `request_fixes` when not blocked and any dimension is `< 4.5`, composite score is `< 4.7`, confidence is `< 4.0`, or risk class is not `low`
  - `auto_approve` only when not blocked, all dimensions `>= 4.5`, composite `>= 4.7`, confidence `>= 4.0`, risk class `low`, and `autoApproveAllowed` is true
- Include reasons array for auditability

### Task 3 — Add Bun CLI gate
- Create `scripts/ai-review-gate.ts`
- Read scorecard JSON from `--input <path>` or `AI_REVIEW_SCORECARD_PATH`
- Validate, evaluate, print normalized JSON result
- If `GITHUB_OUTPUT` is set, write outputs: `decision`, `summary`, `auto_approve`, `blocked`
- If `GITHUB_STEP_SUMMARY` is set, append a concise markdown summary
- Exit codes:
  - `0` for `auto_approve`
  - `1` for `request_fixes` or `block`
  - `2` for invalid input/runtime failure

### Task 4 — Add tests
- Create `src/__tests__/review-policy.test.ts`
- Cover threshold boundaries and high-risk override behavior

### Task 5 — Integrate workflow
- Update `.github/workflows/ci.yml`
- Add opt-in PR-only `review_gate` job after install/setup
- Accept scorecard input only from trusted runtime data such as a prior protected workflow step or environment injected by trusted automation
- Fail closed when trusted input is missing while the gate is enabled
- Keep permissions minimal unless later PR-review automation is explicitly added

---

## Notes

- This implementation intentionally stops at **policy enforcement**. It does not try to generate the AI review itself inside the repo.
- Optional bot approval can sit on top of the gate outputs, but the merge-critical mechanism should remain the required status check.
