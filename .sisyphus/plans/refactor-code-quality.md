# Refactor: Code Quality & Performance Audit

## TL;DR

> **Quick Summary**: Comprehensive project-wide refactoring addressing architecture issues (circular deps), code smells (duplicated code, empty catches, magic numbers), backend performance (N+1 queries, unbounded caches), React performance (missing memo, inline callbacks), and CSS consistency (hardcoded rgba → tokens). All changes behavior-preserving, TDD-driven.
> 
> **Deliverables**:
> - Circular dependency between `session.ts` ↔ `background-tasks.ts` broken
> - Critical N+1 query in `session-inclusion.ts` fixed (300+ queries → ≤4)
> - 6 duplicated utility functions consolidated to 2 shared files
> - `ProjectStripInner` (461 lines, 5 concerns) split into focused sub-components
> - `buildDashboardPayload` (194 lines, 6 concerns) split into sub-functions
> - ~23 empty catch blocks classified and fixed
> - ~40 hardcoded rgba values replaced with CSS custom properties
> - React `memo()` + `useCallback` applied where impactful
> - Unbounded caches capped, dead code removed, magic numbers named
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 6 waves + final verification
> **Critical Path**: Wave 0 (tests) → Wave 1 (foundation) → Wave 2 (arch+perf) → Wave 3 (splitting) → Wave 4 (cleanup) → Wave 5 (CSS) → Final

---

## Context

### Original Request
User triggered `/refactor` with scope=project, strategy=safe, target="code smells or potential performance issues". Subsequently chose: ALL 5 categories (Architecture, Code Smells, Backend Perf, React Perf, CSS), TDD strategy (Red-Green-Refactor), aggressive depth (full restructuring).

### Interview Summary
**Key Discussions**:
- **Scope**: All 5 audit categories included — no exclusions
- **Test Strategy**: TDD — characterization tests first, then refactor, verify tests pass
- **Depth**: Aggressive — full restructuring of offending modules, not surface-level tweaks
- **App.tsx / SettingsPanel.tsx**: Don't split these (long but single-concern), DO fix inline callbacks

**Research Findings**:
- 5 parallel explore agents audited the entire codebase (code smells, React perf, backend perf, architecture, CSS)
- Direct AST/grep scanning confirmed 0 TypeScript errors, 0 `@ts-ignore`, minimal `as any`
- 184 unit tests + 15 e2e tests exist, but 0% React component test coverage
- `buildDashboardPayloadFiles` (140 lines) has zero tests — high risk for refactoring

### Metis Review
**Identified Gaps** (all addressed in this plan):
- Wave 0 (characterization tests) is mandatory before any refactoring — added
- 3 additional N+1 patterns beyond the critical one — all included
- `memo()` must come AFTER component splitting and prop stability fixes — ordering enforced
- Empty catches must be classified (intentional vs accidental) before fixing — classification step added
- Batched `WHERE IN()` with empty array = SQL error — guard added to all N+1 fixes
- Status severity map inconsistency may be phantom — validated, dropped from scope
- Sync I/O → async conversion is too deep — excluded, flagged as future work

---

## Work Objectives

### Core Objective
Eliminate code smells, fix performance bottlenecks, resolve architectural issues, and standardize CSS across the omo-pulse dashboard — all while preserving identical runtime behavior, verified by TDD characterization tests.

### Concrete Deliverables
- 2 new shared utility files in `src/ingest/` (format-utils.ts, sqlite-utils.ts)
- 4-5 new sub-components extracted from `ProjectStripInner`
- N+1 queries batched with `WHERE session_id IN (...)`
- Circular dependency broken via `getMessageDir` extraction
- Missing CSS tokens defined in `tokens.css`
- ~40 hardcoded rgba values replaced with `var()` references

### Definition of Done
- [ ] `bun run test` — all tests pass (existing 184 + new characterization tests)
- [ ] `bunx tsc --noEmit` — 0 TypeScript errors
- [ ] `bunx playwright test` — all 15 e2e tests pass
- [ ] No duplicated function definitions remain for consolidated utils
- [ ] No circular dependencies between `session.ts` and `background-tasks.ts`
- [ ] All `var(--*)` references in component CSS have definitions in `tokens.css`

### Must Have
- Zero behavior changes — all refactoring is internal restructuring
- Every task verified with `bun run test && bunx tsc --noEmit`
- Characterization tests exist BEFORE any code is modified
- Identical function signatures preserved when extracting shared utils
- Entry points `buildDashboardPayload` and `buildDashboardPayloadFiles` remain intact (internal extraction only)
- `bun:sqlite` test mocks follow existing `createMockDb()` pattern from `session-inclusion.test.ts`

### Must NOT Have (Guardrails)
- **No new dependencies** (per AGENTS.md)
- **No error reporting infrastructure** — empty catches → `console.warn(context, error)` only
- **No component data flow redesign** — ProjectStripInner split is mechanical extraction only
- **No CSS design system** — pure value extraction to existing tokens.css
- **No new directory structure** — max 2 new files in existing directories, no `src/utils/` or `src/shared/`
- **No query caching/connection pooling** — N+1 fix = batch with `WHERE IN()` only
- **No sync→async I/O conversion** — too deep, out of scope (flag as future work)
- **No splitting of App.tsx or SettingsPanel.tsx** — long but single-concern, only fix callbacks
- **No new constants files** — magic numbers → co-located named constants unless shared across 2+ files
- **No AI slop** — no excessive comments, no over-abstraction, no generic variable names

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest 4.1.0 + Playwright 1.58.2)
- **Automated tests**: TDD (characterization test → refactor → verify test passes)
- **Framework**: `bun run test` (vitest), `bunx playwright test` (e2e)
- **TDD approach**: Each refactoring task writes/verifies characterization tests capturing current behavior, then refactors, then confirms tests still pass

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Ingest**: Use Bash — run test suite, grep for duplicates, verify import graphs
- **React Components**: Use Bash — run vitest, check TypeScript compilation, run e2e suite
- **CSS**: Use Bash — grep for undefined token references, run e2e for visual regression
- **Architecture**: Use Bash — grep for circular imports, verify public API unchanged

### Per-Task Gate (MANDATORY)
Every task must pass before marking complete:
```bash
bun run test          # All unit tests pass
bunx tsc --noEmit     # Zero TypeScript errors
```

