# Git Uncommitted Changes Indicator

## TL;DR

> **Quick Summary**: Add a per-project warning badge to the omo-pulse dashboard showing the total count of uncommitted git changes (staged + unstaged + untracked). Safety feature — agents tend to reset things when starting work.
> 
> **Deliverables**:
> - New `src/ingest/git-status.ts` module (Bun.spawn + 30s cache)
> - Updated `ProjectSnapshot` type with `gitUncommittedCount?: number`
> - Integration in `multi-project.ts` to populate the field
> - Orange/amber pill badge in ProjectStrip header (collapsed-visible)
> - Unit tests for git-status module
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves + final verification
> **Critical Path**: Task 1 (type) → Task 2 (ingest) → Task 3 (integration) → Task 4 (UI) → Task 5 (tests)

---

## Context

### Original Request
User wants a per-project indicator showing total uncommitted git changes count. This serves as a safety net — AI agents tend to reset uncommitted work when starting sessions.

### Interview Summary
**Key Discussions**:
- **What to count**: ALL uncommitted changes — staged + unstaged + untracked (single number)
- **Throttling**: Cache git status for ~30 seconds (dashboard polls every 2s, git check is expensive)
- **Visual style**: Orange/amber warning pill badge in ProjectStrip header, visible in collapsed view
- **Branch scope**: Check current checked-out branch, not specifically main/master
- **Testing**: Tests after implementation (Vitest, ~26 existing tests)

**Research Findings**:
- `projectRoot` available in every `ProjectSnapshot` — no new data source needed
- No existing git integration — first subprocess call in codebase
- ProjectStrip has existing badge pattern (`.strip-agent-badge`) to follow
- Must use `Bun.spawn()` — Bun runtime, not Node child_process
- Result type pattern: `{ ok: true; value } | { ok: false; reason }` throughout codebase

### Metis Review
**Identified Gaps** (addressed):
- **Error handling**: Return `undefined` when git unavailable/fails/not-a-repo
- **Timeout**: 5s timeout on `Bun.spawn` to prevent hanging on large repos
- **Cache structure**: `Map<string, { count: number; fetchedAt: number }>` with 30s TTL
- **Edge cases**: git index.lock, bare repos, worktrees — all handled via silent failure
- **Scope creep guardrails**: Locked down in "Must NOT Have"

---

## Work Objectives

### Core Objective
Add a cached git status check per project that surfaces total uncommitted change count as an orange warning badge in the dashboard header.

### Concrete Deliverables
- `src/ingest/git-status.ts` — New module: `getGitUncommittedCount(projectRoot: string): Promise<number | undefined>`
- `src/types.ts` — `gitUncommittedCount?: number` on `ProjectSnapshot`
- `src/server/multi-project.ts` — Call git-status in `transformPayloadToSnapshot` or `getMultiProjectPayload`
- `src/ui/components/ProjectStrip.tsx` — Render badge when count > 0
- `src/ui/components/ProjectStrip.css` — `.strip-git-badge` styles
- `src/__tests__/git-status.test.ts` — Unit tests for module

### Definition of Done
- [ ] `bun run build` succeeds with zero errors
- [ ] `bun run test` passes all existing + new tests
- [ ] Badge appears for projects with uncommitted changes
- [ ] Badge hidden when count is 0 or git unavailable
- [ ] Git status cached for 30 seconds (not re-checked every 2s poll)

### Must Have
- Single total count of staged + unstaged + untracked files
- 30-second cache TTL per project
- 5-second timeout on git subprocess
- Graceful failure: `undefined` when git unavailable, no badge shown
- Orange/amber pill badge matching existing `.strip-agent-badge` style
- Badge visible in collapsed ProjectStrip view
- Display "999+" for counts exceeding 999

### Must NOT Have (Guardrails)
- NO file list or file names display
- NO click handlers or expandable details on the badge
- NO branch name display
- NO staged vs unstaged breakdown
- NO config toggle to enable/disable
- NO variable poll rate
- NO git diff content
- NO commit history
- NO external dependencies (use Bun.spawn directly)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest, 5 test files, ~26 tests)
- **Automated tests**: Tests-after (implementation first, then test file)
- **Framework**: Vitest (bun run test)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Module**: Use Bash (bun REPL / direct import) — call functions, compare output
- **Frontend/UI**: Use Playwright (playwright skill) — navigate, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — type + ingest, can be parallel):
├── Task 1: Add gitUncommittedCount to ProjectSnapshot type [quick]
└── Task 2: Create git-status.ts ingest module [unspecified-high]

