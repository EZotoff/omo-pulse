# Supervisor Attention Projection Consumption (Seam 4 → omo-pulse attention view)

## TL;DR

> **Quick Summary**: Make omo-pulse a read-only AMBIENT/VISUAL consumer of the supervisor's attention projection (`~/.local/state/opencode-supervisor/queue.json` + `status.json`), surfacing supervisor escalations as cards in the focus remote alongside the existing session-state attention — per Seam 4 of the portable-supervisor contract.
>
> **Deliverables**:
> - `src/ingest/supervisor-queue.ts` — read-only reader for the supervisor attention projection (schemaVersion 1, additive-tolerant, fail-soft)
> - `GET /api/supervisor/queue` — Hono route exposing the projection to the UI
> - `useSupervisorQueue` hook + Escalations section in the focus remote UI
> - Unit + e2e coverage; live-service verification against the real projection
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves + final verification
> **Critical Path**: Task 1 → Task 2 → Task 4 → F1-F4 → user okay

---

## Context

### Original Request
Handoff step 6 of `handoff-sse-realtime-complete-2026-09-23.md`: "Longer horizon (Portable Supervisor prototype, contract-first per ~/ez-omo-config/docs/portable-supervisor-contract.md): attention queue / escalations from the supervisor ledger into omo-pulse." Operator authorized with "proceed". This is exactly the contract's pending-work row: **"Attention projection consumption (Seam 4 read → attention view) | omo-pulse | not started"**.

### Interview Summary
**Key Discussions** (operator delegated design via "proceed"; decisions recorded here):
- **No contract change needed**: Seam 4's consumption schema is already defined in the contract ("the schema above is that definition"). This is dash-side implementation only — no ez-omo-config or voice-bridge edits.
- **Read transport**: direct filesystem read (omo-pulse runs on the same host as the supervisor; OC Beacon uses the OpenCode file-read API only because it is remote). Read-only, per the contract's "Consumers must never write these files".
- **Surface choice**: extend the focus remote (FocusRemote) with an Escalations section rather than a new top-level view — the contract classifies omo-pulse attention cards as the AMBIENT/VISUAL channel (non-exclusive dwell, no presentation leases), and the focus remote is already the operator's attention surface.

**Research Findings**:
- Live projection exists and is populated: `~/.local/state/opencode-supervisor/queue.json` (`schemaVersion: 1`, items with `id: "att_…"`, `decisionKey`, `kind`, `origin.decision.{action,rationale,citations}`, `target.{root,sessionID,sessionTitle}`, lifecycle), `status.json` (`queueDepths` per root, `modes`, `rootHealth`), `ledger.jsonl` (append-only history).
- omo-pulse already has a session-state attention pipeline (`src/ingest/attention.ts`, `GET /api/attention`, `useAttention`, FocusRemote) — the supervisor queue is a complementary source (cross-session supervisor escalations), not a replacement.
- Repo conventions: types in `src/types.ts`, hooks with explicit return types in `src/ui/hooks/`, plain co-located CSS, no new runtime deps, read-only observer pattern everywhere.

### Metis Review
**Identified Gaps** (addressed):
- **Supervisor absent on other installs**: reader must fail soft (empty + `source: "unavailable"`); UI hides the section when empty; never surfaces an error to the operator as a failure state.
- **Unknown/additive fields**: schemaVersion 1 is additive-only per contract — reader must tolerate unknown `actionClass`/`escalationKind`/lifecycle values (pass through as strings, render raw) and unknown item fields (drop silently).
- **Future schemaVersion 2**: contract ships breaking changes as v2 with dual-write. Reader accepts `schemaVersion: 1` items; on a different top-level version, return items only if per-item `schemaVersion === 1` (per-item check is the robust read).
- **Large queue**: render is capped (top 8 after explicit display ordering — see Task 4; queue.json is insertion-ordered and NOT priority-ordered, so cap applies after sort, never to raw file order).
- **No write path**: reader opens files read-only; no code path writes to the supervisor state dir (contract guardrail, also repo observer pattern).
- **Stale file / wedged supervisor**: expose `status.json.lastReconcile` + file mtime so the UI can show age; do NOT invent staleness retirement client-side (supervisor owns lifecycle).

### Momus High-Accuracy Review
**Round 3 — OKAY** (bg_140b761a, 2026-09-23): "The plan is executable: its references are relevant, and each task has concrete QA steps and expected results. The revised reader and UI instructions account for insertion-ordered files containing resolved items; Task 4's fixture-driven e2e now asserts an open, non-snoozed item rather than a resolved live item."