### Per-Wave Gate (MANDATORY)
At the end of each wave, additionally:
```bash
bunx playwright test  # All 15 e2e tests pass
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Safety Net — characterization tests, MUST complete before any refactoring):
├── Task 1: Characterization tests for dashboard payload functions [deep]
├── Task 2: Characterization tests for session status derivation [deep]
└── Task 3: Characterization tests for background tasks + timeseries [deep]

Wave 1 (Foundation — shared infrastructure, after Wave 0):
├── Task 4: Extract shared formatting utils to src/ingest/format-utils.ts [quick]
├── Task 5: Extract shared SQLite utils to src/ingest/sqlite-utils.ts [quick]
├── Task 6: Consolidate PlanStep type + fix UnintiatedPlan typo [quick]
├── Task 7: Define missing CSS tokens + z-index token system [quick]
└── Task 8: Cache selectStorageBackend + listSources results [quick]

Wave 2 (Architecture & Critical Performance — after Wave 1):
├── Task 9: Break circular dependency session.ts ↔ background-tasks.ts [deep]
├── Task 10: Fix CRITICAL N+1 in session-inclusion.ts [deep]
├── Task 11: Fix N+1 in deriveBackgroundTasksSqlite [unspecified-high]
├── Task 12: Fix N+1 in deriveTimeSeriesActivitySqlite [unspecified-high]
└── Task 13: Cap unbounded caches (git-status, multi-project, sqlite-derive) [unspecified-high]

Wave 3 (Function & Component Splitting — after Wave 2):
├── Task 14: Split buildDashboardPayload into sub-functions [deep]
├── Task 15: Split buildDashboardPayloadFiles into sub-functions [deep]
├── Task 16: Split deriveBackgroundTasksSqlite + deriveBackgroundTasks [unspecified-high]
├── Task 17: Split ProjectStripInner into sub-components [visual-engineering]
└── Task 18: Consolidate status derivation logic [deep]

Wave 4 (Code Smells & React Performance — after Wave 3):
├── Task 19: Classify + fix 23 empty catch blocks [unspecified-high]
├── Task 20: Extract magic numbers to named constants [quick]
├── Task 21: Improve type safety — validate JSON.parse, remove unsafe casts [unspecified-high]
├── Task 22: Memoize inline callbacks with useCallback [quick]
├── Task 23: Add memo() to extracted sub-components + leaf components [quick]
└── Task 24: Remove dead code (dirty flag, unused utils, dead CSS rules) [quick]

Wave 5 (CSS Tokenization — after Wave 4):
├── Task 25: Replace hardcoded rgba in ProjectStrip.css + Sparkline.css [quick]
├── Task 26: Replace hardcoded rgba in SessionSwimlane + ProjectCard + OverlayShell [quick]
└── Task 27: Fix duplicated .session-dot rules + standardize z-index/spacing [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1-T3 → T4-T8 → T9-T13 → T14-T18 → T19-T24 → T25-T27 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1-3 | — | 4-27 | 0 |
| 4 | 1-3 | 14, 15, 16 | 1 |
| 5 | 1-3 | 9, 11, 12, 16 | 1 |
| 6 | 1-3 | — | 1 |
| 7 | 1-3 | 25, 26, 27 | 1 |
| 8 | 1-3 | — | 1 |
| 9 | 5 | 16 | 2 |
| 10 | 1-3 | — | 2 |
| 11 | 5 | — | 2 |
| 12 | 5 | — | 2 |
| 13 | 1-3 | — | 2 |
| 14 | 4 | — | 3 |
| 15 | 4 | — | 3 |
| 16 | 4, 5, 9 | — | 3 |
| 17 | 1-3 | 23 | 3 |
| 18 | 5 | — | 3 |
| 19 | 1-3 | — | 4 |
| 20 | 1-3 | — | 4 |
| 21 | 1-3 | — | 4 |
| 22 | 17 | 23 | 4 |
| 23 | 17, 22 | — | 4 |
| 24 | 1-3 | — | 4 |
| 25 | 7 | — | 5 |
| 26 | 7 | — | 5 |
| 27 | 7 | — | 5 |
| F1-F4 | 1-27 | — | Final |

### Agent Dispatch Summary

| Wave | Tasks | Categories |
|------|-------|-----------|
| 0 | 3 | T1-T3 → `deep` |
| 1 | 5 | T4-T6,T8 → `quick`, T7 → `quick` |
| 2 | 5 | T9-T10 → `deep`, T11-T13 → `unspecified-high` |
| 3 | 5 | T14-T15,T18 → `deep`, T16 → `unspecified-high`, T17 → `visual-engineering` |
| 4 | 6 | T19,T21 → `unspecified-high`, T20,T22-T24 → `quick` |
| 5 | 3 | T25-T27 → `quick` |
| Final | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### Wave 0 — Safety Net: Characterization Tests

- [x] 1. Characterization tests for dashboard payload functions

  **What to do**:
  - Write characterization tests for `buildDashboardPayload` (src/server/dashboard.ts:297) capturing its current output shape given known SQLite input
  - Write characterization tests for `buildDashboardPayloadFiles` (src/server/dashboard.ts:150) capturing its current output shape given known file-based input
  - Tests must exercise: happy path (sessions exist), empty state (no sessions), edge cases (stale sessions, unknown status)
  - Use `createMockDb()` pattern from existing `session-inclusion.test.ts` for SQLite mocks
  - Create test file: `src/__tests__/dashboard-payload.test.ts`
  - RED: write tests that call current functions → GREEN: verify they pass with current code → these become the safety net

  **Must NOT do**:
  - Do not modify any source code — tests only
  - Do not test internal helpers directly — test through the public `buildDashboardPayload` / `buildDashboardPayloadFiles` entry points
  - Do not add test utilities beyond what `session-inclusion.test.ts` already provides

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding complex data flow through 6+ ingest modules to construct realistic mock data
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not a UI task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 2, 3)
  - **Blocks**: All tasks in Waves 1-5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/__tests__/session-inclusion.test.ts` — Follow `createMockDb()` pattern for SQLite mocking. Look at how it constructs mock database responses and test structure.
  - `src/__tests__/status-rollup.test.ts` — Example of testing pure data transformation functions with known inputs/outputs.

  **API/Type References**:
  - `src/server/dashboard.ts:297` — `buildDashboardPayload(db, storageRoots, sessionIds, opts)` — the SQLite-based entry point to test
  - `src/server/dashboard.ts:150` — `buildDashboardPayloadFiles(storageRoots, sessionIds, opts)` — the file-based entry point to test
  - `src/types.ts:82` — `ProjectSnapshot` type — the output shape to assert against
  - `src/server/dashboard.ts:499` — `createDashboardStore` — shows how these functions are called in production

  **External References**: None

  **WHY Each Reference Matters**:
  - `session-inclusion.test.ts`: Provides the mocking pattern — don't reinvent, copy the approach
  - `dashboard.ts:297,150`: These are the exact functions under test — read their parameter types and return types to construct accurate mocks
  - `types.ts:82`: `ProjectSnapshot` defines what the output looks like — assert its shape

  **Acceptance Criteria**:

  - [ ] Test file created: `src/__tests__/dashboard-payload.test.ts`
  - [ ] `bun run test src/__tests__/dashboard-payload.test.ts` → PASS (≥6 tests covering both payload functions)
  - [ ] Tests cover: happy path, empty state, stale session handling
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Characterization tests pass with current code
    Tool: Bash
    Preconditions: No source code modified, only new test file created
    Steps:
      1. Run: bun run test src/__tests__/dashboard-payload.test.ts
      2. Assert: exit code 0
      3. Assert: output contains "Tests  X passed" where X ≥ 6
      4. Assert: output does NOT contain "fail"
    Expected Result: All characterization tests pass against current unmodified code
    Failure Indicators: Any test failure = mock data doesn't match actual function behavior
    Evidence: .sisyphus/evidence/task-1-characterization-tests.txt

  Scenario: No source files modified
    Tool: Bash
    Preconditions: Tests written
    Steps:
      1. Run: git diff --name-only src/server/ src/ingest/ src/ui/
      2. Assert: output is empty (no source files changed)
    Expected Result: Only test files are new/modified
    Evidence: .sisyphus/evidence/task-1-no-source-changes.txt
  ```

  **Commit**: YES (groups with Wave 0)
  - Message: `test(ingest): add characterization tests for dashboard payload functions`
  - Files: `src/__tests__/dashboard-payload.test.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 2. Characterization tests for session status derivation

  **What to do**:
  - Write characterization tests for `deriveSessionStatus` in `src/ingest/session-inclusion.ts` — test with known SQLite data, assert exact status output for each scenario (active, idle, stale, complete, unknown)
  - Write characterization tests for status logic in `src/ingest/session.ts` — file-based status derivation
  - Write characterization tests for `statusRollup` in `src/ingest/status-rollup.ts` if not already covered
  - Tests must capture the exact status derivation logic: what inputs → what status
  - Use `createMockDb()` pattern for SQLite variants
  - Create test file: `src/__tests__/session-status-derivation.test.ts`

  **Must NOT do**:
  - Do not modify any source code
  - Do not test UI rendering — backend status logic only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Status derivation has complex conditional logic (4-level if/else chains) requiring careful input construction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 1, 3)
  - **Blocks**: All tasks in Waves 1-5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/__tests__/session-inclusion.test.ts` — Primary test pattern reference. Follow its structure for `createMockDb()` and assertion style.
  - `src/__tests__/status-rollup.test.ts` — Existing tests for status rollup — read to understand current coverage and avoid duplication.

  **API/Type References**:
  - `src/ingest/session-inclusion.ts:150` — `findIncludedSessionsSqlite` which calls `deriveSessionStatus` per session — the N+1 source, but also the status derivation entry point
  - `src/ingest/session.ts:359-374` — 4-level if/else status derivation logic — the complex conditional to capture
  - `src/types.ts:16` — `SessionStatus` type — the 7-value union: `'active' | 'idle' | 'stale' | 'complete' | 'unknown' | ...`

  **WHY Each Reference Matters**:
  - `session-inclusion.ts:150`: This is where status derivation happens for SQLite path — the exact function to test
  - `session.ts:359-374`: The branching logic we're capturing — each branch must have a test case
  - `status-rollup.test.ts`: Check what's already covered to avoid duplication

  **Acceptance Criteria**:

  - [ ] Test file created: `src/__tests__/session-status-derivation.test.ts`
  - [ ] `bun run test src/__tests__/session-status-derivation.test.ts` → PASS (≥8 tests covering all status branches)
  - [ ] Each `SessionStatus` value has at least one test case producing it
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All SessionStatus values covered
    Tool: Bash
    Preconditions: Test file exists
    Steps:
      1. Run: bun run test src/__tests__/session-status-derivation.test.ts
      2. Assert: exit code 0
      3. Assert: output shows ≥8 passing tests
      4. Run: grep -c "active\|idle\|stale\|complete\|unknown" src/__tests__/session-status-derivation.test.ts
      5. Assert: count ≥ 5 (each status mentioned in at least one test)
    Expected Result: Every branch of status derivation is captured
    Failure Indicators: Missing status values in test assertions
    Evidence: .sisyphus/evidence/task-2-status-tests.txt

  Scenario: No source files modified
    Tool: Bash
    Preconditions: Tests written
    Steps:
      1. Run: git diff --name-only src/server/ src/ingest/ src/ui/
      2. Assert: output is empty
    Expected Result: Only test files created
    Evidence: .sisyphus/evidence/task-2-no-source-changes.txt
  ```

  **Commit**: YES (groups with Wave 0)
  - Message: `test(ingest): add characterization tests for session status derivation`
  - Files: `src/__tests__/session-status-derivation.test.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 3. Characterization tests for background tasks + timeseries derivation

  **What to do**:
  - Write characterization tests for `deriveBackgroundTasksSqlite` (src/ingest/background-tasks.ts, 181 lines) — capture input/output shape
  - Write characterization tests for `deriveBackgroundTasks` (src/ingest/background-tasks.ts, 179 lines) — file-based variant
  - Write characterization tests for `deriveTimeSeriesActivitySqlite` (src/ingest/sqlite-derive.ts, 110 lines)
  - Use `createMockDb()` pattern for SQLite variants
  - Create test file: `src/__tests__/background-tasks-derive.test.ts`

  **Must NOT do**:
  - Do not modify source code
  - Do not test UI — backend derivation only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Background task derivation has cascading queries and complex session linking that needs careful mock construction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (with Tasks 1, 2)
  - **Blocks**: All tasks in Waves 1-5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/__tests__/session-inclusion.test.ts` — `createMockDb()` pattern for SQLite mocking
  - `src/__tests__/background-tasks.test.ts` — Check if existing tests cover any of these functions (supplement, don't duplicate)

  **API/Type References**:
  - `src/ingest/background-tasks.ts:535-714` — `deriveBackgroundTasksSqlite` — the 181-line function under test
  - `src/ingest/background-tasks.ts` — `deriveBackgroundTasks` — file-based variant
  - `src/ingest/sqlite-derive.ts:779-829` — `deriveTimeSeriesActivitySqlite` — timeseries derivation
  - `src/types.ts` — `BackgroundTask`, `TimeSeriesPoint` types for output shape assertion

  **WHY Each Reference Matters**:
  - `background-tasks.ts:535-714`: The exact functions to test — read parameter types and return types
  - `sqlite-derive.ts:779-829`: Timeseries function that will be refactored for N+1 — must have safety net

  **Acceptance Criteria**:

  - [ ] Test file created: `src/__tests__/background-tasks-derive.test.ts`
  - [ ] `bun run test src/__tests__/background-tasks-derive.test.ts` → PASS (≥6 tests)
  - [ ] Both SQLite and file-based variants covered
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Background task derivation tests pass
    Tool: Bash
    Preconditions: No source code modified
    Steps:
      1. Run: bun run test src/__tests__/background-tasks-derive.test.ts
      2. Assert: exit code 0
      3. Assert: ≥6 tests passing
    Expected Result: Characterization tests capture current behavior
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-bg-tasks-tests.txt

  Scenario: No source files modified
    Tool: Bash
    Steps:
      1. Run: git diff --name-only src/server/ src/ingest/ src/ui/
      2. Assert: output is empty
    Expected Result: Only test files created
    Evidence: .sisyphus/evidence/task-3-no-source-changes.txt
  ```

  **Commit**: YES (groups with Wave 0)
  - Message: `test(ingest): add characterization tests for background tasks and timeseries`
  - Files: `src/__tests__/background-tasks-derive.test.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

### Wave 1 — Foundation: Shared Infrastructure

- [x] 4. Extract shared formatting utils to `src/ingest/format-utils.ts`

  **What to do**:
  - Create `src/ingest/format-utils.ts` with consolidated copies of:
    - `formatTimeline` — duplicated in `dashboard.ts:154`, `sqlite-derive.ts:177`, `background-tasks.ts:353`
    - `formatElapsed` — duplicated in `dashboard.ts` (2 copies)
    - `canonicalizeAgent` — duplicated in 2 files
    - `normalizeSessionIds` — duplicated in 2 files
  - Update ALL original files to import from `src/ingest/format-utils.ts` instead of their local copies
  - Delete the local copies from each file
  - Function signatures must remain IDENTICAL — same params, same return type, same behavior
  - Write tests in `src/__tests__/format-utils.test.ts` capturing each function's behavior

  **Must NOT do**:
  - Do not change function signatures
  - Do not "improve" the functions while extracting — pure mechanical move
  - Do not create `src/utils/` or `src/shared/` directories

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical code movement with known source and destination — no complex decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Tasks 14, 15, 16
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/server/dashboard.ts:154` — `formatTimeline` copy 1 — this is the canonical version to extract
  - `src/ingest/sqlite-derive.ts:177` — `formatTimeline` copy 2 — verify identical to copy 1
  - `src/ingest/background-tasks.ts:353` — `formatTimeline` copy 3 — verify identical to copy 1
  - `src/server/dashboard.ts` — `formatElapsed` copies — find both with `grep -n "function formatElapsed"`
  - `src/__tests__/nan-timestamp.test.ts` — Tests `formatRelativeTime` which may be in same scope — check if any format functions are tested here and update import path

  **API/Type References**:
  - Each function's parameter and return types — preserve exactly

  **WHY Each Reference Matters**:
  - Must verify all copies are truly identical before consolidating — if they differ, choose the most complete version and verify tests pass
  - `nan-timestamp.test.ts` may import from a file being modified — update its import path

  **Acceptance Criteria**:

  - [ ] `src/ingest/format-utils.ts` exists with all 4+ functions
  - [ ] `grep -rn "function formatTimeline" src/` → exactly 1 result (in format-utils.ts)
  - [ ] `grep -rn "function formatElapsed" src/` → exactly 1 result (in format-utils.ts)
  - [ ] `grep -rn "function canonicalizeAgent" src/` → exactly 1 result (in format-utils.ts)
  - [ ] `grep -rn "function normalizeSessionIds" src/` → exactly 1 result (in format-utils.ts)
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No duplicate function definitions remain
    Tool: Bash
    Steps:
      1. Run: grep -rn "function formatTimeline" src/
      2. Assert: exactly 1 line, in src/ingest/format-utils.ts
      3. Run: grep -rn "function formatElapsed" src/
      4. Assert: exactly 1 line, in src/ingest/format-utils.ts
      5. Run: grep -rn "function canonicalizeAgent" src/
      6. Assert: exactly 1 line, in src/ingest/format-utils.ts
    Expected Result: All duplicates eliminated, single source of truth
    Failure Indicators: More than 1 grep result for any function
    Evidence: .sisyphus/evidence/task-4-dedup-verify.txt

  Scenario: All tests still pass after extraction
    Tool: Bash
    Steps:
      1. Run: bun run test
      2. Assert: exit code 0, all tests pass
      3. Run: bunx tsc --noEmit
      4. Assert: exit code 0
    Expected Result: Zero behavior change
    Evidence: .sisyphus/evidence/task-4-tests-pass.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(ingest): extract shared formatting utils to format-utils.ts`
  - Files: `src/ingest/format-utils.ts`, `src/server/dashboard.ts`, `src/ingest/sqlite-derive.ts`, `src/ingest/background-tasks.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 5. Extract shared SQLite utils to `src/ingest/sqlite-utils.ts`

  **What to do**:
  - Create `src/ingest/sqlite-utils.ts` with consolidated copies of:
    - `classifySqliteError` — duplicated in `storage-backend.ts:34` and `per-session-timeseries.ts:12`
    - `findBackgroundSessionId` / `findTaskSessionId` — duplicated in `sqlite-derive.ts` and `background-tasks.ts`
  - Update ALL original files to import from `src/ingest/sqlite-utils.ts`
  - Delete the local copies
  - Function signatures must remain IDENTICAL
  - Write tests in `src/__tests__/sqlite-utils.test.ts`

  **Must NOT do**:
  - Do not change function signatures
  - Do not add query caching or connection pooling
  - Do not create `src/utils/` directory

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical code movement
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 4, 6, 7, 8)
  - **Blocks**: Tasks 9, 11, 12, 16, 18
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/ingest/storage-backend.ts:34` — `classifySqliteError` copy 1
  - `src/ingest/per-session-timeseries.ts:12` — `classifySqliteError` copy 2
  - `src/ingest/sqlite-derive.ts` — `findBackgroundSessionId` / `findTaskSessionId` — use `grep -n` to locate
  - `src/ingest/background-tasks.ts` — duplicated find functions — use `grep -n` to locate

  **API/Type References**:
  - `src/ingest/storage-backend.ts:22` — `StorageBackend` union type — these utils operate on SQLite databases

  **WHY Each Reference Matters**:
  - Verify copies are identical before consolidating
  - `storage-backend.ts` has the canonical `classifySqliteError` — prefer this version

  **Acceptance Criteria**:

  - [ ] `src/ingest/sqlite-utils.ts` exists
  - [ ] `grep -rn "function classifySqliteError" src/` → exactly 1 result
  - [ ] `grep -rn "function findBackgroundSessionId" src/` → exactly 1 result
  - [ ] `grep -rn "function findTaskSessionId" src/` → exactly 1 result
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No duplicate SQLite util definitions remain
    Tool: Bash
    Steps:
      1. Run: grep -rn "function classifySqliteError" src/
      2. Assert: exactly 1 result in src/ingest/sqlite-utils.ts
      3. Run: grep -rn "function findBackgroundSessionId" src/
      4. Assert: exactly 1 result in src/ingest/sqlite-utils.ts
    Expected Result: Single source of truth for all SQLite utils
    Evidence: .sisyphus/evidence/task-5-dedup-verify.txt

  Scenario: All tests pass after extraction
    Tool: Bash
    Steps:
      1. Run: bun run test && bunx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: Zero behavior change
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(ingest): extract shared SQLite utils to sqlite-utils.ts`
  - Files: `src/ingest/sqlite-utils.ts`, `src/ingest/storage-backend.ts`, `src/ingest/per-session-timeseries.ts`, `src/ingest/sqlite-derive.ts`, `src/ingest/background-tasks.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 6. Consolidate PlanStep type + fix UnintiatedPlan typo codebase-wide

  **What to do**:
  - `PlanStep` is defined in both `src/types.ts` and `src/ingest/boulder.ts:17` — consolidate to `src/types.ts` only
  - Update `boulder.ts` to import `PlanStep` from `~/types` instead of defining locally
  - Verify no circular dependency is introduced (boulder → types → ??? → boulder)
  - Fix `UnintiatedPlan` typo → `UninitiatedPlan` across the entire codebase (use `lsp_rename` or find-replace)
  - Write test verifying `PlanStep` import path is canonical

  **Must NOT do**:
  - Do not change `PlanStep` shape or fields
  - Do not introduce circular dependency

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple type consolidation + typo fix — minimal complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 4, 5, 7, 8)
  - **Blocks**: None directly
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/types.ts` — Primary type definitions file — `PlanStep` should live here
  - `src/ingest/boulder.ts:17` — Local `PlanStep` definition to remove

  **API/Type References**:
  - Use `lsp_find_references` on `PlanStep` in both locations to map all consumers
  - Use `grep -rn "UnintiatedPlan" src/` to find all typo occurrences

  **WHY Each Reference Matters**:
  - `types.ts` is the canonical type file per AGENTS.md — all types should live there
  - `boulder.ts:17` is the duplicate to remove
  - Must check ALL importers to ensure they switch to `~/types` import

  **Acceptance Criteria**:

  - [ ] `grep -rn "interface PlanStep\|type PlanStep" src/` → exactly 1 result in `src/types.ts`
  - [ ] `grep -rn "UnintiatedPlan" src/` → 0 results (all fixed to `UninitiatedPlan`)
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: PlanStep consolidated and typo fixed
    Tool: Bash
    Steps:
      1. Run: grep -rn "interface PlanStep\|type PlanStep" src/
      2. Assert: exactly 1 result, in src/types.ts
      3. Run: grep -rn "UnintiatedPlan" src/
      4. Assert: 0 results
      5. Run: grep -rn "UninitiatedPlan" src/
      6. Assert: ≥1 result (the corrected spelling exists)
    Expected Result: Single PlanStep definition, typo fixed everywhere
    Evidence: .sisyphus/evidence/task-6-planstep-verify.txt

  Scenario: No circular dependency introduced
    Tool: Bash
    Steps:
      1. Run: bunx tsc --noEmit
      2. Assert: exit code 0 (TypeScript would catch circular type deps)
      3. Run: grep "from.*boulder" src/types.ts
      4. Assert: 0 results (types.ts must not import from boulder)
    Expected Result: Clean dependency direction: boulder → types (not bidirectional)
    Evidence: .sisyphus/evidence/task-6-no-circular.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(types): consolidate PlanStep to types.ts, fix UnintiatedPlan typo`
  - Files: `src/types.ts`, `src/ingest/boulder.ts`, any files with typo
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 7. Define missing CSS tokens + z-index token system

  **What to do**:
  - Check if `--border-subtle` and `--accent-primary-alpha` have `var()` fallbacks in `ProjectManagementPanel.css` — if yes, they're optional; if no, they're bugs
  - Define missing tokens in `src/styles/tokens.css` with values matching current visual appearance
  - Create z-index tokens in `tokens.css`: `--z-overlay: 900`, `--z-overlay-above: 901`, `--z-dropdown: 10`, `--z-sticky: 6`, `--z-raised: 5` (matching current arbitrary values)
  - Create spacing tokens for commonly hardcoded values if not already present
  - Do NOT replace usages yet (that's Wave 5) — only define the tokens

  **Must NOT do**:
  - Do not replace hardcoded values in component CSS files (that's Tasks 25-27)
  - Do not redesign the token system — add to existing `tokens.css`
  - Do not create new CSS files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding CSS custom property definitions — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 4, 5, 6, 8)
  - **Blocks**: Tasks 25, 26, 27
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/styles/tokens.css` — Existing token definitions — follow naming pattern
  - `src/ui/components/ProjectManagementPanel.css` — References `--border-subtle` and `--accent-primary-alpha` — check for `var()` fallbacks

  **API/Type References**:
  - Grep all z-index values: `grep -rn "z-index" src/ui/components/*.css` — extract current arbitrary values
  - Grep all hardcoded rgba: `grep -rn "rgba(" src/ui/components/*.css` — these will become token values

  **WHY Each Reference Matters**:
  - `tokens.css` is the canonical token file — all new tokens go here
  - `ProjectManagementPanel.css` has the missing token references — validate before defining

  **Acceptance Criteria**:

  - [ ] `--border-subtle` defined in `tokens.css` (or confirmed optional with fallback)
  - [ ] `--accent-primary-alpha` defined in `tokens.css` (or confirmed optional with fallback)
  - [ ] Z-index tokens defined: `--z-overlay`, `--z-overlay-above`, `--z-dropdown`, `--z-sticky`, `--z-raised`
  - [ ] `bunx tsc --noEmit` → 0 errors
  - [ ] `bunx playwright test` → all e2e pass (no visual regression)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All missing tokens defined
    Tool: Bash
    Steps:
      1. Run: grep "z-overlay\|z-overlay-above\|z-dropdown\|z-sticky\|z-raised" src/styles/tokens.css
      2. Assert: all 5 z-index tokens found
      3. Run: grep "border-subtle\|accent-primary-alpha" src/styles/tokens.css
      4. Assert: both tokens found (or documented as optional with fallback)
    Expected Result: All tokens needed for Wave 5 replacement are defined
    Evidence: .sisyphus/evidence/task-7-tokens-defined.txt

  Scenario: E2e tests pass (no visual regression)
    Tool: Bash
    Steps:
      1. Run: bunx playwright test
      2. Assert: exit code 0, all 15 tests pass
    Expected Result: Token definitions don't break existing styles
    Evidence: .sisyphus/evidence/task-7-e2e-pass.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `style(tokens): define missing CSS tokens for z-index and color`
  - Files: `src/styles/tokens.css`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 8. Cache `selectStorageBackend` + `listSources` results

  **What to do**:
  - `selectStorageBackend()` in `src/ingest/storage-backend.ts` opens/closes SQLite on every poll cycle just to check if storage exists — add TTL-based caching (cache result for 30s, matching poll interval)
  - `listSources()` re-reads `sources.json` from disk on every API call — add simple in-memory cache with file mtime check
  - Remove or connect the dead `dirty` flag in `src/server/dashboard.ts:526-543` — it's set but never read
  - Cache implementation: simple `let cachedResult + let cachedAt + const TTL_MS` pattern — no external dependencies

  **Must NOT do**:
  - Do not add caching libraries
  - Do not change public function signatures
  - Do not add connection pooling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple caching pattern with known implementation — minimal complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 4, 5, 6, 7)
  - **Blocks**: None directly
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/ingest/storage-backend.ts:417` — `selectStorageBackend()` function — add caching here
  - `src/ingest/sources-registry.ts` — `listSources()` function — add file mtime cache here
  - `src/server/dashboard.ts:526-543` — Dead `dirty` flag — remove or connect

  **API/Type References**:
  - `selectStorageBackend` return type: `StorageBackend` (discriminated union with `kind: 'sqlite' | 'files'`)
  - Current poll interval: check `useDashboardData.ts` for the polling period used

  **WHY Each Reference Matters**:
  - `storage-backend.ts:417`: This function is called on every poll — caching saves an SQLite open/close per cycle
  - `sources-registry.ts`: Re-reading JSON per API call is wasteful — mtime check is cheap
  - `dashboard.ts:526-543`: Dead code — the `dirty` flag is set but never read

  **Acceptance Criteria**:

  - [ ] `selectStorageBackend` caches result for ≥10s
  - [ ] `listSources` caches with file mtime invalidation
  - [ ] Dead `dirty` flag removed or connected
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Caching reduces redundant operations
    Tool: Bash
    Steps:
      1. Run: bun run test
      2. Assert: all tests pass (caching doesn't break behavior)
      3. Run: bunx tsc --noEmit
      4. Assert: 0 errors
    Expected Result: Cache implementation is type-safe and behavior-preserving
    Evidence: .sisyphus/evidence/task-8-cache-tests.txt

  Scenario: Dead dirty flag removed
    Tool: Bash
    Steps:
      1. Run: grep -n "dirty" src/server/dashboard.ts
      2. Assert: 0 results (flag removed) OR results show flag is now connected to invalidation logic
    Expected Result: No dead code remains
    Evidence: .sisyphus/evidence/task-8-dirty-flag.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `perf(ingest): cache selectStorageBackend and listSources, remove dead dirty flag`
  - Files: `src/ingest/storage-backend.ts`, `src/ingest/sources-registry.ts`, `src/server/dashboard.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

### Wave 2 — Architecture & Critical Performance

- [x] 9. Break circular dependency `session.ts` ↔ `background-tasks.ts`

  **What to do**:
  - Current cycle: `session.ts` imports `deriveBackgroundTasks` (value) from `background-tasks.ts`, and `background-tasks.ts` imports `getMessageDir` + 4 types from `session.ts`
  - Extract `getMessageDir` from `session.ts` to `src/ingest/paths.ts` (which already exists for path utilities)
  - Re-export `getMessageDir` from `session.ts` for backwards compatibility: `export { getMessageDir } from './paths'`
  - Update `background-tasks.ts` to import `getMessageDir` from `paths.ts` instead of `session.ts`
  - Verify the cycle is broken: `background-tasks.ts` should only import TYPES from `session.ts` (type-only imports don't create runtime cycles)
  - All public exports of `session.ts` must remain importable — no API changes

  **Must NOT do**:
  - Do not change the public API of either module
  - Do not move types — only move the `getMessageDir` value export
  - Do not restructure beyond the minimal fix needed to break the cycle

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Circular dependency resolution requires careful import graph analysis and backwards-compatible re-exports
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 10, 11, 12, 13)
  - **Blocks**: Task 16
  - **Blocked By**: Task 5 (shared SQLite utils extracted)

  **References**:

  **Pattern References**:
  - `src/ingest/session.ts` — Find `getMessageDir` with `grep -n "function getMessageDir\|export.*getMessageDir"` — this is what moves to `paths.ts`
  - `src/ingest/paths.ts` — Existing path utilities — `getMessageDir` belongs here thematically
  - `src/ingest/background-tasks.ts` — `grep -n "from.*session" src/ingest/background-tasks.ts` — these imports need updating

  **API/Type References**:
  - Use `lsp_find_references` on `getMessageDir` to map ALL callers across the codebase
  - `src/ingest/session.ts` full export list — all must remain importable after the change

  **WHY Each Reference Matters**:
  - `session.ts` exports must be preserved — use re-export to maintain backwards compatibility
  - `paths.ts` is the natural home for `getMessageDir` — it resolves file paths
  - ALL callers must be checked — some may import from `session.ts`, they should keep working via re-export

  **Acceptance Criteria**:

  - [ ] `getMessageDir` defined in `src/ingest/paths.ts`
  - [ ] `src/ingest/session.ts` re-exports `getMessageDir` from `paths.ts`
  - [ ] `grep "from.*background-tasks" src/ingest/session.ts | grep -v "import type"` → 0 value imports remaining
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Circular dependency broken
    Tool: Bash
    Steps:
      1. Run: grep "from.*background-tasks" src/ingest/session.ts
      2. If results exist, verify they are ALL "import type" (type-only, no runtime cycle)
      3. Run: grep "from.*session" src/ingest/background-tasks.ts | grep -v "import type"
      4. Verify value imports now come from paths.ts, not session.ts, OR session.ts value imports are eliminated
    Expected Result: No runtime circular dependency exists
    Evidence: .sisyphus/evidence/task-9-circular-dep.txt

  Scenario: All tests pass, public API unchanged
    Tool: Bash
    Steps:
      1. Run: bun run test && bunx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: Backwards-compatible change
    Evidence: .sisyphus/evidence/task-9-tests-pass.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(ingest): break circular dep by extracting getMessageDir to paths.ts`
  - Files: `src/ingest/session.ts`, `src/ingest/paths.ts`, `src/ingest/background-tasks.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 10. Fix CRITICAL N+1 in `session-inclusion.ts`

  **What to do**:
  - Current: `findIncludedSessionsSqlite` (line ~150) calls `deriveSessionStatus` per session row, issuing 3 SQLite queries each → 300+ queries for 100 sessions
  - Refactor to batch: collect all session IDs first, then run 3 bulk queries with `WHERE session_id IN (...)`, then assemble results
  - CRITICAL: Handle `sessionIds.length === 0` — `WHERE IN ()` with empty list is a SQL syntax error → return early with empty array
  - The batched queries must return IDENTICAL data structures to what per-session queries returned
  - Write TDD test: RED (test asserting batch behavior with mock data) → GREEN (implement batch) → verify characterization tests still pass
  - Use `createMockDb()` pattern from existing `session-inclusion.test.ts`

  **Must NOT do**:
  - Do not add query caching or connection pooling
  - Do not change the return type of `findIncludedSessionsSqlite`
  - Do not create query builder abstractions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: N+1 → batch query refactoring requires understanding 3 sub-queries and their data assembly, plus SQL edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 11, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-3 (Wave 0 — characterization tests must exist)

  **References**:

  **Pattern References**:
  - `src/ingest/session-inclusion.ts:150` — `findIncludedSessionsSqlite` — the N+1 source. Read the full function to understand what 3 queries `deriveSessionStatus` makes per session.
  - `src/__tests__/session-inclusion.test.ts` — Existing tests + `createMockDb()` pattern. Build on these tests, don't replace them.
  - `src/ingest/storage-backend.ts:50` — `withReadonlyDb` wrapper — keep using this for the batched queries

  **API/Type References**:
  - `src/ingest/session-inclusion.ts` — `deriveSessionStatus` function signature and return type — the function being batched
  - Return type of `findIncludedSessionsSqlite` — must remain unchanged

  **WHY Each Reference Matters**:
  - `session-inclusion.ts:150`: Must understand the 3 sub-queries to batch them correctly
  - `session-inclusion.test.ts`: Existing tests are the safety net — they must keep passing
  - `withReadonlyDb`: Keep using the existing pattern for database access

  **Acceptance Criteria**:

  - [ ] `findIncludedSessionsSqlite` makes ≤4 total queries regardless of session count
  - [ ] Return type unchanged — callers need no modifications
  - [ ] Handles `sessionIds.length === 0` gracefully (returns empty, no SQL error)
  - [ ] `bun run test src/__tests__/session-inclusion.test.ts` → PASS (existing + new tests)
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: N+1 eliminated — batch queries work correctly
    Tool: Bash
    Steps:
      1. Run: bun run test src/__tests__/session-inclusion.test.ts
      2. Assert: all tests pass including new batch query tests
      3. Assert: test covers empty sessionIds array case
    Expected Result: Batch query returns identical results to per-session queries
    Failure Indicators: Test failure = data structure mismatch between batch and per-session
    Evidence: .sisyphus/evidence/task-10-n+1-fix.txt

  Scenario: Empty sessionIds handled gracefully
    Tool: Bash
    Steps:
      1. Verify test exists that calls with empty array
      2. Run: bun run test src/__tests__/session-inclusion.test.ts --reporter=verbose
      3. Assert: test name containing "empty" passes
    Expected Result: No SQL error on empty input
    Evidence: .sisyphus/evidence/task-10-empty-guard.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `perf(ingest): batch N+1 queries in findIncludedSessionsSqlite`
  - Files: `src/ingest/session-inclusion.ts`, `src/__tests__/session-inclusion.test.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 11. Fix N+1 in `deriveBackgroundTasksSqlite`

  **What to do**:
  - `deriveBackgroundTasksSqlite` (src/ingest/background-tasks.ts:535-714, 181 lines) has cascading queries — multiple queries per background task session
  - Also fix the `ForSessions` wrapper variants in `sqlite-derive.ts` (`deriveTodosSqliteForSessions`, `deriveTokenUsageSqliteForSessions`) that issue per-session queries
  - Batch with `WHERE session_id IN (...)` — same pattern as Task 10
  - CRITICAL: Handle empty sessionIds array
  - Verify characterization tests from Task 3 still pass

  **Must NOT do**:
  - Do not change return types
  - Do not add query caching

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple N+1 patterns across two files — needs systematic approach but less architectural complexity than Task 10
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 10, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Task 5 (shared SQLite utils)

  **References**:

  **Pattern References**:
  - `src/ingest/background-tasks.ts:535-714` — `deriveBackgroundTasksSqlite` — locate per-session queries with `grep -n "query\|prepare\|all(" src/ingest/background-tasks.ts`
  - `src/ingest/sqlite-derive.ts` — `deriveTodosSqliteForSessions`, `deriveTokenUsageSqliteForSessions` — locate with grep
  - Task 10's batch pattern — follow the same `WHERE IN()` approach

  **API/Type References**:
  - Return types of all modified functions — preserve exactly

  **WHY Each Reference Matters**:
  - `background-tasks.ts:535-714`: The primary N+1 source — understand what queries cascade
  - `sqlite-derive.ts` ForSessions functions: Secondary N+1 patterns that compound with the primary

  **Acceptance Criteria**:

  - [ ] `deriveBackgroundTasksSqlite` batches queries — no per-session loop
  - [ ] `ForSessions` wrappers batch with `WHERE IN()`
  - [ ] Empty array guard present in all batched functions
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: N+1 patterns eliminated
    Tool: Bash
    Steps:
      1. Run: bun run test
      2. Assert: all tests pass
      3. Run: bunx tsc --noEmit
      4. Assert: 0 errors
    Expected Result: Batch queries work correctly
    Evidence: .sisyphus/evidence/task-11-batch-queries.txt

  Scenario: Empty array guard exists
    Tool: Bash
    Steps:
      1. Run: grep -A2 "length === 0\|\.length < 1\|!.*\.length" src/ingest/background-tasks.ts src/ingest/sqlite-derive.ts
      2. Assert: guard clauses present before WHERE IN() queries
    Expected Result: SQL error prevented on empty input
    Evidence: .sisyphus/evidence/task-11-empty-guard.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `perf(ingest): batch N+1 queries in background tasks and sqlite-derive`
  - Files: `src/ingest/background-tasks.ts`, `src/ingest/sqlite-derive.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 12. Fix N+1 in `deriveTimeSeriesActivitySqlite`

  **What to do**:
  - `deriveTimeSeriesActivitySqlite` (src/ingest/sqlite-derive.ts:779-829, ~50 lines) issues 2 queries per child session
  - Also fix `per-session-timeseries.ts:70-84` which does full table scan then JS filter (should use WHERE clause)
  - Batch with `WHERE session_id IN (...)`
  - Handle empty sessionIds array
  - Verify characterization tests from Task 3 still pass

  **Must NOT do**:
  - Do not change return types
  - Do not restructure the timeseries module

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Query optimization with clear pattern — systematic but not architecturally complex
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 10, 11, 13)
  - **Blocks**: None
  - **Blocked By**: Task 5 (shared SQLite utils)

  **References**:

  **Pattern References**:
  - `src/ingest/sqlite-derive.ts:779-829` — `deriveTimeSeriesActivitySqlite` — per-child-session queries
  - `src/ingest/per-session-timeseries.ts:70-84` — Full table scan with JS filter — add WHERE clause
  - Task 10's batch pattern

  **API/Type References**:
  - Return types of both functions — preserve exactly

  **Acceptance Criteria**:

  - [ ] `deriveTimeSeriesActivitySqlite` batches child session queries
  - [ ] `per-session-timeseries.ts` uses SQL WHERE clause instead of full scan + JS filter
  - [ ] Empty array guard present
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Queries batched successfully
    Tool: Bash
    Steps:
      1. Run: bun run test
      2. Assert: all tests pass
      3. Run: bunx tsc --noEmit
      4. Assert: 0 errors
    Expected Result: Behavior preserved with fewer queries
    Evidence: .sisyphus/evidence/task-12-timeseries-batch.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `perf(ingest): batch timeseries queries, add WHERE clause to per-session-timeseries`
  - Files: `src/ingest/sqlite-derive.ts`, `src/ingest/per-session-timeseries.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 13. Cap unbounded caches (git-status, multi-project, sqlite-derive)

  **What to do**:
  - `src/ingest/sqlite-derive.ts:881-904` — Unbounded message accumulation (can grow to 50K+ objects) — add size cap with LRU-like eviction (keep most recent N entries, e.g., N=5000)
  - `src/server/multi-project.ts` — Unbounded session caches in DashboardStore — add TTL-based eviction or max-size cap
  - `src/ingest/git-status.ts` — Unbounded git-status cache — add max-size cap
  - Fix dangling `setTimeout` in `git-status.ts` (line ~end) — ensure cleanup on shutdown
  - Implementation: simple `Map` with size check + delete oldest, or `Map` with TTL. No external libraries.

  **Must NOT do**:
  - Do not add caching libraries (LRU-cache, etc.)
  - Do not change cache access patterns — only add eviction

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple cache locations to fix with consistent approach — needs careful bounds analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/ingest/sqlite-derive.ts:881-904` — Message accumulation — find with `grep -n "Map\|cache\|accumulate" src/ingest/sqlite-derive.ts`
  - `src/server/multi-project.ts` — `DashboardStore` session cache — find with `grep -n "Map\|cache\|store" src/server/multi-project.ts`
  - `src/ingest/git-status.ts` — Git status cache + dangling setTimeout

  **API/Type References**:
  - Cache access patterns (get/set) — preserve same interface, just add eviction

  **Acceptance Criteria**:

  - [ ] All caches have explicit size caps or TTL eviction
  - [ ] No `setTimeout` leak in `git-status.ts`
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cache bounds enforced
    Tool: Bash
    Steps:
      1. Run: grep -n "MAX_\|maxSize\|MAX_SIZE\|cap\|evict\|delete.*oldest" src/ingest/sqlite-derive.ts src/server/multi-project.ts src/ingest/git-status.ts
      2. Assert: each file has a cap/eviction mechanism
      3. Run: bun run test && bunx tsc --noEmit
      4. Assert: all pass
    Expected Result: Unbounded growth prevented in all 3 caches
    Evidence: .sisyphus/evidence/task-13-cache-caps.txt

  Scenario: setTimeout cleanup exists
    Tool: Bash
    Steps:
      1. Run: grep -n "clearTimeout\|clearInterval" src/ingest/git-status.ts
      2. Assert: cleanup exists for any setTimeout/setInterval
    Expected Result: No dangling timers
    Evidence: .sisyphus/evidence/task-13-timer-cleanup.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `perf(ingest): cap unbounded caches, fix dangling setTimeout`
  - Files: `src/ingest/sqlite-derive.ts`, `src/server/multi-project.ts`, `src/ingest/git-status.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

### Wave 3 — Function & Component Splitting

- [x] 14. Split `buildDashboardPayload` into sub-functions

  **What to do**:
  - `buildDashboardPayload` (src/server/dashboard.ts:297, 194 lines) mixes 6 concerns: session data, background tasks, timeseries, token usage, todos, plan/boulder data
  - Extract each concern into a named sub-function within the same file (e.g., `deriveSessionPayload`, `deriveTimeSeriesPayload`, etc.)
  - The top-level `buildDashboardPayload` function MUST remain as the entry point — it calls the sub-functions and assembles the result
  - No signature change to `buildDashboardPayload` — callers need no modification
  - Each sub-function should be ≤50 lines
  - Verify characterization tests from Task 1 still pass

  **Must NOT do**:
  - Do not change `buildDashboardPayload` signature or return type
  - Do not move sub-functions to separate files — keep in `dashboard.ts`
  - Do not redesign the data flow — pure mechanical extraction

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 194-line function with 6 interleaved concerns requires careful extraction boundaries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 17, 18)
  - **Blocks**: None
  - **Blocked By**: Task 4 (format utils extracted)

  **References**:

  **Pattern References**:
  - `src/server/dashboard.ts:297` — `buildDashboardPayload` — read the full 194 lines to identify the 6 concern boundaries
  - `src/__tests__/dashboard-payload.test.ts` — Characterization tests from Task 1 — these must keep passing

  **API/Type References**:
  - `src/server/dashboard.ts:499` — `createDashboardStore` calls `buildDashboardPayload` — this caller must not change
  - Return type shape — must remain identical

  **WHY Each Reference Matters**:
  - `dashboard.ts:297`: Must read the full function to identify natural extraction boundaries between concerns
  - `dashboard-payload.test.ts`: Safety net — run after every extraction step

  **Acceptance Criteria**:

  - [ ] `buildDashboardPayload` ≤40 lines (orchestrator that calls sub-functions)
  - [ ] Each sub-function ≤50 lines
  - [ ] `buildDashboardPayload` signature unchanged
  - [ ] `bun run test src/__tests__/dashboard-payload.test.ts` → PASS
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Function split preserves behavior
    Tool: Bash
    Steps:
      1. Run: bun run test src/__tests__/dashboard-payload.test.ts
      2. Assert: all characterization tests pass
      3. Run: grep -c "function " src/server/dashboard.ts
      4. Assert: more functions than before (sub-functions created)
    Expected Result: Same behavior, cleaner structure
    Evidence: .sisyphus/evidence/task-14-dashboard-split.txt

  Scenario: No caller changes needed
    Tool: Bash
    Steps:
      1. Run: grep -n "buildDashboardPayload" src/server/dashboard.ts | head -3
      2. Assert: function still exported with same name
      3. Run: bunx tsc --noEmit
      4. Assert: 0 errors (callers compile without changes)
    Expected Result: Backwards-compatible internal refactor
    Evidence: .sisyphus/evidence/task-14-api-stable.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(server): split buildDashboardPayload into focused sub-functions`
  - Files: `src/server/dashboard.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 15. Split `buildDashboardPayloadFiles` into sub-functions

  **What to do**:
  - `buildDashboardPayloadFiles` (src/server/dashboard.ts:150, 140 lines) — same treatment as Task 14 but for the file-based variant
  - Extract sub-functions for each data concern, keeping the entry point intact
  - Use the SAME sub-function names as Task 14 where applicable (consistency), with a different data source parameter
  - Verify characterization tests from Task 1 still pass

  **Must NOT do**:
  - Do not change signature or return type
  - Do not redesign data flow

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Parallel to Task 14 but with file-based data sources — needs same careful extraction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 16, 17, 18)
  - **Blocks**: None
  - **Blocked By**: Task 4 (format utils extracted)

  **References**:

  **Pattern References**:
  - `src/server/dashboard.ts:150` — `buildDashboardPayloadFiles` — the 140-line function to split
  - Task 14's sub-function naming pattern — use consistent names where applicable

  **API/Type References**:
  - Same return type as `buildDashboardPayload` — verify they share the same output shape

  **Acceptance Criteria**:

  - [ ] `buildDashboardPayloadFiles` ≤40 lines
  - [ ] Each sub-function ≤50 lines
  - [ ] `bun run test src/__tests__/dashboard-payload.test.ts` → PASS
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Function split preserves behavior
    Tool: Bash
    Steps:
      1. Run: bun run test src/__tests__/dashboard-payload.test.ts
      2. Assert: all characterization tests pass
      3. Run: bunx tsc --noEmit
      4. Assert: 0 errors
    Expected Result: Same behavior, cleaner structure
    Evidence: .sisyphus/evidence/task-15-files-split.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(server): split buildDashboardPayloadFiles into focused sub-functions`
  - Files: `src/server/dashboard.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 16. Split `deriveBackgroundTasksSqlite` + `deriveBackgroundTasks`

  **What to do**:
  - `deriveBackgroundTasksSqlite` (181 lines) mixes 4 concerns: session lookup, task extraction, status derivation, result assembly
  - `deriveBackgroundTasks` (179 lines) — file-based variant with same concerns
  - Extract sub-functions for each concern within `background-tasks.ts`
  - Entry points remain intact with same signatures
  - Verify characterization tests from Task 3 still pass

  **Must NOT do**:
  - Do not change function signatures
  - Do not move to separate files
  - Do not combine with Task 9's circular dep fix (that's already done)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two parallel 180-line functions with 4 concerns each — systematic extraction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 17, 18)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5, 9 (shared utils + circular dep broken)

  **References**:

  **Pattern References**:
  - `src/ingest/background-tasks.ts` — Both functions — read full source to identify 4 concern boundaries
  - `src/__tests__/background-tasks-derive.test.ts` — Characterization tests from Task 3

  **API/Type References**:
  - Function signatures and return types — preserve exactly

  **Acceptance Criteria**:

  - [ ] Both entry functions ≤50 lines each
  - [ ] Sub-functions ≤60 lines each
  - [ ] `bun run test src/__tests__/background-tasks-derive.test.ts` → PASS
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Split preserves behavior
    Tool: Bash
    Steps:
      1. Run: bun run test src/__tests__/background-tasks-derive.test.ts
      2. Assert: all characterization tests pass
      3. Run: bun run test && bunx tsc --noEmit
      4. Assert: all pass
    Expected Result: Same behavior, cleaner structure
    Evidence: .sisyphus/evidence/task-16-bg-tasks-split.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(ingest): split deriveBackgroundTasks functions into sub-functions`
  - Files: `src/ingest/background-tasks.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 17. Split `ProjectStripInner` into sub-components

  **What to do**:
  - `ProjectStripInner` (src/ui/components/ProjectStrip.tsx, 461 lines, 5 concerns): header section, session list, sparkline/metrics, plan progress, action buttons
  - Extract 4-5 sub-components into the SAME file (or co-located files in the same directory):
    - `ProjectStripHeader` — project name, status badge, expand/collapse
    - `ProjectStripSessions` — session list/dots
    - `ProjectStripMetrics` — sparklines, token counts, timing
    - `ProjectStripActions` — action buttons, controls
  - Props: each sub-component receives props directly from `ProjectStripInner` — no context, no new hooks, no state lifting
  - CSS: keep in existing `ProjectStrip.css` — do NOT create new CSS files for sub-components
  - CRITICAL: Check e2e selectors in `tests/e2e/dashboard.spec.ts` — if they reference elements inside ProjectStripInner, they must still work after split
  - `formatRelativeTime` is tested in `nan-timestamp.test.ts` — if it's moved, update the test import path

  **Must NOT do**:
  - Do not redesign data flow (no context, no new hooks)
  - Do not create new state management
  - Do not prop-drill deeper than 2 levels — sub-components receive props directly from ProjectStripInner
  - Do not create new CSS files — use existing ProjectStrip.css
  - Do not split App.tsx or SettingsPanel.tsx (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React component splitting with JSX extraction, CSS class considerations, and e2e selector preservation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 16, 18)
  - **Blocks**: Tasks 22, 23
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx` — `ProjectStripInner` — read the full 461 lines to identify the 5 concern boundaries in JSX
  - `src/ui/components/ProjectStrip.css` — Existing styles — sub-components will use the same CSS classes
  - `tests/e2e/dashboard.spec.ts` — E2e selectors that may reference ProjectStrip elements — verify they still work
  - `src/__tests__/nan-timestamp.test.ts` — Tests `formatRelativeTime` — update import if function is moved

  **API/Type References**:
  - `ProjectStripInner` props type — sub-components will receive subsets of these props
  - `src/ui/types.ts` — UI-specific types that sub-components may need

  **WHY Each Reference Matters**:
  - `ProjectStrip.tsx`: The 461-line component being split — must understand JSX structure to find clean boundaries
  - `dashboard.spec.ts`: E2e tests are the ONLY UI regression safety net — selectors must not break
  - `nan-timestamp.test.ts`: Import path may change if `formatRelativeTime` is moved

  **Acceptance Criteria**:

  - [ ] `ProjectStripInner` ≤100 lines (orchestrator rendering sub-components)
  - [ ] 4-5 sub-components created, each ≤120 lines
  - [ ] No prop drilling deeper than 2 levels
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors
  - [ ] `bunx playwright test` → all 15 e2e tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Component renders identically after split
    Tool: Bash
    Steps:
      1. Run: bunx playwright test
      2. Assert: all 15 e2e tests pass
      3. Assert: no selector failures
    Expected Result: UI unchanged after component extraction
    Failure Indicators: E2e test failure = selector or rendering regression
    Evidence: .sisyphus/evidence/task-17-e2e-pass.txt

  Scenario: Component sizes within limits
    Tool: Bash
    Steps:
      1. Run: wc -l src/ui/components/ProjectStrip.tsx
      2. Assert: file size reduced (sub-components extracted)
      3. Run: grep -c "function\|const.*=" src/ui/components/ProjectStrip.tsx (approximate component count)
      4. Assert: ≥5 components/functions defined
    Expected Result: Large monolith split into focused pieces
    Evidence: .sisyphus/evidence/task-17-size-check.txt

  Scenario: formatRelativeTime test still passes
    Tool: Bash
    Steps:
      1. Run: bun run test src/__tests__/nan-timestamp.test.ts
      2. Assert: all tests pass
    Expected Result: Import path update (if needed) doesn't break test
    Evidence: .sisyphus/evidence/task-17-format-test.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(ui): split ProjectStripInner into focused sub-components`
  - Files: `src/ui/components/ProjectStrip.tsx`
  - Pre-commit: `bun run test && bunx tsc --noEmit && bunx playwright test`

- [x] 18. Consolidate status derivation logic

  **What to do**:
  - Status derivation exists in 3 places: `session.ts` (file-based), `session-inclusion.ts` (SQLite), and `sqlite-derive.ts` (SQLite variant)
  - Extract the shared STATUS DECISION LOGIC (the state machine: given last message time + agent status + ... → SessionStatus) into a pure function in `src/ingest/session-status.ts` or `src/ingest/status-utils.ts`
  - Each existing location becomes: fetch data → call shared status function → return result
  - The data ACCESS remains separate (file vs SQLite) — only the DECISION logic is unified
  - Complex conditional in `session.ts:359-374` (4-level if/else) becomes part of the shared function
  - Identical compound conditional in `dashboard.ts:486-502` and `sqlite-derive.ts:487-502` should call the same shared function

  **Must NOT do**:
  - Do not unify data access (file vs SQLite) — only unify the decision logic
  - Do not change status behavior — same inputs → same outputs
  - Do not create new status values or change the SessionStatus union

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Status logic unification requires understanding 3 different implementations and extracting the shared state machine without changing behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 16, 17)
  - **Blocks**: None
  - **Blocked By**: Task 5 (shared SQLite utils)

  **References**:

  **Pattern References**:
  - `src/ingest/session.ts:359-374` — 4-level if/else status derivation — this is the core logic to extract
  - `src/ingest/session-inclusion.ts` — `deriveSessionStatus` — SQLite variant of same logic
  - `src/server/dashboard.ts:486-502` — Compound status conditional — should call shared function
  - `src/ingest/sqlite-derive.ts:487-502` — Identical compound conditional — should call same shared function

  **API/Type References**:
  - `src/types.ts:16` — `SessionStatus` type — the 7-value union that is the output
  - Characterization tests from Task 2 — must keep passing

  **WHY Each Reference Matters**:
  - `session.ts:359-374`: The most explicit version of the status decision logic — use as the reference implementation
  - Both :486-502 conditionals: Must verify they're truly identical, then replace both with shared function call

  **Acceptance Criteria**:

  - [ ] Shared status decision function exists (pure function, no data access)
  - [ ] `grep -rn "function deriveStatus\|function computeStatus\|function resolveStatus" src/` → exactly 1 result (the shared function)
  - [ ] All 3 callers use the shared function
  - [ ] `bun run test src/__tests__/session-status-derivation.test.ts` → PASS
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Status derivation behavior unchanged
    Tool: Bash
    Steps:
      1. Run: bun run test src/__tests__/session-status-derivation.test.ts
      2. Assert: all characterization tests pass
      3. Run: bun run test && bunx tsc --noEmit
      4. Assert: all pass
    Expected Result: Unified logic, identical behavior
    Evidence: .sisyphus/evidence/task-18-status-unified.txt

  Scenario: Single source of truth for status logic
    Tool: Bash
    Steps:
      1. Count status decision functions: grep -rn "function.*[Ss]tatus" src/ingest/
      2. Verify the shared function exists and callers reference it
    Expected Result: No duplicated status decision logic
    Evidence: .sisyphus/evidence/task-18-single-source.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(ingest): consolidate status derivation into shared state machine`
  - Files: `src/ingest/session-status.ts` (new), `src/ingest/session.ts`, `src/ingest/session-inclusion.ts`, `src/ingest/sqlite-derive.ts`, `src/server/dashboard.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

### Wave 4 — Code Smells & React Performance

- [x] 19. Classify + fix 23 empty catch blocks across 6 files

  **What to do**:
  - Find all ~23 empty catch blocks across: `storage-backend.ts`, `session.ts`, `background-tasks.ts`, `boulder.ts`, `multi-project.ts`, `per-session-timeseries.ts`
  - CLASSIFY each as:
    - **Intentional swallow** (e.g., "try to read optional file, ignore if missing") → add comment: `// Expected: file may not exist` or similar
    - **Accidental silent** (genuine error being swallowed) → add `console.warn('[module:function] Error description:', error)`
  - Use the `Result<T>` pattern (`{ ok: true; value } | { ok: false; reason }`) from `storage-backend.ts` where appropriate for functions that already return result types
  - IMPORTANT: Read surrounding code context to classify correctly. File-not-found in `session.ts` and `boulder.ts` is likely intentional. SQLite errors in `storage-backend.ts` are likely accidental.

  **Must NOT do**:
  - Do not add error reporting infrastructure (no Sentry, no error boundary system)
  - Do not change function signatures
  - Do not add try-catch where none exists — only fix EXISTING empty catches

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading context around 23 catch blocks to classify correctly — judgment-heavy task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20, 21, 22, 23, 24)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-3 (Wave 0)

  **References**:

  **Pattern References**:
  - `src/ingest/storage-backend.ts` — Has both empty catches AND the `Result<T>` pattern — use Result where it fits, `console.warn` otherwise
  - `src/ingest/session.ts` — Many empty catches around file reads — likely intentional swallows for optional files
  - `src/ingest/boulder.ts` — File reads with empty catches — likely intentional (plan files may not exist)

  **API/Type References**:
  - `Result<T>` pattern: `{ ok: true; value: T } | { ok: false; reason: string }` from `storage-backend.ts`

  **WHY Each Reference Matters**:
  - Must understand the context of each catch to classify correctly — the fix differs for intentional vs accidental

  **Acceptance Criteria**:

  - [ ] `grep -rn "catch.*{}" src/ingest/ src/server/` → 0 results (no empty catches remain)
  - [ ] Each former empty catch has either a comment (intentional) or `console.warn` (accidental)
  - [ ] No new error handling abstractions introduced
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No empty catch blocks remain
    Tool: Bash
    Steps:
      1. Run: grep -Pzn "catch\s*\([^)]*\)\s*\{\s*\}" src/ingest/*.ts src/server/*.ts || echo "CLEAN"
      2. Assert: output is "CLEAN" or empty (no matches)
    Expected Result: All 23 empty catches addressed
    Evidence: .sisyphus/evidence/task-19-empty-catches.txt

  Scenario: Classification is correct
    Tool: Bash
    Steps:
      1. Run: grep -n "Expected:\|intentional" src/ingest/session.ts src/ingest/boulder.ts
      2. Assert: file-read catches have "Expected" comments
      3. Run: grep -n "console.warn" src/ingest/storage-backend.ts src/ingest/background-tasks.ts
      4. Assert: SQLite/network catches have console.warn
    Expected Result: Correct classification applied
    Evidence: .sisyphus/evidence/task-19-classification.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `fix(ingest): classify and fix 23 empty catch blocks`
  - Files: `src/ingest/storage-backend.ts`, `src/ingest/session.ts`, `src/ingest/background-tasks.ts`, `src/ingest/boulder.ts`, `src/server/multi-project.ts`, `src/ingest/per-session-timeseries.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 20. Extract magic numbers to named constants

  **What to do**:
  - Find all magic numbers across the codebase: `ACTIVE_STALE_MS`, `ERROR_STALE_MS`, polling intervals, slice bounds, limit values, timeout durations
  - Replace with named constants — `const ACTIVE_STALE_THRESHOLD_MS = 30_000` etc.
  - Co-locate constants with their usage file UNLESS shared across 2+ files — then put in a shared constants section at file top
  - Use `_000` separator for large numbers (e.g., `30_000` not `30000`)

  **Must NOT do**:
  - Do not create a `src/constants.ts` file — co-locate
  - Do not change the numeric values — pure naming exercise
  - Do not extract trivially obvious numbers like array index 0, length checks, etc.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-name pattern — no complex decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19, 21, 22, 23, 24)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-3

  **References**:

  **Pattern References**:
  - Grep for bare numbers in time contexts: `grep -rn "[0-9]\{4,\}" src/ingest/ src/server/` — find large numeric literals
  - Existing named constants (if any) — follow their naming pattern

  **Acceptance Criteria**:

  - [ ] No bare numeric literals >999 in timeout/threshold/limit contexts
  - [ ] Constants use descriptive names ending in `_MS`, `_COUNT`, `_LIMIT`, etc.
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Magic numbers replaced with named constants
    Tool: Bash
    Steps:
      1. Run: grep -rn "setTimeout.*[0-9]\{4,\}\|setInterval.*[0-9]\{4,\}" src/ingest/ src/server/
      2. Assert: all timeout values use named constants
      3. Run: bun run test && bunx tsc --noEmit
      4. Assert: all pass
    Expected Result: Code is self-documenting — no unexplained numbers
    Evidence: .sisyphus/evidence/task-20-magic-numbers.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `refactor: replace magic numbers with named constants`
  - Files: Multiple files across `src/ingest/`, `src/server/`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 21. Improve type safety — validate JSON.parse, remove unsafe casts

  **What to do**:
  - `token-usage.ts:18` — `as unknown` cast — investigate and add proper type validation or type guard
  - `background-tasks.ts:403` — `as unknown` cast — add validation
  - `sqlite-derive.ts` — `as any` usage — replace with proper type or type guard
  - All `JSON.parse()` calls that cast directly to a type without validation — add basic shape checks (e.g., `if (typeof parsed === 'object' && parsed !== null && 'key' in parsed)`)
  - Do NOT add Zod or any validation library — use simple type guards

  **Must NOT do**:
  - Do not add validation libraries (Zod, io-ts, etc.)
  - Do not change the data being parsed — only add validation
  - Do not add validation to EVERY JSON.parse — only the ones that cast unsafely

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Type safety improvements require understanding what each JSON blob contains and creating appropriate guards
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19, 20, 22, 23, 24)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-3

  **References**:

  **Pattern References**:
  - `src/ingest/token-usage.ts:18` — `as unknown` cast location
  - `src/ingest/background-tasks.ts:403` — `as unknown` cast location
  - `src/ingest/sqlite-derive.ts` — `as any` location (grep to find exact line)

  **API/Type References**:
  - Target types being cast to — understand what shape is expected to write correct guards

  **Acceptance Criteria**:

  - [ ] `grep -rn "as any" src/ --include="*.ts" | grep -v test | grep -v node_modules | grep -v ".d.ts"` → 0 results in source files (excluding comments)
  - [ ] `as unknown` casts have validation logic following them
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Unsafe casts eliminated
    Tool: Bash
    Steps:
      1. Run: grep -rn "as any" src/ingest/ src/server/ src/ui/ --include="*.ts" --include="*.tsx" | grep -v "test" | grep -v "//"
      2. Assert: 0 results (or only in comments)
      3. Run: grep -rn "as unknown" src/ingest/ --include="*.ts" | grep -v test
      4. Assert: any remaining have validation following them
    Expected Result: Type-safe codebase
    Evidence: .sisyphus/evidence/task-21-type-safety.txt

  Scenario: All tests pass with validation
    Tool: Bash
    Steps:
      1. Run: bun run test && bunx tsc --noEmit
      2. Assert: all pass
    Expected Result: Validation doesn't break existing behavior
    Evidence: .sisyphus/evidence/task-21-tests.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `fix(ingest): add type validation for JSON.parse casts, remove as any`
  - Files: `src/ingest/token-usage.ts`, `src/ingest/background-tasks.ts`, `src/ingest/sqlite-derive.ts`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 22. Memoize inline callbacks with `useCallback` in App.tsx, SettingsPanel.tsx, ProjectCard.tsx

  **What to do**:
  - `App.tsx` lines 416-417, 438, 468, 500-505 — inline arrow functions in JSX → extract to `useCallback` hooks
  - `SettingsPanel.tsx` lines 211, 226, 245, 261, 277, 324, 333 — inline arrows → `useCallback`
  - `ProjectCard.tsx` lines 48-95 — `handleSave`, `handleKeyDown`, `handleRemove` are defined inside render but not memoized → wrap with `useCallback`
  - For each callback: identify dependencies correctly for the `useCallback` dependency array
  - Also fix inline style/array objects in `App.tsx` that create new references each render — extract to `useMemo` or module-level constants

  **Must NOT do**:
  - Do not split App.tsx or SettingsPanel.tsx into sub-components (that's out of scope)
  - Do not change callback behavior — only wrap with useCallback
  - Do not over-memoize — only callbacks passed as props to child components

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical wrapping of existing callbacks — clear pattern, no design decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19, 20, 21, 23, 24)
  - **Blocks**: Task 23 (memo needs stable props)
  - **Blocked By**: Task 17 (component split — ProjectStripInner may affect App.tsx rendering)

  **References**:

  **Pattern References**:
  - `src/ui/App.tsx:416-417, 438, 468, 500-505` — Inline arrows to memoize
  - `src/ui/components/SettingsPanel.tsx:211, 226, 245, 261, 277, 324, 333` — Inline arrows to memoize
  - `src/ui/components/ProjectCard.tsx:48-95` — Handler functions to wrap with useCallback
  - Existing `useCallback` usage in the codebase — follow same pattern for dependency arrays

  **API/Type References**:
  - React `useCallback` hook — standard usage pattern

  **WHY Each Reference Matters**:
  - Line numbers identify exact locations — read each to determine correct dependency arrays

  **Acceptance Criteria**:

  - [ ] No inline arrow functions as props in App.tsx JSX
  - [ ] No inline arrow functions as props in SettingsPanel.tsx JSX
  - [ ] ProjectCard handlers wrapped with useCallback
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Inline callbacks memoized
    Tool: Bash
    Steps:
      1. Run: bun run test && bunx tsc --noEmit
      2. Assert: all pass
      3. Run: bunx playwright test
      4. Assert: all 15 e2e tests pass (UI still works correctly)
    Expected Result: Same behavior with stable callback references
    Evidence: .sisyphus/evidence/task-22-callbacks.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `perf(ui): memoize inline callbacks with useCallback`
  - Files: `src/ui/App.tsx`, `src/ui/components/SettingsPanel.tsx`, `src/ui/components/ProjectCard.tsx`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 23. Add `memo()` to extracted sub-components + leaf components

  **What to do**:
  - Wrap sub-components extracted from `ProjectStripInner` in Task 17 with `React.memo()`
  - Wrap `PlanProgress`, `DashboardHeader` with `React.memo()` — these are leaf components that don't need re-rendering when parent state changes
  - For `SortableProjectStrip` — check if `useSortable()` provides stable `transform`/`transition` props. If NOT stable, do NOT add memo (it would be useless). If stable or can be memoized, add memo.
  - CRITICAL: Verify all props are stable BEFORE adding memo — if any prop is an inline object/callback, memo is useless. Task 22 must have fixed callbacks first.
  - Do NOT add memo to `AddProjectForm`, `PreviewNav` (too simple / rarely re-rendered)

  **Must NOT do**:
  - Do not add memo to components with unstable props (check Task 22 is complete first)
  - Do not add custom `areEqual` comparisons — use default shallow comparison
  - Do not over-memo — only components that render frequently with unchanged props

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding `memo()` wrapper is mechanical — the hard work (prop stability) was done in Tasks 17 and 22
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but depends on T17, T22 being complete)
  - **Parallel Group**: Wave 4 (with Tasks 19, 20, 21, 22, 24)
  - **Blocks**: None
  - **Blocked By**: Tasks 17 (component split), 22 (callback memoization)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx` — Sub-components from Task 17 — wrap with memo
  - `src/ui/components/SessionSwimlane.tsx` — Already has `memo()` — follow same pattern
  - `src/ui/components/Sparkline.tsx` — Already has `memo()` — follow same pattern
  - `@dnd-kit/sortable` — `useSortable()` return value stability — check if `transform` is stable

  **API/Type References**:
  - React `memo()` — standard usage, no custom comparator

  **Acceptance Criteria**:

  - [ ] Sub-components from Task 17 wrapped with `memo()`
  - [ ] `PlanProgress` wrapped with `memo()`
  - [ ] `DashboardHeader` wrapped with `memo()`
  - [ ] `SortableProjectStrip` — memo added only if props are stable
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors
  - [ ] `bunx playwright test` → all e2e pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: memo() applied correctly
    Tool: Bash
    Steps:
      1. Run: grep -n "memo(" src/ui/components/ProjectStrip.tsx src/ui/components/PlanProgress.tsx src/ui/components/DashboardHeader.tsx
      2. Assert: memo() calls found in all expected files
      3. Run: bun run test && bunx tsc --noEmit && bunx playwright test
      4. Assert: all pass
    Expected Result: memo() prevents unnecessary re-renders
    Evidence: .sisyphus/evidence/task-23-memo.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `perf(ui): add memo() to extracted sub-components and leaf components`
  - Files: `src/ui/components/ProjectStrip.tsx`, `src/ui/components/PlanProgress.tsx`, `src/ui/components/DashboardHeader.tsx`
  - Pre-commit: `bun run test && bunx tsc --noEmit`

- [x] 24. Remove dead code

  **What to do**:
  - Remove dead `dirty` flag remnants if not already handled in Task 8 — verify with `grep -n "dirty" src/server/dashboard.ts`
  - Remove any dead utility functions identified in code smell audit (single-use utils that are no longer used after dedup)
  - Remove commented-out CSS rules in `ProjectStrip.css` (identified in CSS audit)
  - Remove `console.log` debug statement in `sources-registry.ts:79` (the only debug log in non-startup code)
  - Verify each removal: use `lsp_find_references` or `grep` to confirm truly unused before deleting

  **Must NOT do**:
  - Do not remove startup logs in `dev.ts` and `start.ts` (those are intentional)
  - Do not remove functions that are exported even if unused locally (may be used externally)
  - Do not remove code you're unsure about — verify first

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward deletion after verification — no complex decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19, 20, 21, 22, 23)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-3

  **References**:

  **Pattern References**:
  - `src/server/dashboard.ts` — `dirty` flag (may be gone from Task 8)
  - `src/ingest/sources-registry.ts:79` — Debug console.log
  - `src/ui/components/ProjectStrip.css` — Commented-out CSS rules

  **Acceptance Criteria**:

  - [ ] `grep -n "console.log" src/ingest/sources-registry.ts` → 0 results
  - [ ] No commented-out CSS rules in component CSS files
  - [ ] `bun run test` → all tests pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dead code removed
    Tool: Bash
    Steps:
      1. Run: grep -rn "console.log" src/ingest/ src/server/ | grep -v "dev.ts\|start.ts"
      2. Assert: only expected logs remain (console.warn from Task 19 is fine)
      3. Run: bun run test && bunx tsc --noEmit
      4. Assert: all pass
    Expected Result: Clean codebase with no dead code
    Evidence: .sisyphus/evidence/task-24-dead-code.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `chore: remove dead code, debug logs, and commented CSS`
  - Files: `src/ingest/sources-registry.ts`, `src/ui/components/ProjectStrip.css`, others
  - Pre-commit: `bun run test && bunx tsc --noEmit`

### Wave 5 — CSS Tokenization

- [x] 25. Replace hardcoded rgba in ProjectStrip.css + Sparkline.css with tokens

  **What to do**:
  - Find all hardcoded `rgba()` values in `src/ui/components/ProjectStrip.css` and `src/ui/components/Sparkline.css`
  - For each value: define a CSS custom property in `src/styles/tokens.css` with the EXACT same rgba value (e.g., `--color-strip-bg-active: rgba(46, 160, 67, 0.08)`)
  - Replace each hardcoded value with `var(--token-name)`
  - Token naming convention: follow existing `tokens.css` pattern — use semantic names where possible (e.g., `--strip-status-active-bg`), fall back to descriptive names (e.g., `--sparkline-line-color`)
  - Use `ast_grep_search` to find all `rgba(` patterns first

  **Must NOT do**:
  - Do not change any color values — exact rgba match
  - Do not create a design system or theme abstraction
  - Do not reorganize the CSS file structure
  - Do not add CSS-in-JS or CSS modules

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-replace pattern with known source and destination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 26, 27)
  - **Blocks**: None
  - **Blocked By**: Task 7 (CSS token definitions)

  **References**:

  **Pattern References**:
  - `src/styles/tokens.css` — Existing token naming convention — follow for new tokens
  - `src/ui/components/ProjectStrip.css` — ~20 hardcoded rgba values
  - `src/ui/components/Sparkline.css` — ~5 hardcoded rgba values

  **WHY Each Reference Matters**:
  - `tokens.css`: Must follow existing naming convention for consistency
  - Each CSS file: Read to understand context of each color use for semantic naming

  **Acceptance Criteria**:

  - [ ] `grep -c "rgba(" src/ui/components/ProjectStrip.css` → 0 (all replaced with var())
  - [ ] `grep -c "rgba(" src/ui/components/Sparkline.css` → 0
  - [ ] All new tokens defined in `src/styles/tokens.css`
  - [ ] `bunx playwright test` → all 15 e2e tests pass (no visual regression)
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All rgba replaced with tokens
    Tool: Bash
    Steps:
      1. Run: grep -c "rgba(" src/ui/components/ProjectStrip.css
      2. Assert: 0 results
      3. Run: grep -c "rgba(" src/ui/components/Sparkline.css
      4. Assert: 0 results
      5. Run: grep -c "var(--" src/ui/components/ProjectStrip.css
      6. Assert: count increased (tokens being used)
    Expected Result: All hardcoded colors use CSS custom properties
    Evidence: .sisyphus/evidence/task-25-rgba-tokens.txt

  Scenario: No visual regression
    Tool: Bash
    Steps:
      1. Run: bunx playwright test
      2. Assert: all 15 e2e tests pass
    Expected Result: Identical visual appearance
    Failure Indicators: E2e test failure = color mismatch
    Evidence: .sisyphus/evidence/task-25-e2e-pass.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `style(css): replace hardcoded rgba with tokens in ProjectStrip and Sparkline`
  - Files: `src/ui/components/ProjectStrip.css`, `src/ui/components/Sparkline.css`, `src/styles/tokens.css`
  - Pre-commit: `bun run test && bunx tsc --noEmit && bunx playwright test`

- [x] 26. Replace hardcoded rgba in SessionSwimlane + ProjectCard + OverlayShell CSS

  **What to do**:
  - Same as Task 25 but for: `SessionSwimlane.css`, `ProjectCard.css`, `OverlayShell.css`
  - Find all hardcoded `rgba()` values, define tokens in `tokens.css`, replace with `var()`
  - Exact same rgba values — no color changes

  **Must NOT do**:
  - Same constraints as Task 25

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Same pattern as Task 25, different files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 25, 27)
  - **Blocks**: None
  - **Blocked By**: Task 7 (CSS token definitions)

  **References**:

  **Pattern References**:
  - `src/ui/components/SessionSwimlane.css` — rgba values to tokenize
  - `src/ui/components/ProjectCard.css` — rgba values to tokenize
  - `src/ui/components/OverlayShell.css` — rgba values to tokenize
  - `src/styles/tokens.css` — Destination for new token definitions

  **Acceptance Criteria**:

  - [ ] `grep -c "rgba(" src/ui/components/SessionSwimlane.css` → 0
  - [ ] `grep -c "rgba(" src/ui/components/ProjectCard.css` → 0
  - [ ] `grep -c "rgba(" src/ui/components/OverlayShell.css` → 0
  - [ ] `bunx playwright test` → all pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All rgba replaced
    Tool: Bash
    Steps:
      1. Run: grep -c "rgba(" src/ui/components/SessionSwimlane.css src/ui/components/ProjectCard.css src/ui/components/OverlayShell.css
      2. Assert: all counts are 0
    Expected Result: All hardcoded colors tokenized
    Evidence: .sisyphus/evidence/task-26-rgba-tokens.txt

  Scenario: No visual regression
    Tool: Bash
    Steps:
      1. Run: bunx playwright test
      2. Assert: all 15 tests pass
    Expected Result: Identical appearance
    Evidence: .sisyphus/evidence/task-26-e2e-pass.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `style(css): replace hardcoded rgba with tokens in SessionSwimlane, ProjectCard, OverlayShell`
  - Files: `src/ui/components/SessionSwimlane.css`, `src/ui/components/ProjectCard.css`, `src/ui/components/OverlayShell.css`, `src/styles/tokens.css`
  - Pre-commit: `bun run test && bunx tsc --noEmit && bunx playwright test`

- [x] 27. Fix duplicated `.session-dot` rules + standardize z-index/spacing

  **What to do**:
  - `.session-dot` rules at lines ~414-474 in `ProjectStrip.css` repeat ~60 lines — consolidate into single rule set
  - `.project-card__btn` defined twice in `ProjectCard.css` — merge into single definition
  - Replace hardcoded z-index values (900, 901, 10, 6, 5) across ALL component CSS files with the z-index tokens defined in Task 7 (`--z-overlay`, `--z-overlay-above`, etc.)
  - Replace hardcoded spacing values (px) with `--sp-*` tokens where appropriate — only values that match existing `--sp-*` tokens

  **Must NOT do**:
  - Do not change visual appearance
  - Do not add new spacing tokens (use only existing `--sp-*` values)
  - Do not restructure CSS files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CSS deduplication and token replacement — clear mechanical changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 25, 26)
  - **Blocks**: None
  - **Blocked By**: Task 7 (z-index tokens defined)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.css:414-474` — Duplicated `.session-dot` rules
  - `src/ui/components/ProjectCard.css` — Duplicated `.project-card__btn`
  - `grep -rn "z-index:" src/ui/components/*.css` — All z-index values to replace with tokens

  **Acceptance Criteria**:

  - [ ] No duplicated CSS rule definitions
  - [ ] `grep -rn "z-index: [0-9]" src/ui/components/*.css` → 0 results (all use tokens)
  - [ ] `bunx playwright test` → all pass
  - [ ] `bunx tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Duplicated CSS rules consolidated
    Tool: Bash
    Steps:
      1. Run: grep -c "\.session-dot" src/ui/components/ProjectStrip.css
      2. Assert: count is reduced from before (duplicates merged)
      3. Run: grep -c "\.project-card__btn" src/ui/components/ProjectCard.css
      4. Assert: exactly 1 rule block
    Expected Result: No duplicated CSS definitions
    Evidence: .sisyphus/evidence/task-27-css-dedup.txt

  Scenario: Z-index uses tokens
    Tool: Bash
    Steps:
      1. Run: grep "z-index" src/ui/components/*.css | grep -v "var(--z-"
      2. Assert: 0 results (all z-index values use tokens)
    Expected Result: Consistent z-index system via tokens
    Evidence: .sisyphus/evidence/task-27-zindex-tokens.txt

  Scenario: No visual regression
    Tool: Bash
    Steps:
      1. Run: bunx playwright test
      2. Assert: all 15 tests pass
    Expected Result: Identical appearance
    Evidence: .sisyphus/evidence/task-27-e2e-pass.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `style(css): consolidate duplicated rules, standardize z-index and spacing tokens`
  - Files: `src/ui/components/ProjectStrip.css`, `src/ui/components/ProjectCard.css`, other CSS files with z-index
  - Pre-commit: `bun run test && bunx tsc --noEmit && bunx playwright test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit` + `bun run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Key Files | Pre-commit |
|------|---------------|-----------|-----------|
| 0 | `test(ingest): add characterization tests for dashboard, session, background-tasks` | `src/__tests__/dashboard-*.test.ts`, `src/__tests__/session-status.test.ts`, `src/__tests__/background-tasks-derive.test.ts` | `bun run test` |
| 1 | `refactor(ingest): extract shared utils, consolidate PlanStep, define CSS tokens` | `src/ingest/format-utils.ts`, `src/ingest/sqlite-utils.ts`, `src/types.ts`, `src/styles/tokens.css` | `bun run test && bunx tsc --noEmit` |
| 2 | `refactor(ingest): break circular dep, batch N+1 queries, cap caches` | `src/ingest/session.ts`, `src/ingest/paths.ts`, `src/ingest/session-inclusion.ts`, `src/ingest/sqlite-derive.ts` | `bun run test && bunx tsc --noEmit` |
| 3 | `refactor: split mega-functions and components, consolidate status logic` | `src/server/dashboard.ts`, `src/ingest/background-tasks.ts`, `src/ui/components/ProjectStrip*` | `bun run test && bunx tsc --noEmit && bunx playwright test` |
| 4 | `fix: empty catches, magic numbers, type safety, memo, dead code` | Multiple files across `src/ingest/`, `src/ui/` | `bun run test && bunx tsc --noEmit` |
| 5 | `style(css): replace hardcoded rgba with tokens, fix duplicated rules` | `src/ui/components/*.css`, `src/styles/tokens.css` | `bun run test && bunx tsc --noEmit && bunx playwright test` |

---

## Success Criteria

### Verification Commands
```bash
bun run test              # All tests pass (184 existing + new characterization tests)
bunx tsc --noEmit         # 0 TypeScript errors
bunx playwright test      # All 15 e2e tests pass

# Dedup verification:
grep -rn "function formatTimeline" src/    # Exactly 1 result
grep -rn "function formatElapsed" src/     # Exactly 1 result
grep -rn "function classifySqliteError" src/  # Exactly 1 result
grep -rn "function canonicalizeAgent" src/    # Exactly 1 result

# Circular dep verification:
grep "from.*background-tasks" src/ingest/session.ts  # No value imports

# CSS token verification:
# All var(--*) in component CSS have definitions in tokens.css
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All unit tests pass
- [ ] All e2e tests pass
- [ ] Zero TypeScript errors
- [ ] No duplicated utility functions remain
- [ ] No circular dependencies
- [ ] All CSS tokens defined