Wave 2 (After Wave 1 — integration + UI, can be parallel):
├── Task 3: Integrate git-status into multi-project.ts (depends: 1, 2) [quick]
└── Task 4: Add git badge to ProjectStrip UI (depends: 1) [visual-engineering]

Wave 3 (After Wave 2 — tests):
└── Task 5: Unit tests for git-status module (depends: 2, 3) [quick]

Wave FINAL (After ALL tasks — verification, 4 parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA with Playwright (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 5
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1    | —         | 3, 4   | 1    |
| 2    | —         | 3, 5   | 1    |
| 3    | 1, 2      | 5      | 2    |
| 4    | 1         | —      | 2    |
| 5    | 2, 3      | —      | 3    |

### Agent Dispatch Summary

- **Wave 1**: **2 agents** — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: **2 agents** — T3 → `quick`, T4 → `visual-engineering`
- **Wave 3**: **1 agent** — T5 → `quick`
- **FINAL**: **4 agents** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + playwright, F4 → `deep`

---

## TODOs

- [ ] 1. Add `gitUncommittedCount` to ProjectSnapshot type

  **What to do**:
  - Open `src/types.ts`
  - Add `gitUncommittedCount?: number` field to the `ProjectSnapshot` type after the `tokenUsage` field (around line 108)
  - This is an optional field — `undefined` means git data unavailable, `0` means no changes

  **Must NOT do**:
  - Do NOT add any other git-related fields (branch name, file list, etc.)
  - Do NOT modify any other types

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line type addition in one file
  - **Skills**: []
    - No special skills needed for a type definition change
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not a UI task
    - `git-master`: Not a git operation task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/types.ts:108` — `tokenUsage?: TokenUsageSummary` — Insert new field after this line, following same optional pattern

  **API/Type References**:
  - `src/types.ts:82-110` — Full `ProjectSnapshot` type definition — understand the shape before modifying

  **WHY Each Reference Matters**:
  - The `ProjectSnapshot` type is imported across 8+ files (server, UI, hooks). Adding the field here makes it available everywhere via existing imports. Follow the `fieldName?: Type` optional pattern already used by `tokenUsage`.

  **Acceptance Criteria**:
  - [ ] `bun run build` succeeds (type is valid TypeScript)
  - [ ] Field `gitUncommittedCount?: number` exists on `ProjectSnapshot`
  - [ ] No other types modified

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Type compiles correctly
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `bunx tsc --noEmit`
      2. Check exit code is 0
    Expected Result: Zero type errors, exit code 0
    Failure Indicators: Any TypeScript compilation error mentioning types.ts
    Evidence: .sisyphus/evidence/task-1-type-compiles.txt

  Scenario: Field is optional (no breaking changes)
    Tool: Bash
    Preconditions: Type field added
    Steps:
      1. Run `bun run build`
      2. Check exit code is 0
    Expected Result: Build succeeds — existing code that creates ProjectSnapshot objects without gitUncommittedCount still compiles
    Failure Indicators: Build errors about missing property gitUncommittedCount
    Evidence: .sisyphus/evidence/task-1-build-passes.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add gitUncommittedCount to ProjectSnapshot`
  - Files: `src/types.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [ ] 2. Create `src/ingest/git-status.ts` — git uncommitted count with cache

  **What to do**:
  - Create new file `src/ingest/git-status.ts`
  - Implement `getGitUncommittedCount(projectRoot: string): Promise<number | undefined>`
  - Run `git status --porcelain` via `Bun.spawn()` in the given `projectRoot` directory
  - Count non-empty lines in stdout (each line = one changed/untracked file)
  - Implement module-level cache: `Map<string, { count: number; fetchedAt: number }>` with 30,000ms TTL
  - On cache hit within TTL: return cached count immediately (sync path, no spawn)
  - On cache miss/expired: spawn git, parse, cache result, return count
  - Cap display at 999 — if count > 999, still store actual count but export helper or let UI handle cap
  - **Error handling**: Return `undefined` for ANY failure:
    - git not installed (spawn fails)
    - Not a git repo (git exits non-zero)
    - Timeout exceeded (5 second timeout via `Bun.spawn` with `setTimeout` + `proc.kill()`)
    - Empty/unreadable stdout
  - **Timeout implementation**: Use `Promise.race([gitResult, timeoutPromise])` pattern. The timeout promise resolves to `undefined` after 5000ms and kills the process.
  - Export: `getGitUncommittedCount` (main function) and `GIT_STATUS_CACHE_TTL_MS` (constant, for testing)

  **Must NOT do**:
  - Do NOT parse individual file statuses (staged vs unstaged vs untracked)
  - Do NOT capture file names or paths
  - Do NOT use Node.js `child_process` — use `Bun.spawn()` only
  - Do NOT add any npm dependencies
  - Do NOT make the cache configurable — hardcode 30s TTL and 5s timeout

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New module with subprocess management, caching, error handling, and timeout logic
  - **Skills**: []
    - No special skills needed — Bun.spawn is well-documented
  - **Skills Evaluated but Omitted**:
    - `deployment`: Not a deployment task
    - `playwright`: Not a browser task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ingest/token-usage.ts` — Follow ingest module pattern: pure function export, clear parameter types, result type conventions
  - `src/ingest/storage-backend.ts:50` — `withReadonlyDb()` shows error handling pattern: classify errors, return undefined/result types gracefully

  **API/Type References**:
  - Bun.spawn API: `Bun.spawn(["git", "status", "--porcelain"], { cwd: projectRoot, stdout: "pipe", stderr: "pipe" })` — returns `Subprocess` with `.stdout` as `ReadableStream`
  - Use `new Response(proc.stdout).text()` to read stdout as string (Bun pattern)

  **External References**:
  - `git status --porcelain` outputs one line per changed file, format: `XY filename` where X=staged, Y=unstaged, `??`=untracked. We only count lines, not parse status codes.

  **WHY Each Reference Matters**:
  - token-usage.ts shows the ingest module export pattern to follow
  - storage-backend.ts shows how to gracefully handle infrastructure errors (db not found → return undefined)
  - git porcelain format is stable across git versions — safe to count lines

  **Acceptance Criteria**:
  - [ ] File exists: `src/ingest/git-status.ts`
  - [ ] Exports `getGitUncommittedCount(projectRoot: string): Promise<number | undefined>`
  - [ ] Returns count of uncommitted changes for a valid git repo
  - [ ] Returns `undefined` for non-git directories
  - [ ] Caches results for 30 seconds (does not re-spawn git within TTL)
  - [ ] Times out after 5 seconds on hung git processes
  - [ ] `bunx tsc --noEmit` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Counts uncommitted changes in a real git repo
    Tool: Bash
    Preconditions: The omo-pulse project itself is a git repo
    Steps:
      1. Create a temp file: `touch /tmp/omo-git-test-deleteme.ts`
      2. Run: `bun -e "import { getGitUncommittedCount } from './src/ingest/git-status.ts'; const c = await getGitUncommittedCount('$(pwd)'); console.log('COUNT:', c, typeof c)"`
      3. Clean up: `rm /tmp/omo-git-test-deleteme.ts`
    Expected Result: COUNT: <number> number (where number >= 0)
    Failure Indicators: COUNT: undefined, or thrown error, or non-number type
    Evidence: .sisyphus/evidence/task-2-real-repo-count.txt

  Scenario: Returns undefined for non-git directory
    Tool: Bash
    Preconditions: /tmp is not a git repo
    Steps:
      1. Run: `bun -e "import { getGitUncommittedCount } from './src/ingest/git-status.ts'; const c = await getGitUncommittedCount('/tmp'); console.log('RESULT:', c)"`
    Expected Result: RESULT: undefined
    Failure Indicators: A number, or thrown error
    Evidence: .sisyphus/evidence/task-2-non-git-undefined.txt

  Scenario: Cache prevents repeated git spawns
    Tool: Bash
    Preconditions: Module loaded
    Steps:
      1. Run: `bun -e "
         import { getGitUncommittedCount } from './src/ingest/git-status.ts';
         const t1 = performance.now();
         await getGitUncommittedCount('$(pwd)');
         const t2 = performance.now();
         await getGitUncommittedCount('$(pwd)');
         const t3 = performance.now();
         console.log('FIRST:', (t2-t1).toFixed(1), 'ms');
         console.log('CACHED:', (t3-t2).toFixed(1), 'ms');
         console.log('CACHE_FASTER:', (t3-t2) < (t2-t1));
         "`
    Expected Result: CACHE_FASTER: true (second call significantly faster, <1ms vs first call)
    Failure Indicators: CACHE_FASTER: false, or both calls taking similar time
    Evidence: .sisyphus/evidence/task-2-cache-works.txt
  ```

  **Commit**: YES
  - Message: `feat(ingest): add git uncommitted changes count module`
  - Files: `src/ingest/git-status.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [ ] 3. Integrate git-status into multi-project.ts

  **What to do**:
  - Import `getGitUncommittedCount` from `../ingest/git-status` in `src/server/multi-project.ts`
  - In `getMultiProjectPayload()` (around line 153), after getting the snapshot from `store.getSnapshot()`, call `await getGitUncommittedCount(entry.projectRoot)` for each project
  - Add the result as `gitUncommittedCount` to the `ProjectSnapshot` object returned by `transformPayloadToSnapshot()` or set it directly on the snapshot after transformation
  - **Approach A (preferred)**: Add `gitUncommittedCount` parameter to `transformPayloadToSnapshot()` and pass it through. This keeps the transform function as the single place that builds ProjectSnapshot.
  - **Approach B (simpler)**: Assign `snapshot.gitUncommittedCount = count` after calling `transformPayloadToSnapshot()` in `getMultiProjectPayload()`.
  - Choose whichever is cleaner — both are valid. Approach A is more architecturally clean.
  - The git check is async but cached (30s). On cache hit it's essentially free (<1ms).

  **Must NOT do**:
  - Do NOT change the API response format — `gitUncommittedCount` flows through existing `ProjectSnapshot` type
  - Do NOT add error handling around the git call — the module already returns `undefined` on failure
  - Do NOT add logging for git status results
  - Do NOT call git-status anywhere other than multi-project.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small integration — 1 import, ~3-5 lines of code changes in one file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not a UI task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/server/multi-project.ts:68-115` — `transformPayloadToSnapshot()` builds the full `ProjectSnapshot` object. Either add `gitUncommittedCount` param here, or set it post-transform.
  - `src/server/multi-project.ts:153-175` — `getMultiProjectPayload()` loop where `entry.projectRoot` is available at line ~163. This is where to call `getGitUncommittedCount(entry.projectRoot)`.
  - `src/server/multi-project.ts:1-13` — Import block. Add new import here.

  **API/Type References**:
  - `src/ingest/git-status.ts` — `getGitUncommittedCount(projectRoot: string): Promise<number | undefined>` (from Task 2)
  - `src/types.ts:82-110` — `ProjectSnapshot` with new `gitUncommittedCount?: number` field (from Task 1)

  **WHY Each Reference Matters**:
  - `transformPayloadToSnapshot` is the single function that constructs `ProjectSnapshot` — integration must go through here
  - `getMultiProjectPayload` has access to `entry.projectRoot` which is needed as the argument to `getGitUncommittedCount`
  - The import block shows existing import pattern to follow

  **Acceptance Criteria**:
  - [ ] `getGitUncommittedCount` imported and called in multi-project.ts
  - [ ] `ProjectSnapshot` objects returned by API include `gitUncommittedCount` field
  - [ ] `bun run build` succeeds
  - [ ] `curl http://localhost:4301/api/projects` response includes `gitUncommittedCount` in project objects

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: API returns gitUncommittedCount in project data
    Tool: Bash
    Preconditions: Dev server running (bun run dev)
    Steps:
      1. Start dev server if not running: `bun run dev &` (wait 3s)
      2. Run: `curl -s http://localhost:4301/api/projects | bun -e "const d = await Bun.stdin.json(); const p = d.projects?.[0]; console.log('HAS_FIELD:', 'gitUncommittedCount' in (p || {})); console.log('VALUE:', p?.gitUncommittedCount); console.log('TYPE:', typeof p?.gitUncommittedCount)"`
    Expected Result: HAS_FIELD: true, VALUE: <number or undefined>, TYPE: number (if git repo) or undefined
    Failure Indicators: HAS_FIELD: false, or API error, or field missing entirely
    Evidence: .sisyphus/evidence/task-3-api-has-field.txt

  Scenario: Build passes with integration
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete
    Steps:
      1. Run: `bun run build`
      2. Check exit code is 0
    Expected Result: Build succeeds with zero errors
    Failure Indicators: Type errors, import errors, build failure
    Evidence: .sisyphus/evidence/task-3-build-passes.txt
  ```

  **Commit**: YES
  - Message: `feat(server): integrate git uncommitted count into project snapshots`
  - Files: `src/server/multi-project.ts`
  - Pre-commit: `bun run build`

- [ ] 4. Add git changes badge to ProjectStrip UI

  **What to do**:
  - In `src/ui/components/ProjectStrip.tsx`:
    - Destructure `gitUncommittedCount` from `project` (around line 53 where other fields are destructured)
    - Add badge element AFTER the `.strip-agent-badge` span (around line 153) and BEFORE the plan-slot section
    - Badge JSX: `{gitUncommittedCount != null && gitUncommittedCount > 0 && (<span className="strip-git-badge" title={`${gitUncommittedCount} uncommitted git change${gitUncommittedCount === 1 ? '' : 's'}`}>{gitUncommittedCount > 999 ? '999+' : gitUncommittedCount} uncommitted</span>)}`
    - Only render when count > 0. When undefined (git unavailable) or 0 (clean), show nothing.
  
  - In `src/ui/components/ProjectStrip.css`:
    - Add `.strip-git-badge` class following `.strip-agent-badge` pattern:
      ```css
      .strip-git-badge {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--sp-2);
        height: 18px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--accent-warning) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent-warning) 40%, transparent);
        font-family: var(--font-mono);
        font-size: var(--font-xs);
        color: var(--accent-warning);
        white-space: nowrap;
        flex-shrink: 0;
      }
      ```
    - Add density overrides matching `.strip-agent-badge`:
      - `[data-density="dense"] .strip-git-badge` — height: 16px, font-size: 0.6rem
      - `[data-density="ultra-dense"] .strip-git-badge` — height: 14px, padding: 0 var(--sp-1), font-size: 0.55rem

  **Must NOT do**:
  - Do NOT add click handlers or expand behavior
  - Do NOT show file names or details
  - Do NOT add branch name
  - Do NOT add any new CSS custom properties — use existing tokens
  - Do NOT add animation or transitions to the badge
  - Do NOT conditionally hide via stripConfig — always show when count > 0

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component modification with CSS styling — needs visual attention
  - **Skills**: [`playwright`]
    - `playwright`: Needed for browser-based QA verification of the badge rendering
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Overkill for a single badge addition
    - `dev-browser`: playwright skill is more appropriate for QA

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: None
  - **Blocked By**: Task 1 (needs type for destructuring)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:145-167` — Header section layout. Badge goes after agent badge (line 153), before plan-slot.
  - `src/ui/components/ProjectStrip.tsx:53` — Destructuring line: `const { mainSession, planProgress, backgroundTasks, tokenUsage, lastUpdatedMs } = project` — add `gitUncommittedCount`
  - `src/ui/components/ProjectStrip.css:236-249` — `.strip-agent-badge` styles — copy this pattern for `.strip-git-badge`
  - `src/ui/components/ProjectStrip.css:520-523` — Dense mode override for agent badge — replicate for git badge
  - `src/ui/components/ProjectStrip.css:545-549` — Ultra-dense override — replicate for git badge

  **API/Type References**:
  - `src/types.ts` — `ProjectSnapshot.gitUncommittedCount?: number` (from Task 1)

  **External References**:
  - `src/styles/tokens.css` — `--accent-warning: #ffa502` — the orange color for the badge

  **WHY Each Reference Matters**:
  - The header layout determines exact badge placement — must go between agent badge and plan slot
  - `.strip-agent-badge` is the canonical pill badge pattern — new badge must match dimensions and spacing
  - Density overrides are required or badge will look oversized in dense/ultra-dense modes
  - `--accent-warning` is the existing orange token — reuse, don't invent new colors

  **Acceptance Criteria**:
  - [ ] Badge renders in ProjectStrip header when `gitUncommittedCount > 0`
  - [ ] Badge hidden when `gitUncommittedCount` is `undefined` or `0`
  - [ ] Badge shows "999+" for counts > 999
  - [ ] Badge has orange/amber color using `--accent-warning` token
  - [ ] Badge matches height/border-radius of `.strip-agent-badge` (18px / 9px)
  - [ ] Badge has title attribute with full count and "uncommitted" text
  - [ ] Density modes (dense, ultra-dense) properly resize the badge
  - [ ] `bun run build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Badge visible in dashboard for project with uncommitted changes
    Tool: Playwright
    Preconditions: Dev server running with at least one project that has uncommitted changes
    Steps:
      1. Navigate to http://localhost:4300
      2. Wait for dashboard to load (wait for selector `.project-strip`)
      3. Look for `.strip-git-badge` element inside any `.project-strip`
      4. If found: assert text contains a number, assert element has orange-ish color
      5. Screenshot the project strip header area
    Expected Result: At least one `.strip-git-badge` element visible with numeric text content
    Failure Indicators: No `.strip-git-badge` elements found, or text is empty/NaN
    Evidence: .sisyphus/evidence/task-4-badge-visible.png

  Scenario: Badge not rendered for clean repos (or when git unavailable)
    Tool: Bash
    Preconditions: Build complete
    Steps:
      1. Run: `bun run build`
      2. Search built output for strip-git-badge class: `grep -c "strip-git-badge" dist/assets/*.js`
      3. Verify the conditional render: `grep "gitUncommittedCount" src/ui/components/ProjectStrip.tsx`
    Expected Result: Class exists in bundle. Source shows conditional render (null check + > 0 check)
    Failure Indicators: Badge always rendered, or condition missing
    Evidence: .sisyphus/evidence/task-4-conditional-render.txt

  Scenario: Badge styling matches agent badge pattern
    Tool: Playwright
    Preconditions: Dev server running, badge visible
    Steps:
      1. Navigate to http://localhost:4300
      2. Query `.strip-git-badge` element
      3. Get computed styles: height, border-radius, font-family
      4. Assert height is 18px, border-radius is 9px, font-family contains monospace
      5. Query `.strip-agent-badge` for comparison
      6. Assert both have same height and border-radius
    Expected Result: Git badge matches agent badge dimensions (18px height, 9px border-radius, monospace font)
    Failure Indicators: Mismatched dimensions, wrong font, or missing badge
    Evidence: .sisyphus/evidence/task-4-badge-style-match.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add git uncommitted changes badge to ProjectStrip`
  - Files: `src/ui/components/ProjectStrip.tsx`, `src/ui/components/ProjectStrip.css`
  - Pre-commit: `bun run build`

- [ ] 5. Unit tests for git-status module

  **What to do**:
  - Create `src/__tests__/git-status.test.ts`
  - Test suite using Vitest (describe/it/expect/vi pattern)
  - Mock `Bun.spawn` using `vi.spyOn(Bun, 'spawn')` or module-level mock
  - **Test cases**:
    1. **Returns count from git status output**: Mock spawn to return 3-line porcelain output → expect count 3
    2. **Returns 0 for clean repo**: Mock spawn to return empty stdout → expect count 0
    3. **Returns undefined on git failure**: Mock spawn to return non-zero exit code → expect undefined
    4. **Returns undefined on timeout**: Mock spawn with a never-resolving stdout, verify timeout triggers → expect undefined
    5. **Cache returns previous value within TTL**: Call twice rapidly, verify spawn called only once
    6. **Cache expires after TTL**: Call, advance time past 30s (vi.advanceTimersByTime), call again, verify spawn called twice
  - Use `vi.useFakeTimers()` for cache TTL tests
  - Use `beforeEach` to clear module-level cache between tests (may need to export a `_clearCacheForTesting()` helper or re-import module)

  **Must NOT do**:
  - Do NOT test with real git subprocess (unit tests must be fast and deterministic)
  - Do NOT test UI rendering (that's Task 4's QA)
  - Do NOT add test utilities to production code (testing helpers go in test file)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard Vitest test file following existing patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not a browser test

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `src/__tests__/multi-project.test.ts` — Test file pattern: vi.mock at top, fixture helpers, describe/it structure
  - `src/__tests__/` — All 5 existing test files for consistent naming and structure conventions

  **API/Type References**:
  - `src/ingest/git-status.ts` — Module under test (from Task 2): `getGitUncommittedCount`, `GIT_STATUS_CACHE_TTL_MS`

  **External References**:
  - Vitest docs: `vi.spyOn`, `vi.useFakeTimers`, `vi.advanceTimersByTime` for mocking and timer control

  **WHY Each Reference Matters**:
  - multi-project.test.ts shows the established mocking pattern (vi.mock before imports) — follow this exactly
  - The module exports determine what's testable — cache TTL constant enables time-based assertions

  **Acceptance Criteria**:
  - [ ] File exists: `src/__tests__/git-status.test.ts`
  - [ ] `bun run test` passes all new tests (6 test cases minimum)
  - [ ] All existing tests still pass (no regressions)
  - [ ] Tests mock Bun.spawn (no real subprocess calls)
  - [ ] Cache behavior verified with fake timers

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All git-status tests pass
    Tool: Bash
    Preconditions: Tasks 2 and 3 complete
    Steps:
      1. Run: `bun run test -- --reporter=verbose 2>&1`
      2. Check for git-status test results in output
      3. Verify all tests pass
    Expected Result: 6+ tests pass in git-status.test.ts, 0 failures
    Failure Indicators: Any test failure, or test file not found
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt

  Scenario: No regression in existing tests
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. Run: `bun run test 2>&1`
      2. Check total test count and pass/fail
    Expected Result: All ~32+ tests pass (26 existing + 6 new), 0 failures
    Failure Indicators: Any existing test now failing
    Evidence: .sisyphus/evidence/task-5-no-regression.txt
  ```

  **Commit**: YES
  - Message: `test(ingest): add unit tests for git-status module`
  - Files: `src/__tests__/git-status.test.ts`
  - Pre-commit: `bun run test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit` + `bun run build` + `bun run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify git-status.ts has proper error handling (no thrown exceptions reaching caller).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: API returns gitUncommittedCount AND badge renders it. Test edge cases: project with no git repo, clean repo (badge hidden), dirty repo (badge visible). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance per task. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify NO file list display, NO click handlers, NO branch name, NO staged/unstaged breakdown.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message | Files | Pre-commit Check |
|-------|---------|-------|------------------|
| 1 | `feat(types): add gitUncommittedCount to ProjectSnapshot` | `src/types.ts` | `bunx tsc --noEmit` |
| 2 | `feat(ingest): add git uncommitted changes count module` | `src/ingest/git-status.ts` | `bunx tsc --noEmit` |
| 3 | `feat(server): integrate git uncommitted count into project snapshots` | `src/server/multi-project.ts` | `bun run build` |
| 4 | `feat(ui): add git uncommitted changes badge to ProjectStrip` | `src/ui/components/ProjectStrip.tsx`, `ProjectStrip.css` | `bun run build` |
| 5 | `test(ingest): add unit tests for git-status module` | `src/__tests__/git-status.test.ts` | `bun run test` |

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit        # Expected: 0 errors
bun run build            # Expected: exit 0
bun run test             # Expected: all tests pass (32+)
curl -s localhost:4301/api/projects | jq '.projects[0].gitUncommittedCount'  # Expected: number or null
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent from codebase
- [ ] All 5 tasks complete with evidence in `.sisyphus/evidence/`
- [ ] All 4 final verification agents APPROVE
- [ ] Zero TypeScript errors, zero test failures
- [ ] Badge visible in collapsed ProjectStrip for dirty repos
- [ ] Badge hidden for clean repos and non-git directories