**Round 2 — REJECT** (bg_c783fd38, 2026-09-23): one residual QA assertion — Task 4's happy-path e2e asserted the FIRST live item's question, but that item is resolved and the (correct) implementation hides it. **Resolution**: e2e is now fixture-driven and deterministic (1 open + 1 resolved + 1 snoozed fixture item; asserts exactly the open one renders and the others don't), plus a non-blocking live-consistency smoke.

**Round 1 — REJECT** (bg_71927ca4, 2026-09-23): blocking issue — plan assumed `queue.json` file order is priority order and that all items are open. Verified false: the supervisor writer persists in insertion order (`supervisor/src/queue.ts:419`) and the live file contains resolved/answered items (11 items, 7 open). **Resolution**: Task 1 now derives per-item `lifecycleState`/`isResolved` from the item's lifecycle array (terminal = `resolved` with disposition / `answered`; unknown states additive-tolerant as open) and parses `priority` inputs; Task 4 now filters to open, non-snoozed (`notBefore`) items and applies an explicit display ordering (urgency → stakes → confidence → oldest-first). Guardrails updated: file-order assumption removed, display-order-vs-lifecycle-mutation boundary stated.

---

## Work Objectives

### Core Objective
Surface the supervisor's open attention items (escalations) inside omo-pulse's attention view as a read-only ambient channel consumer, per Seam 4 of the portable-supervisor contract.

### Concrete Deliverables
- `src/ingest/supervisor-queue.ts` — `readSupervisorQueueProjection()` returning `{ ok: true, items, status?, readAtMs } | { ok: false, reason }`
- Types in `src/types.ts`: `SupervisorQueueItem`, `SupervisorQueuePayload`
- `GET /api/supervisor/queue` route in `src/server/api.ts`
- `src/ui/hooks/useSupervisorQueue.ts` — polling hook (5s, abort-safe, keeps last-good on error)
- Escalations section in `src/ui/components/FocusRemote.tsx` (+ co-located CSS) with deep-links into the dashboard for the target project/session
- Unit tests (reader + route) and a Playwright e2e scenario

### Definition of Done
- [ ] `bun run test` passes with new tests (reader, route) — 0 failures
- [ ] `bunx tsc --noEmit` → 0 errors
- [ ] `curl http://127.0.0.1:4300/api/supervisor/queue` returns live items from the real projection (or `source: "unavailable"` if empty)
- [ ] FocusRemote renders the Escalations section from the live projection (e2e + screenshot evidence)
- [ ] No code path writes under the supervisor state dir (grep + test assertion)

### Must Have
- Read-only consumption in contract priority order (queue.json primary; status.json for depths/modes telemetry only)
- schemaVersion 1 handling with additive tolerance (unknown fields dropped, unknown enum values passed through as strings)
- Fail-soft: missing dir / corrupt JSON / wrong shape → `ok: false`, never a thrown error reaching a route
- Deep-link from an escalation card to the target project (and session when mapped) in the dashboard
- Polling hook that keeps last-good data on fetch failure and aborts in-flight requests on unmount

### Must NOT Have (Guardrails)
- **No writes** to `~/.local/state/opencode-supervisor/**` — consumer is read-only (contract)
- No lifecycle MUTATION client-side — the supervisor owns item lifecycle (propose/resolve/defer); omo-pulse only FILTERS (resolved/answered/snoozed items hidden) and ORDERS for display. Display ordering is a UI concern and never written back
- No assumed file ordering: queue.json is insertion-ordered and contains terminal (resolved/answered) items (verified 2026-09-23) — selection of open items is by lifecycle state, ordering is an explicit documented rule (Task 4)
- No contract/vocabulary edits (ez-omo-config) and no voice-bridge changes in this plan
- No new runtime dependencies
- No parsing of `[Supervisor]` console sessions (contract rule — ledger/projection files only)
- Do not modify `vite.config.ts` or the build pipeline
- Do not remove or alter the existing session-state attention pipeline (`/api/attention` stays as is)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest unit + Playwright e2e; `bun run test`, `tests/e2e/`)
- **Automated tests**: TDD for the reader module (RED→GREEN), tests-after for route/hook/UI wiring
- **Framework**: Vitest (unit), Playwright (e2e), curl (live API)

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Library/Module**: Use Bash (bun/vitest) — import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Supervisor queue reader + types (TDD) [deep]
└── Task 2: GET /api/supervisor/queue route + test (depends: T1) [unspecified-high]

Wave 2 (After Wave 1 — UI):
├── Task 3: useSupervisorQueue hook + test (depends: T1) [unspecified-high]
└── Task 4: FocusRemote Escalations section + e2e (depends: T3, T2) [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Real manual QA
└── Task F4: Scope fidelity check
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4 → F1-F4 → user okay
Parallel Speedup: ~35% vs sequential
Max Concurrent: 2
```

### Dependency Matrix (show ALL tasks)

- **Task 1**: [blocked by none] - [blocks T2, T3], wave 1
- **Task 2**: [blocked by T1] - [blocks T4], wave 1
- **Task 3**: [blocked by T1] - [blocks T4], wave 2
- **Task 4**: [blocked by T2, T3] - [blocks F1-F4], wave 2

### Agent Dispatch Summary

- **Wave 1**: **2** - T1 → `deep`, T2 → `unspecified-high`
- **Wave 2**: **2** - T3 → `unspecified-high`, T4 → `visual-engineering`
- **Wave FINAL**: **4** - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.

<!-- TASKS APPENDED BELOW -->

- [x] 1. Supervisor attention projection reader + types (TDD)

  **What to do**:
  - Add types to `src/types.ts`: `SupervisorQueueItem` (id, version?, decisionKey, kind, actionClass?, escalationKind?, question?, rationale?, citations?: Array<{session, messageID, quote}>, target?: {root, sessionID?, sessionTitle?}, priority?: {stakes?: number, urgency?: number, confidence?: number, freshness?: number, createdAt?: string, notBefore?: string}, lifecycleState: string, isResolved: boolean, raw lifecycle kept out of the public type), `SupervisorQueueStatus` (lastReconcile?, queueDepths?: Record<string,number>, modes?: Record<string,string>), `SupervisorQueuePayload` (items, status: SupervisorQueueStatus | null, readAtMs, source: "queue.json" | "unavailable"). Additive tolerance: parse unknown enum values as plain strings; never reject an item for unknown fields.
  - Create `src/ingest/supervisor-queue.ts` with:
    - `supervisorStateDir()` — resolves `process.env.OMO_PULSE_SUPERVISOR_STATE_DIR` or default `~/.local/state/opencode-supervisor` (honor `XDG_STATE_HOME` for the `~/.local/state` default, mirroring `src/ingest/paths.ts` conventions).
    - `readSupervisorQueueProjection()` — reads `queue.json` then `status.json`; validates top-level shape (`items` array, per-item `schemaVersion === 1`, skip others); derives per-item `lifecycleState` = the `state` of the LAST entry of the item's `lifecycle` array (verified live values: `proposed`/`revalidated`/`surfaced`/`deferred` = open; `resolved` with `disposition` (superseded/propagated/…) and `answered` = terminal) and `isResolved` = terminal-state flag; parses `priority` numerically when present (stakes/urgency/confidence/freshness numbers; createdAt/notBefore ISO strings passed through). Returns `{ ok: true, items, status, readAtMs }` with `status: null` when status.json is absent/corrupt; returns `{ ok: false, reason: "absent" | "corrupt" | "shape" }` on missing dir / parse error / non-object. Read-only file access only; never mkdir or write; no throw escapes.
    - KNOWN FILE FACTS (verified against the live projection 2026-09-23, must hold in fixtures): `queue.json` item order is INSERTION order, NOT priority order; the file CONTAINS resolved/answered items alongside open ones (live: 11 items, 7 open `revalidated`). Consumers MUST therefore filter by lifecycle state — never assume file order or file completeness. Unknown lifecycle states are additive-tolerant: classify as open (not resolved) and pass the raw string through for display.
  - Tests FIRST in `src/__tests__/supervisor-queue.test.ts` with fixtures under `src/__tests__/fixtures/supervisor/` (happy queue.json modeled on the real file's shape INCLUDING a resolved and an answered item next to open ones; corrupt JSON; missing dir; status.json absent; unknown extra item fields tolerated; unknown lifecycle state treated as open; per-item schemaVersion != 1 skipped; env override respected via beforeEach/afterEach on `process.env`).

  **Must NOT do**:
  - No writes of any kind under the supervisor state dir (no mkdir, no temp files).
  - No re-ranking, confidence filtering, or lifecycle decisions client-side.
  - No dependency on `ledger.jsonl` in this task.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD module with a fail-soft edge-case matrix; autonomous red-green discipline.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `programming`: repo conventions are fully documented in AGENTS.md files.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (alone)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/ingest/attention.ts:1-30` - module-doc style: consumption rules documented up top; mirror it.
  - `src/ingest/storage-backend.ts:35-53` (`withReadonlyDb`) - readonly access + classified failure result pattern (`{ok, reason}`).
  - `src/ingest/sources-registry.ts:68-82` (`loadRegistry`) - JSON file read → validate shape → fallback on corrupt.
  - `src/ingest/paths.ts` - XDG/path resolution helpers; reuse where they exist.

  **API/Type References** (contracts to implement against):
  - `~/ez-omo-config/docs/portable-supervisor-contract.md` lines 163-184 ("Attention projection (consumption contract)") - normative schema + versioning: additive-only v1, consumers never write.
  - `~/.local/state/opencode-supervisor/queue.json` - live file; fixture must mirror real field names (id/version/decisionKey/kind/origin.decision.{action,rationale,citations}/target.{root,sessionID,sessionTitle}).
  - `src/types.ts:311-341` - place new types after the existing Attention* block.

  **Test References** (testing patterns to follow):
  - `src/__tests__/multi-project-realtime.test.ts:6-30` - hoisted setup + fixture-loading patterns.

  **WHY Each Reference Matters**:
  - The reader must behave consistently with the contract and the live file OC Beacon already consumes; field names come from the real queue.json, not invention.

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `src/__tests__/supervisor-queue.test.ts` (RED first, then GREEN)
  - [ ] `bunx vitest run src/__tests__/supervisor-queue.test.ts` → PASS (≥7 tests, 0 failures)

  **QA Scenarios (MANDATORY - task is INCOMPLETE without these):**

  ```
  Scenario: Happy path - live projection parses
    Tool: Bash (bun one-liner)
    Preconditions: real projection exists at ~/.local/state/opencode-supervisor/queue.json
    Steps:
      1. `bun -e 'import {readSupervisorQueueProjection} from "./src/ingest/supervisor-queue.ts"; console.log(JSON.stringify(readSupervisorQueueProjection()).slice(0,400))'`
      2. Assert output contains `"ok":true`; if the live queue has items, an id starting with `att_`
    Expected Result: ok:true, items array (possibly empty)
    Failure Indicators: ok:false with reason "shape" on the real file (schema mismatch)
    Evidence: .sisyphus/evidence/task-1-happy-live.json

  Scenario: Corrupt file fails soft
    Tool: Bash (bun one-liner with env override)
    Preconditions: fixture dir with invalid JSON queue.json
    Steps:
      1. `OMO_PULSE_SUPERVISOR_STATE_DIR=<fixture-dir> bun -e '...readSupervisorQueueProjection()...'`
      2. Assert `{"ok":false,"reason":"corrupt"}` and no exception
    Expected Result: ok:false, reason "corrupt", exit 0
    Failure Indicators: unhandled JSON parse error / non-zero exit
    Evidence: .sisyphus/evidence/task-1-corrupt.json
  ```

  **Evidence to Capture:**
  - [ ] task-1-happy-live.json, task-1-corrupt.json

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(ingest): read-only supervisor attention projection reader`
  - Files: `src/ingest/supervisor-queue.ts`, `src/types.ts`, `src/__tests__/supervisor-queue.test.ts`, `src/__tests__/fixtures/supervisor/*`
  - Pre-commit: `bunx vitest run src/__tests__/supervisor-queue.test.ts`

- [x] 2. GET /api/supervisor/queue route

  **What to do**:
  - In `src/server/api.ts` (inside `createApi`): add `GET /supervisor/queue` calling `readSupervisorQueueProjection()`; 200 `{ ok: true, ...payload }` on ok; 503 `{ ok: false, error: "absent" }` when the supervisor state dir is absent; 500 `{ ok: false, error }` for "corrupt"/"shape".
  - Test in `src/__tests__/api-supervisor-queue.test.ts` mirroring `src/__tests__/api-events.test.ts`: mock the reader module, assert passthrough + status codes (ok / absent / corrupt).

  **Must NOT do**:
  - No caching layer beyond the reader (small file, low-traffic route).
  - No merging into `/api/attention` — separate schemas, separate route.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: single-file route + test wiring; moderate care, no deep research.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/server/api.ts:82-141` (GET /events) - route registration order + custom response shape.
  - `src/server/api.ts:227-243` (GET /projects) - async route + JSON error shape `{ ok:false, error }`.
  - `src/server/api.ts:154-157` (onError) - global handler; route needs no own try/catch.

  **API/Type References** (contracts to implement against):
  - `src/types.ts` `SupervisorQueuePayload` (from Task 1) - response body type.
  - `src/server/AGENTS.md` - "NEVER add routes outside createApi()"; error shape `{ ok:false, error:string }`.

  **Test References** (testing patterns to follow):
  - `src/__tests__/api-events.test.ts` - API route test structure (createApi with mocks, fetch the Hono app, assert JSON).

  **WHY Each Reference Matters**:
  - Route must sit inside createApi and follow the established error shape; executors without context need the exact in-file anchors above.

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `src/__tests__/api-supervisor-queue.test.ts`
  - [ ] `bunx vitest run src/__tests__/api-supervisor-queue.test.ts` → PASS (≥3 tests)

  **QA Scenarios (MANDATORY - task is INCOMPLETE without these):**

  ```
  Scenario: Live route returns projection
    Tool: Bash (curl)
    Preconditions: server running with Task 1 merged
    Steps:
      1. `curl -s http://127.0.0.1:4300/api/supervisor/queue | head -c 300`
      2. Assert JSON has `"ok":true` and an `items` key
    Expected Result: HTTP 200, ok:true
    Failure Indicators: 404 (route not registered) or 5xx
    Evidence: .sisyphus/evidence/task-2-route-live.json

  Scenario: Absent projection → 503
    Tool: Bash (curl against server with env override)
    Preconditions: `OMO_PULSE_SUPERVISOR_STATE_DIR=/tmp/opencode/empty-dir` on a test server instance
    Steps:
      1. `curl -s -o /dev/null -w "%{http_code}" .../api/supervisor/queue`
      2. Assert 503 and body contains `"error"`
    Expected Result: 503 with ok:false
    Failure Indicators: 500 with stack trace, or 200 conflating absent with empty
    Evidence: .sisyphus/evidence/task-2-route-absent.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-route-live.json, task-2-route-absent.txt

  **Commit**: YES
  - Message: `feat(server): expose supervisor attention queue via /api/supervisor/queue`
  - Files: `src/server/api.ts`, `src/__tests__/api-supervisor-queue.test.ts`
  - Pre-commit: `bun run test`

- [x] 3. useSupervisorQueue polling hook

  **What to do**:
  - Create `src/ui/hooks/useSupervisorQueue.ts`: polls `GET /api/supervisor/queue` every 5s with `setTimeout`-scheduling + `AbortController` (mirror `useDashboardData`'s loop structure exactly); keeps last-good payload on fetch failure (never nulls data); returns `{ queue: SupervisorQueuePayload | null, available: boolean }` with an explicit return type; `available` is false while null or after an `ok:false` response, so the UI can hide the section.
  - Hook test `src/__tests__/use-supervisor-queue.test.ts` following the existing hook-test setup used in the repo (mock fetch; assert: parses payload, keeps last-good on failure, available=false on ok:false). If no hook-test precedent exists in this repo, test the hook via `renderHook` from `@testing-library/react` only if already a dependency — otherwise cover the polling contract through the route test and mark UI verification via Playwright in Task 4 (do NOT add new devDependencies without approval).

  **Must NOT do**:
  - No new devDependencies (no @testing-library if absent).
  - No SSE subscription — 5s poll is enough for an ambient surface; do not touch the realtime bus.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: single hook + careful async lifecycle; moderate scope.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4's non-hook files; practically sequential before T4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/ui/hooks/useDashboardData.ts` - THE pattern: setTimeout loop (not setInterval), AbortController, connectedRef-style ref to avoid stale closures, keeps stale data on error. Copy the lifecycle skeleton.
  - `src/ui/hooks/useAttention.ts` - return-type shape precedent for an attention-flavored hook.
  - `src/ui/hooks/AGENTS.md` - hook conventions (explicit return types, localStorage pattern N/A here).

  **API/Type References** (contracts to implement against):
  - `GET /api/supervisor/queue` response (Task 2) - `{ ok, items, status, readAtMs, source }`.

  **Test References** (testing patterns to follow):
  - Existing vitest setup in `src/__tests__/`; check for any existing hook tests before choosing the strategy above.

  **WHY Each Reference Matters**:
  - useDashboardData encodes the repo's polling/abort/last-good doctrine; diverging from it risks the exact stale-closure bugs its comments warn about.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY - task is INCOMPLETE without these):**

  ```
  Scenario: Hook surfaces live payload
    Tool: Bash (curl) - contract-level check the hook consumes
    Preconditions: server running
    Steps:
      1. `curl -s http://127.0.0.1:4300/api/supervisor/queue | jq '.ok, (.items | length)'`
      2. Assert ok=true and a numeric length
    Expected Result: hook's data source is well-formed
    Failure Indicators: non-JSON or ok:false
    Evidence: .sisyphus/evidence/task-3-payload.json

  Scenario: Failure keeps last-good (unit-level if hook test exists, else route-level)
    Tool: Bash (vitest run)
    Preconditions: test file created
    Steps:
      1. `bunx vitest run src/__tests__/use-supervisor-queue.test.ts` (or the route test as fallback)
      2. Assert no unhandled rejection on fetch failure
    Expected Result: PASS
    Failure Indicators: unhandled rejection / crash
    Evidence: .sisyphus/evidence/task-3-failure.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-payload.json, task-3-failure.txt

  **Commit**: YES
  - Message: `feat(ui): useSupervisorQueue polling hook`
  - Files: `src/ui/hooks/useSupervisorQueue.ts`, test file
  - Pre-commit: `bun run test`

- [x] 4. FocusRemote Escalations section (UI + e2e)

  **What to do**:
  - In `src/ui/components/FocusRemote.tsx`: add an "Escalations" section above/beside the existing attention queue list. SELECTION: render only OPEN items — `isResolved === false` (last lifecycle state not `resolved`/`answered`; unknown states count as open per Task 1's additive rule) AND `priority.notBefore` absent or in the past (snoozed items hidden). ORDERING (display-only, documented): sort open items by `priority.urgency` desc → `priority.stakes` desc → `priority.confidence` desc → `priority.createdAt` asc (oldest first as final tiebreak); treat missing priority fields as lowest. Cap at the first 8 after sorting. Each card: alias/`Q<n>` or item id (short), target root basename (map root → project label via the existing attention projects when possible), `question` text (fallback: rationale excerpt, clamped ~160 chars), age from `priority.createdAt` (fallback: readAtMs age), and a deep-link to the target project in the dashboard (reuse FocusRemote's existing project navigation; session deep-link when target.sessionID maps to a known session).
  - Hide the entire section when `available` is false (supervisor absent → zero visual noise).
  - Co-located CSS in `src/ui/components/FocusRemote.css` (or its existing stylesheet) using design tokens from `src/styles/tokens.css` — no hardcoded rgba.
  - Playwright e2e in `tests/e2e/` (new spec or extend `dashboard.spec.ts`): with the live projection present, open the focus remote route, assert an escalation card renders with the expected question substring from the live queue.json, capture screenshot.

  **Must NOT do**:
  - No dismiss/defer/ack controls — the supervisor owns lifecycle; omo-pulse is read-only ambient.
  - No presentation-lease or dwell-pacing logic (Vox's channel).
  - No hardcoded rgba/colors — use tokens.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI section + styling + e2e; visual domain.
  - **Skills**: [`frontend`]
    - `frontend`: repo visual QA + design-token discipline.
  - **Skills Evaluated but Omitted**:
    - `dynamic-typography`: no type motion in scope.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2, Task 3

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/ui/components/FocusRemote.tsx` - the host component; section insertion point; existing card/list markup to visually match.
  - `src/ui/hooks/useAttention.ts` + `src/ui/components/FocusRemote.tsx` wiring - how an attention hook feeds this component today.
  - `src/styles/tokens.css` - the only color/spacing source.
  - `tests/e2e/dashboard.spec.ts` - Playwright spec structure, base URL, port randomization already handled.

  **API/Type References** (contracts to implement against):
  - `SupervisorQueueItem` (Task 1) - card field source; contract rationale: question text is the item's `question`, fallback `origin.decision.rationale`.
  - Contract Seam 4 channel classes (ez-omo-config doc, lines 137-144) - ambient/non-exclusive semantics; explains why cards are passive.

  **Test References** (testing patterns to follow):
  - `tests/e2e/dashboard.spec.ts` - selector + assertion + screenshot conventions.

  **WHY Each Reference Matters**:
  - FocusRemote is the operator's attention surface per the contract's interaction model; matching its markup/tokens keeps the prototype coherent and reviewable.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY - task is INCOMPLETE without these):**

  ```
  Scenario: Escalations render (fixture-driven, deterministic)
    Tool: Playwright
    Preconditions: server started with OMO_PULSE_SUPERVISOR_STATE_DIR pointing at a fixture dir whose queue.json contains exactly: 1 open item (question text "FIXTURE-OPEN-QUESTION-MARKER-XYZ", priority.urgency 4, no notBefore), 1 resolved item ("FIXTURE-RESOLVED-MARKER"), and 1 open item with notBefore in the future
    Steps:
      1. Navigate to the focus remote route (same route FocusRemote tests use)
      2. Assert a section with heading "Escalations" exists
      3. Assert exactly ONE escalation card; its text contains "FIXTURE-OPEN-QUESTION-MARKER-XYZ"
      4. Assert the resolved marker and the snoozed item do NOT appear anywhere in the section DOM
      5. Screenshot
    Expected Result: exactly the open, non-snoozed item rendered; terminal and snoozed items hidden
    Failure Indicators: resolved/snoozed markers present, zero cards, or section absent
    Evidence: .sisyphus/evidence/task-4-escalations.png

  Scenario: Live projection consistency (non-blocking smoke)
    Tool: Bash (curl) + python3
    Preconditions: prod server on :4300 with the real supervisor state dir
    Steps:
      1. `curl -s http://127.0.0.1:4300/api/supervisor/queue` → items
      2. Compute the open count from queue.json directly (lifecycle terminal-state filter)
      3. Assert the API response agrees with the implemented Task 1 contract (reader returns all items with lifecycleState/isResolved; UI filters) — counts must reconcile
    Expected Result: counts consistent with the documented rule
    Failure Indicators: API labeling resolved items as open, or count mismatch
    Evidence: .sisyphus/evidence/task-4-live-consistency.json

  Scenario: Absent supervisor hides section
    Tool: Playwright
    Preconditions: server with OMO_PULSE_SUPERVISOR_STATE_DIR pointing at an empty dir
    Steps:
      1. Navigate to focus remote route
      2. Assert NO "Escalations" heading in DOM
    Expected Result: section absent, rest of remote functional
    Failure Indicators: empty-section skeleton visible / error banner
    Evidence: .sisyphus/evidence/task-4-absent.png
  ```

  **Evidence to Capture:**
  - [ ] task-4-escalations.png, task-4-absent.png

  **Commit**: YES
  - Message: `feat(ui): supervisor escalations section in focus remote`
  - Files: `src/ui/components/FocusRemote.tsx`, CSS file, `src/ui/hooks/useSupervisorQueue.ts` (wiring touch if needed), e2e spec
  - Pre-commit: `bun run test`
---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the
> user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F4
> checked before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each
  "Must NOT Have": search the codebase for forbidden patterns (writes under the supervisor
  state dir, presentation-lease logic, new deps, contract-file edits) — reject with
  file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare
  deliverables vs plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit` + `bun run test`. Review changed files for `as any`/`@ts-ignore`,
  empty catches, stray logs, commented-out code, unused imports, AI slop.
  Output: `Build [PASS/FAIL] | Tests [N/N] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  From a clean state, execute EVERY QA scenario from EVERY task, capture evidence, test
  cross-task integration (live projection → API → UI) and edge cases (corrupt file, empty
  queue). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — nothing missing, nothing
  beyond spec. Check "Must NOT do" compliance and cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

Git commits: follow the active agent git workflow (this repo runs checkpoint/logical-task
commits). Task-level `**Commit**` lines below are YES — justified by the repo's
commit-reflex workflow. Conventional Commits, no pushes without explicit authorization
(the operator has an established PR-gated master).

---

## Success Criteria

### Verification Commands
```bash
bun run test                              # Expected: all pass (339 existing + new)
bunx tsc --noEmit                         # Expected: 0 errors
curl -s http://127.0.0.1:4300/api/supervisor/queue | head -c 300   # Expected: {"ok":true,...} with items from live projection
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass


## Execution Record
F#1: APPROVE — Must Have 5/5, Must NOT Have 8/8, Tasks 4/4; tsc 0 errors, unit 359/359, e2e 4/4; round-2 fix 9750424 verified (App.tsx:184/196/405, ProjectStrip.tsx:490, SessionSwimlane.tsx:178)
F#4: APPROVE — Tasks 4/4 compliant, Contamination CLEAN, Unaccounted CLEAN; 9750424 touches only 5 in-scope files, all four round-2 findings resolved line-level, e2e covers unknown/valid session
F#2: APPROVE — tsc 0 errors, bun run test 359/359, changed files clean (bg_eb92d928)
F#3: APPROVE — 5/5 scenarios pass: live API 200 ok:true, reader ok:true, live-consistency reconcile, Playwright remote-view heading+card, corrupt fail-soft (bg_869790ea, evidence .sisyphus/evidence/final-qa-supervisor/*)

F#4: APPROVE — deep-link remediation ba0bd99: dashboard consumes ?project/?session (App.tsx readDeepLinkParams, strip selection+scroll+highlight), e2e 3/3 pass incl. deep-link test, tsc+359 unit+build green
Execution baseline: 6bbb9ed
F#4: REJECT — deep-link params ignored: escalation cards link to /?view=dashboard&project=…&session=… but src/main.tsx/src/ui/App.tsx consume neither param, so cards do not navigate to the target project (FocusRemote.tsx buildEscalationViews).
Execution baseline: 6bbb9ed
F#2: APPROVE — bunx tsc --noEmit exit 0; bun run test 359/359; no as-any/ts-ignore/console.log/slop in 6bbb9ed..HEAD diff (1 advisory: unused readAtMs param, FocusRemote.tsx:68)
F#3: APPROVE — 5/5 scenarios, evidence .sisyphus/evidence/final-qa-supervisor/ (live API 200 ok att_* ids; reader ok:true; file-open 6 = API-unresolved 6; ESCALATIONS heading + 6 cards + live-remote.png; corrupt fixture → {ok:false,reason:corrupt} exit 0)
F#1: REJECT — Must Have [4/5]: deep-link unmet — FocusRemote.tsx:88-91 builds ?project=&session= but main.tsx/App.tsx consume neither (no URLSearchParams in src/ui/App.tsx); Must NOT Have [8/8 clean]: no supervisor-dir writes (test fixtures only), no lease logic, package.json diff empty, vite.config untouched
F#4: REJECT — re-verified at HEAD: prior deep-link finding stands (FocusRemote.tsx:81-83 admits params are documentation-only). Tasks [3/4 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN]F#1: APPROVE — re-audit of remediation ba0bd99: Must Have [5/5] (deep-link consumed: App.tsx readDeepLinkParams validates project vs data, strip selected+scrollIntoView+token highlight, session param set only when card maps a known session and surfaced as data-deeplink-session; unknown project ignored gracefully — e2e asserts it) | Must NOT Have [8/8] (commit touches only App/ProjectStrip/e2e; package.json diff empty; no supervisor-dir writes) | Tasks [4/4] | Evidence [10/10] incl task-4-deeplink.png. Prior REJECT bullets imposed a session-UI-selection requirement absent from plan text; plan-literal Must Have is met, corroborated by F#4 post-fix APPROVE.
F#4: APPROVE — final re-review at HEAD (ba0bd99): Tasks [4/4 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN]. Prior REJECT bullets reclassified advisory: (1) dashboard-side sessionTimeSeries re-validation is not in plan text (session mapping gated at FocusRemote.tsx:84-90, plan-literal Must Have met); (2) visibility/recent-limit exclusion is a beyond-plan enhancement. Fix resolves prior finding 1:1 (params consumed, App.tsx:156-188), no router/no deps (package.json+vite.config diffs empty), exactly 5 accounted commits 6bbb9ed..HEAD, e2e deep-link spec asserts the required DOM selection incl. unknown-param graceful ignore.
F#1: APPROVE — final re-review r2 of 9750424: Must Have [5/5] | Must NOT Have [8/8] (no supervisor-dir writes, package.json/vite.config untouched, tokens-only CSS) | Tasks [4/4] | Evidence [11/11] incl task-4-deeplink-r2.png; prior findings resolved 1:1 (session legend selected via data-deeplink-session-target + scroll App.tsx:193-197; unknown session nulled App.tsx:184; ProjectStrip.tsx:490 knownSession gate; displayProjects force-prepend App.tsx:414)
