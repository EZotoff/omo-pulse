# Dashboard V2: Bug Fixes + Feature Overhaul

## TL;DR

> **Quick Summary**: Fix 4 visual bugs in the Sparkline time-series rendering (wrong colors, missing background bars, overlapping elements, ugly styling) and implement 5 new features: UI project registration, multi-column DnD layout, config toggles for collapsed pane elements, per-session activity swimlanes, and configurable sound notifications.
>
> **Deliverables**:
> - Fixed mini sparkline with per-agent colors (red for Prometheus, etc.)
> - Background agent activity visible as muted gray bars in both views
> - Clean non-overlapping expanded view layout
> - Gradient/glow/rounded bar styling inspired by `present` project
> - "Add Project" UI form + backend write API
> - Multi-column grid layout with @dnd-kit drag-and-drop reordering
> - Settings panel with toggles for collapsed pane elements
> - Per-session activity swimlanes (one row per session, colored by agent)
> - Sound notifications for session idle, plan complete, session error
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Task 1 → Task 4 → Task 8 → Task 13 → Task 17 → F1-F4

---

## Context

### Original Request
Fix 4 visual bugs in the sparkline rendering:
1. Collapsed view always shows teal bars instead of per-agent colors
2. Neither view shows gray bars for background agent activity
3. Expanded view has overlapping elements and mispositioned time bars
4. Time bars look ugly — need gradient/glow/rounded styling

Add 5 features:
1. Add projects through the UI
2. Multi-column layout with drag-and-drop reordering
3. UI config toggles for collapsed pane elements
4. Per-session activity monitoring (swimlanes)
5. Sound notifications on status changes

### Interview Summary
**Key Discussions**:
- DnD library: `@dnd-kit/core` + `@dnd-kit/sortable` (user confirmed)
- Project persistence: Write to `~/.local/share/opencode/storage/dashboard/sources.json`
- Config toggles list: Mini sparkline, Plan progress, Agent badge, Last updated timestamp, Status dot, Token usage, Active background tasks, Active git worktrees
- Session visualization: Swimlane (one row per session), colored by agent, with pinning
- Sound: Web Audio API, subtle tones, per-event toggles in settings panel
- Visual reference: `present` project's ScaledBarChart.tsx uses Tailwind gradients/glow — must translate to SVG `<defs>` + CSS

**Research Findings**:
- `renderMini()` at `Sparkline.tsx:271` hardcodes `sparkline-bar--teal` — root cause of Bug 1
- `renderFull()` at `Sparkline.tsx:302-305` computes `bgV` for scaling but never renders it as visible bars — root cause of Bug 2
- `buildEmptySessionTimeSeries()` at `multi-project.ts:95` returns empty data — `derivePerSessionTimeSeries()` is never called
- `sources-registry.ts:45-46` explicitly states write functions were "intentionally removed"
- `present` project uses `from-color-600/40 to-color-500/30` gradients, `shadow-[0_0_8px]` glow lines, `rounded-t-sm` corners, `animate-pulse` bottom overlay

### Metis Review
**Identified Gaps** (addressed):
- Mini sparkline stacked segments may not be legible at 20px height → Use dominant-agent-color approach for mini, stacked for full
- `@dnd-kit/sortable` also needed alongside `@dnd-kit/core` → Included in dependency list
- Config toggle persistence → localStorage with key `dashboard-config`
- Session swimlane backend returns empty → Wire `derivePerSessionTimeSeries()` in `multi-project.ts`
- Background bar visual hierarchy unclear → Separate muted bar behind main bars (not overlay)
- DnD order persistence → localStorage with key `dashboard-project-order`
- Visual spec for bar styling → Extract exact gradient stops from `present`, translate to SVG `<linearGradient>` and CSS `filter: drop-shadow()`

---

## Work Objectives

### Core Objective
Transform the dashboard from a buggy single-column prototype into a polished multi-column control room with correct time-series rendering, per-session monitoring, and configurable audio alerts.

### Concrete Deliverables
- `Sparkline.tsx` + `Sparkline.css` — fixed and restyled
- `SessionSwimlane.tsx` + `SessionSwimlane.css` — new per-session visualization
- `sources-registry.ts` — restored write functions
- `api.ts` — new `POST /api/sources` endpoint
- `AddProjectForm.tsx` — new UI component
- `App.tsx` + `App.css` — multi-column grid + DnD wrapper
- `SettingsPanel.tsx` + `SettingsPanel.css` — new config toggles + sound settings
- `useStripConfig.ts` — new hook for toggle state + localStorage persistence
- `useSoundNotifications.ts` — new hook for Web Audio alerts
- `useProjectOrder.ts` — new hook for DnD order persistence
- `multi-project.ts` — wired `derivePerSessionTimeSeries` call
- `package.json` — added `@dnd-kit/core` + `@dnd-kit/sortable`

### Definition of Done
- [ ] `bun run build` succeeds with zero errors
- [ ] All 4 bugs verified fixed via Playwright screenshots
- [ ] All 5 features functional via Playwright + API tests
- [ ] Config toggles persist across page refresh (localStorage)
- [ ] DnD order persists across page refresh (localStorage)
- [ ] Sound plays on configured events (AudioContext spy)
- [ ] Per-session swimlanes show colored rows when sessions are active

### Must Have
- Per-agent coloring in mini sparkline (dominant agent) and full sparkline (stacked)
- Background activity as muted gray bars
- SVG gradient fills with glow and rounded corners on bars
- Working project registration that persists to sources.json
- Multi-column layout that reorders via drag-and-drop
- All 8 config toggles functional
- Session swimlane rows colored by agent
- Session pinning (keep visible when inactive)
- Sound on: session idle, plan complete, session error
- Playwright agentic QA for every task

### Must NOT Have (Guardrails)
- MUST NOT add additional @dnd-kit sub-packages beyond `core` and `sortable`
- MUST NOT add state management library (zustand, redux, jotai) — use React useState + localStorage
- MUST NOT add CSS-in-JS library — use existing CSS files
- MUST NOT add animation library — CSS transitions only
- MUST NOT add sound library (howler.js, etc.) — Web Audio API only
- MUST NOT create deep component hierarchies (SwimlaneContainer > SwimlaneRow > SwimlaneBar) — keep flat
- MUST NOT add bar interaction handlers (tooltips, click handlers) — visual styling only
- MUST NOT add framer-motion — translate `present` patterns to plain CSS/SVG
- MUST NOT extract "bar styling utilities" module — keep SVG `<defs>` local to Sparkline
- MUST NOT create a generic "Settings Service" abstraction — inline localStorage calls
- MUST NOT add over-engineered error boundaries — keep error handling simple
- MUST NOT add excessive JSDoc comments — minimal, clear documentation only

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest + @playwright/test in devDeps)
- **Automated tests**: Tests-after (not TDD — primarily visual components)
- **Framework**: vitest for unit tests, Playwright for visual/integration QA
- **QA is primary verification**: Every task includes Playwright or curl-based agent-executed scenarios

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Hooks/Logic**: Use Bash (bun test) — Run vitest for pure logic verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types, deps, backend wiring):
├── Task 1: Install @dnd-kit deps + add new type definitions [quick]
├── Task 2: Restore sources-registry write functions + POST API endpoint [unspecified-high]
├── Task 3: Wire derivePerSessionTimeSeries in multi-project.ts [unspecified-high]
└── Task 4: SVG gradient/glow definitions + bar styling CSS overhaul [visual-engineering]

Wave 2 (Bug fixes — all sparkline rendering, depend on Wave 1):
├── Task 5: Fix mini sparkline per-agent coloring (Bug 1) [quick]
├── Task 6: Add background activity muted bars (Bug 2) [quick]
├── Task 7: Fix expanded view overlap + positioning (Bug 3) [visual-engineering]
└── Task 8: Apply gradient/glow/rounded styling to bars (Bug 4, depends: T4) [visual-engineering]

Wave 3 (New hooks + components — independent modules):
├── Task 9: useStripConfig hook + localStorage persistence [quick]
├── Task 10: useProjectOrder hook + localStorage persistence [quick]
├── Task 11: useSoundNotifications hook (Web Audio API) [unspecified-high]
├── Task 12: SessionSwimlane component (depends: T3) [visual-engineering]
└── Task 13: AddProjectForm component (depends: T2) [visual-engineering]

Wave 4 (Integration — wire everything together):
├── Task 14: SettingsPanel component (depends: T9, T11) [visual-engineering]
├── Task 15: DnD grid layout in App.tsx (depends: T1, T10) [unspecified-high]
├── Task 16: Wire config toggles into ProjectStrip (depends: T9) [quick]
├── Task 17: Wire SessionSwimlane into ProjectStrip expanded view (depends: T12) [quick]
└── Task 18: Wire sound triggers into data polling loop (depends: T11) [quick]

Wave 5 (Polish + QA):
├── Task 19: Visual polish pass — consistency, density modes, edge cases [visual-engineering]
└── Task 20: Full integration QA — all features working together [unspecified-high]

Wave FINAL (Independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright skill)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T4 → T8 → T15 → T19 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 5 (Waves 2 & 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1   | — | T5, T6, T7, T8, T15 | 1 |
| T2   | — | T13 | 1 |
| T3   | — | T12 | 1 |
| T4   | — | T8 | 1 |
| T5   | T1 | T19 | 2 |
| T6   | T1 | T19 | 2 |
| T7   | T1 | T19 | 2 |
| T8   | T4 | T19 | 2 |
| T9   | — | T14, T16 | 3 |
| T10  | — | T15 | 3 |
| T11  | — | T14, T18 | 3 |
| T12  | T3 | T17 | 3 |
| T13  | T2 | T19 | 3 |
| T14  | T9, T11 | T19 | 4 |
| T15  | T1, T10 | T19 | 4 |
| T16  | T9 | T19 | 4 |
| T17  | T12 | T19 | 4 |
| T18  | T11 | T19 | 4 |
| T19  | T5-T8, T13-T18 | T20 | 5 |
| T20  | T19 | F1-F4 | 5 |

### Agent Dispatch Summary

- **Wave 1 (4)**: T1 → `quick`, T2 → `unspecified-high`, T3 → `unspecified-high`, T4 → `visual-engineering`
- **Wave 2 (4)**: T5 → `quick`, T6 → `quick`, T7 → `visual-engineering`, T8 → `visual-engineering`
- **Wave 3 (5)**: T9 → `quick`, T10 → `quick`, T11 → `unspecified-high`, T12 → `visual-engineering`, T13 → `visual-engineering`
- **Wave 4 (5)**: T14 → `visual-engineering`, T15 → `unspecified-high`, T16 → `quick`, T17 → `quick`, T18 → `quick`
- **Wave 5 (2)**: T19 → `visual-engineering`, T20 → `unspecified-high`
- **FINAL (4)**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Install @dnd-kit Dependencies + New Type Definitions

  **What to do**:
  - Run `bun add @dnd-kit/core @dnd-kit/sortable` to install DnD dependencies
  - Add `StripConfigState` type to `src/types.ts` with boolean fields for all 8 toggles: `showMiniSparkline`, `showPlanProgress`, `showAgentBadge`, `showLastUpdated`, `showStatusDot`, `showTokenUsage`, `showBackgroundTasks`, `showGitWorktrees`
  - Add `SoundConfig` type to `src/types.ts` with fields: `enabled: boolean`, `volume: number`, `onSessionIdle: boolean`, `onPlanComplete: boolean`, `onSessionError: boolean`
  - Add `ProjectOrderState` type to `src/types.ts`: `{ orderedIds: string[], columns: number }`
  - Verify the package installs correctly and `bun run build` still passes

  **Must NOT do**:
  - Do NOT install @dnd-kit/utilities or any other @dnd-kit sub-package
  - Do NOT add any other npm dependencies
  - Do NOT modify any component files — types only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small scope — install 2 deps + add type definitions
  - **Skills**: []
    - No specialized skills needed for package install + type additions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: T5, T6, T7, T8, T15
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/types.ts:1-115` — All existing type definitions follow this pattern: exported `type` aliases, no classes/interfaces, JSDoc comment above each. New types should follow same style.

  **API/Type References**:
  - `src/types.ts:46-51` (`SessionTimeSeriesEntry`) — Example of a type with boolean + array fields, similar to what `StripConfigState` needs
  - `src/types.ts:82-108` (`ProjectSnapshot`) — Shows nested object type pattern for config nesting

  **External References**:
  - @dnd-kit docs: https://docs.dndkit.com/api-documentation/context-provider — DndContext and SortableContext types will be needed later

  **WHY Each Reference Matters**:
  - `types.ts` is the single source of truth for all shared types. New types must match existing style (export type, JSDoc) and be co-located here for cross-module import.

  **Acceptance Criteria**:
  - [ ] `bun run build` exits 0
  - [ ] `node_modules/@dnd-kit/core` directory exists
  - [ ] `node_modules/@dnd-kit/sortable` directory exists
  - [ ] `StripConfigState`, `SoundConfig`, `ProjectOrderState` exported from `src/types.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dependencies installed correctly
    Tool: Bash
    Preconditions: Project at /home/ezotoff/AI_projects/ez-omo-dash
    Steps:
      1. Run `bun run build` — expect exit code 0
      2. Run `ls node_modules/@dnd-kit/core/package.json` — expect file exists
      3. Run `ls node_modules/@dnd-kit/sortable/package.json` — expect file exists
      4. Run `ls node_modules/@dnd-kit/utilities 2>&1` — expect "No such file" (NOT installed)
    Expected Result: Build succeeds, core+sortable installed, utilities NOT installed
    Failure Indicators: Build fails, missing package.json, utilities directory exists
    Evidence: .sisyphus/evidence/task-1-deps-installed.txt

  Scenario: New types are exported correctly
    Tool: Bash
    Preconditions: types.ts has been updated
    Steps:
      1. Run `grep -n 'export type StripConfigState' src/types.ts` — expect match
      2. Run `grep -n 'export type SoundConfig' src/types.ts` — expect match
      3. Run `grep -n 'export type ProjectOrderState' src/types.ts` — expect match
      4. Run `grep -c 'showMiniSparkline' src/types.ts` — expect 1
    Expected Result: All 3 types exported, StripConfigState has all 8 boolean fields
    Failure Indicators: grep returns no matches, field count wrong
    Evidence: .sisyphus/evidence/task-1-types-exported.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): add @dnd-kit/core, @dnd-kit/sortable and new type defs`
  - Files: `package.json`, `bun.lockb`, `src/types.ts`
  - Pre-commit: `bun run build`

- [ ] 2. Restore Sources Registry Write Functions + POST API Endpoint

  **What to do**:
  - In `src/ingest/sources-registry.ts`: restore `writeRegistry(storageRoot, registry)` function that writes JSON to the registry path with `fs.writeFileSync` (create parent directory with `fs.mkdirSync({ recursive: true })` if needed)
  - Restore `addOrUpdateSource(storageRoot, projectRoot, label?)` function that: canonicalizes the path, hashes it for the ID, loads existing registry, upserts the entry with timestamps, writes back
  - In `src/server/api.ts`: add `POST /api/sources` endpoint that accepts `{ projectRoot: string, label?: string }`, calls `addOrUpdateSource`, returns `{ ok: true, sourceId }` on success and `{ ok: false, error }` on validation failure
  - Validate that `projectRoot` is a non-empty string and the directory exists on disk (`fs.existsSync`)
  - Import `addOrUpdateSource` in api.ts alongside existing `listSources` import

  **Must NOT do**:
  - Do NOT change the existing `loadRegistry`, `listSources`, `getDefaultSourceId`, `getSourceById` functions
  - Do NOT add authentication/authorization to the endpoint
  - Do NOT add rate limiting or request queuing
  - Do NOT change the registry file path or format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful file I/O + API endpoint with proper error handling
  - **Skills**: []
    - No specialized skills needed — standard Hono API + fs operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: T13 (AddProjectForm needs the API)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ingest/sources-registry.ts:48-62` (`loadRegistry`) — Shows the read pattern: get path, check existence, parse JSON, validate version. Write function should mirror this with `writeFileSync`.
  - `src/ingest/sources-registry.ts:31-35` (`canonicalizeProjectRoot`) — Use this for normalizing the projectRoot input before hashing
  - `src/ingest/sources-registry.ts:37-39` (`hashProjectRoot`) — Use for generating source ID from project root
  - `src/ingest/sources-registry.ts:45-46` — Comment confirming write functions were "intentionally removed" — DELETE this comment when restoring

  **API/Type References**:
  - `src/ingest/sources-registry.ts:6-12` (`SourceRegistryEntry`) — The entry shape that write function produces
  - `src/ingest/sources-registry.ts:14-17` (`SourcesRegistry`) — The full registry shape for JSON serialization
  - `src/server/api.ts:55-59` (`GET /sources`) — Existing sources endpoint pattern to follow for the new POST

  **External References**:
  - Hono request body parsing: `c.req.json()` returns parsed body — follow existing Hono patterns in api.ts

  **WHY Each Reference Matters**:
  - `loadRegistry` is the read side — `writeRegistry` is its exact inverse. Follow the same path resolution + error handling.
  - `canonicalizeProjectRoot` + `hashProjectRoot` are already exported — use them, don't reinvent.
  - The existing GET /sources shows Hono response pattern to follow for POST.

  **Acceptance Criteria**:
  - [ ] `writeRegistry` function exists and exported from sources-registry.ts
  - [ ] `addOrUpdateSource` function exists and exported from sources-registry.ts
  - [ ] POST /api/sources accepts `{ projectRoot, label? }` and returns `{ ok: true, sourceId }`
  - [ ] POST /api/sources with missing projectRoot returns 400
  - [ ] POST /api/sources with non-existent path returns 400
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: POST /api/sources creates new project entry
    Tool: Bash (curl)
    Preconditions: Dev server running on port 4301
    Steps:
      1. Run `curl -s http://localhost:4301/api/health | jq .ok` — expect true
      2. Run `curl -s -X POST http://localhost:4301/api/sources -H 'Content-Type: application/json' -d '{"projectRoot":"/home/ezotoff/AI_projects/ez-omo-dash","label":"test-project"}' | jq .ok` — expect true
      3. Run `curl -s http://localhost:4301/api/sources | jq '.sources | length'` — expect >= 1
    Expected Result: Source created, appears in GET /sources list
    Failure Indicators: POST returns ok:false, source not in list
    Evidence: .sisyphus/evidence/task-2-post-sources.txt

  Scenario: POST /api/sources rejects invalid input
    Tool: Bash (curl)
    Preconditions: Dev server running on port 4301
    Steps:
      1. Run `curl -s -w '%{http_code}' -X POST http://localhost:4301/api/sources -H 'Content-Type: application/json' -d '{}'` — expect HTTP 400
      2. Run `curl -s -w '%{http_code}' -X POST http://localhost:4301/api/sources -H 'Content-Type: application/json' -d '{"projectRoot":"/nonexistent/path/xyz"}'` — expect HTTP 400
    Expected Result: Both requests return 400 status
    Failure Indicators: Returns 200/500 instead of 400
    Evidence: .sisyphus/evidence/task-2-post-sources-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(registry): restore write functions and add POST /api/sources`
  - Files: `src/ingest/sources-registry.ts`, `src/server/api.ts`
  - Pre-commit: `bun run build`

- [ ] 3. Wire derivePerSessionTimeSeries in Multi-Project Service

  **What to do**:
  - In `src/server/multi-project.ts`: replace the `buildEmptySessionTimeSeries(nowMs)` call (line 95) with an actual call to `derivePerSessionTimeSeries` from `src/ingest/per-session-timeseries.ts`
  - Import `derivePerSessionTimeSeries` at the top of multi-project.ts
  - The call needs: `sqlitePath` (from storageBackend if kind === 'sqlite'), `projectRoot` (from entry), and optionally `boulderSessionIds`
  - If the storage backend is NOT sqlite, or if derivePerSessionTimeSeries returns `{ ok: false }`, fall back to `buildEmptySessionTimeSeries(nowMs)`
  - Keep `buildEmptySessionTimeSeries` as the fallback — do NOT delete it
  - Add try-catch around the derive call for per-source error isolation (consistent with existing pattern at line 152)

  **Must NOT do**:
  - Do NOT change the `SessionTimeSeriesPayload` type
  - Do NOT add caching or async loading — keep it synchronous like the rest of the transform
  - Do NOT modify `per-session-timeseries.ts` itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of storage backend abstraction + error handling patterns
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: T12 (SessionSwimlane needs real data)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/server/multi-project.ts:54-63` (`buildEmptySessionTimeSeries`) — The fallback function to use when sqlite is unavailable or derive fails
  - `src/server/multi-project.ts:95` — The exact line to replace: `sessionTimeSeries: buildEmptySessionTimeSeries(nowMs)`
  - `src/server/multi-project.ts:91-98` — Context around the line: inside `transformPayloadToSnapshot`, this is where session time series is assigned
  - `src/server/multi-project.ts:143-155` — Existing try-catch per-source error isolation pattern to follow

  **API/Type References**:
  - `src/ingest/per-session-timeseries.ts:59-64` (`derivePerSessionTimeSeries` signature) — Accepts `{ sqlitePath, projectRoot, boulderSessionIds?, nowMs? }`, returns `DeriveResult<SessionTimeSeriesPayload>`
  - `src/ingest/per-session-timeseries.ts:8-10` (`DeriveResult<T>`) — Union type: `{ ok: true; value: T }` | `{ ok: false; reason: string }`
  - `src/ingest/storage-backend.ts` — Need to check how to get `sqlitePath` from the storage backend

  **WHY Each Reference Matters**:
  - Line 95 is the single replacement point. The surrounding `transformPayloadToSnapshot` function shows exactly what data is available (sourceId, projectRoot, payload, nowMs).
  - The `derivePerSessionTimeSeries` function handles all the SQLite querying — we just need to call it with the right params.
  - The storage backend abstraction determines how to get `sqlitePath` — critical for the conditional logic.

  **Acceptance Criteria**:
  - [ ] `derivePerSessionTimeSeries` imported in multi-project.ts
  - [ ] Line 95 replaced with conditional: try sqlite → fallback to empty
  - [ ] `buildEmptySessionTimeSeries` still exists as fallback
  - [ ] `bun run build` exits 0
  - [ ] API returns non-empty `sessionTimeSeries.sessions` array when sessions exist

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Session time series returns real data for active project
    Tool: Bash (curl)
    Preconditions: Dev server running, at least one project with active sessions
    Steps:
      1. Run `curl -s http://localhost:4301/api/projects | jq '.projects[0].sessionTimeSeries.sessions | length'` — expect > 0 (if project has active sessions) or 0 (if no sessions, but field exists)
      2. Run `curl -s http://localhost:4301/api/projects | jq '.projects[0].sessionTimeSeries.buckets'` — expect 150
      3. Run `curl -s http://localhost:4301/api/projects | jq '.projects[0].sessionTimeSeries.windowMs'` — expect 300000
    Expected Result: sessionTimeSeries has correct structure with real session data
    Failure Indicators: sessions is always empty, missing fields, or API error
    Evidence: .sisyphus/evidence/task-3-session-timeseries-wired.txt

  Scenario: Graceful fallback when sqlite unavailable
    Tool: Bash
    Preconditions: Build succeeds
    Steps:
      1. Run `bun run build` — expect exit code 0
      2. Verify `buildEmptySessionTimeSeries` still exists: `grep -n 'buildEmptySessionTimeSeries' src/server/multi-project.ts` — expect at least 1 match (the function definition + fallback usage)
    Expected Result: Build passes, fallback function retained
    Failure Indicators: Build fails, function removed
    Evidence: .sisyphus/evidence/task-3-fallback-retained.txt
  ```

  **Commit**: YES
  - Message: `fix(backend): wire derivePerSessionTimeSeries in multi-project service`
  - Files: `src/server/multi-project.ts`
  - Pre-commit: `bun run build`

- [ ] 4. SVG Gradient/Glow Definitions + Bar Styling CSS Overhaul

  **What to do**:
  - In `Sparkline.tsx`: add an SVG `<defs>` block inside the `<svg>` element (both renderMini and renderFull) with `<linearGradient>` definitions for each agent tone:
    - `sparkline-grad-teal`: vertical gradient from `rgba(0,212,170,0.4)` (bottom) to `rgba(0,212,170,0.3)` (top) — inspired by `present`'s `from-emerald-600/40 to-emerald-500/30`
    - `sparkline-grad-red`: vertical gradient from `rgba(255,107,107,0.4)` to `rgba(255,107,107,0.3)`
    - `sparkline-grad-green`: vertical gradient from `rgba(78,205,196,0.4)` to `rgba(78,205,196,0.3)`
    - `sparkline-grad-sand`: vertical gradient from `rgba(255,165,2,0.4)` to `rgba(255,165,2,0.3)`
    - `sparkline-grad-muted`: vertical gradient from `rgba(102,102,128,0.3)` to `rgba(102,102,128,0.2)` (for background bars)
  - In `Sparkline.css`: update `.sparkline-bar--{tone}` classes to use `fill: url(#sparkline-grad-{tone})` instead of solid fills
  - Add CSS `filter: drop-shadow(0 0 4px var(--glow-color))` to `.sparkline-bar` for glow effect — define `--glow-color` per tone in each class
  - Add `rx="1"` attribute to all `<rect>` elements for rounded corners (1px radius to match the small bar scale)
  - Add a "glow line" effect: an additional thin `<rect>` (height: 1px) at the top of each bar with full opacity fill, inspired by `present`'s `h-[2px]` glow strip with `shadow-[0_0_8px_currentColor]`

  **Must NOT do**:
  - Do NOT add framer-motion or any animation library
  - Do NOT add pulse/animation effects (keep static, unlike `present`'s `animate-pulse`)
  - Do NOT create a separate SVG definitions file — keep `<defs>` inline in each SVG
  - Do NOT change the bar positioning logic or data computation in this task
  - Do NOT add hover interactions beyond existing CSS opacity transition

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG gradient definitions + CSS visual styling is core visual-engineering work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for translating `present` project's Tailwind visual language to SVG/CSS equivalents with matching aesthetics

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: T8 (applying the styling to actual bars)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `/home/ezotoff/AI_projects/present/components/shared/ScaledBarChart.tsx:133-224` (`BAR_STYLES` object) — Complete color palette for each tone. Extract: gradient from/to values, glow shadow rgba values, border colors. Translate Tailwind classes to raw CSS values.
  - `/home/ezotoff/AI_projects/present/components/shared/ScaledBarChart.tsx:264` (AnimatedBar JSX) — Shows the visual structure: gradient background + border + glow line (h-[2px]) + pulse gradient. We implement gradient + glow line, skip pulse + animation.
  - `/home/ezotoff/AI_projects/present/components/shared/ScaledBarChart.tsx:280` — The glow line: `h-[2px]` with `shadow-[0_0_8px_currentColor]`. Translate to SVG: thin rect + CSS filter.

  **API/Type References**:
  - `src/ui/components/Sparkline.tsx:11` (`AgentTone`) — The 4 tones: teal, red, green, sand. Each needs a gradient definition.
  - `src/styles/tokens.css:14-17` — Existing color values for accents: `--accent-primary: #00d4aa`, `--accent-danger: #ff6b6b`, `--accent-success: #4ecdc4`, `--accent-warning: #ffa502`. Use these as base colors for gradients.

  **WHY Each Reference Matters**:
  - The `present` BAR_STYLES object has exact Tailwind color values (e.g., `from-emerald-600/40`) that we need to convert to rgba for SVG gradients.
  - The AnimatedBar structure shows the visual hierarchy we're replicating: gradient fill → glow line → bar content.
  - tokens.css has the exact hex values for our agent tones — gradient stops should derive from these.

  **Acceptance Criteria**:
  - [ ] SVG `<defs>` block with 5 `<linearGradient>` elements (teal, red, green, sand, muted) present in renderMini and renderFull
  - [ ] Each `<rect>` uses `fill="url(#sparkline-grad-{tone})"` instead of CSS solid fill
  - [ ] Each `<rect>` has `rx="1"` for rounded corners
  - [ ] CSS `filter: drop-shadow()` applied per-tone with appropriate glow color
  - [ ] Glow line rects (1px height) visible at top of each bar
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SVG gradients are defined and applied
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on port 4301, at least 1 project with activity
    Steps:
      1. Navigate to http://localhost:4301
      2. Wait for `.project-strip` to appear (timeout: 10s)
      3. Query `svg.sparkline defs linearGradient` — expect at least 5 gradient elements
      4. Query `svg.sparkline rect[rx]` — expect all rects have rx attribute
      5. Take screenshot of the full page
    Expected Result: Gradients defined in SVG, rects use rx for rounded corners, bars have visible gradient fill instead of flat color
    Failure Indicators: No <defs> in SVG, rects missing rx, flat solid fills
    Evidence: .sisyphus/evidence/task-4-gradients-applied.png

  Scenario: Glow line visible at top of bars
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with activity expanded
    Steps:
      1. Navigate to http://localhost:4301
      2. Click on a project strip to expand it
      3. Query `.sparkline--full rect` elements — count should be > number of data bars (extra rects are glow lines)
      4. Take close-up screenshot of expanded sparkline area
    Expected Result: Visible thin glow line at top of each bar, bars have gradient fill
    Failure Indicators: Only data rects present, no glow line rects
    Evidence: .sisyphus/evidence/task-4-glow-lines.png
  ```

  **Commit**: YES
  - Message: `style(sparkline): add SVG gradient/glow definitions and bar CSS overhaul`
  - Files: `src/ui/components/Sparkline.tsx`, `src/ui/components/Sparkline.css`
  - Pre-commit: `bun run build`

- [ ] 5. Fix Mini Sparkline Per-Agent Coloring (Bug 1)

  **What to do**:
  - In `Sparkline.tsx` `renderMini()`: instead of summing all agents into a single teal bar, determine the **dominant agent** for each bucket (the one with the highest value) and assign its color to that bucket's bar
  - Replace the single `sums` array with per-bucket dominant-agent calculation: compare `sisV[idx]`, `proV[idx]`, `atlV[idx]` and pick the agent with max value
  - Map dominant agent to tone: sisyphus→teal, prometheus→red, atlas→green, tie→teal (default)
  - Change `className="sparkline-bar sparkline-bar--teal"` (line 271) to `className={\`sparkline-bar sparkline-bar--${dominantTone}\`}` using the per-bucket computed tone
  - Keep the same summed height computation — only the COLOR class changes per bucket
  - Ensure the SVG `<defs>` gradients from Task 4 are also included in the mini SVG (add `<defs>` block matching renderFull)

  **Must NOT do**:
  - Do NOT change the bar height logic (still sum all agents for height)
  - Do NOT add stacked segments to mini mode — it's too small for stacking
  - Do NOT change the 30-bucket window or 20px height
  - Do NOT remove the existing summing logic — extend it with tone selection

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file, single-function change — add dominant tone selection to renderMini
  - **Skills**: []
    - No specialized skills needed for this logic fix

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: T19 (visual polish)
  - **Blocked By**: T1 (type definitions), T4 (SVG gradient defs — mini needs same `<defs>` block)

  **References**:

  **Pattern References**:
  - `src/ui/components/Sparkline.tsx:234-250` (`renderMini` sum loop) — The exact loop to modify. Currently sums `sisV + proV + atlV` into `sums[]`. Add dominant tone tracking alongside the sum.
  - `src/ui/components/Sparkline.tsx:265-278` (mini bar rendering) — Line 271 hardcodes `sparkline-bar--teal`. Change to dynamic class based on per-bucket dominant agent.
  - `src/ui/components/Sparkline.tsx:142-147` (`order` array in computeStackedSegments) — Shows the agent→tone mapping: sisyphus=teal, prometheus=red, atlas=green, other=sand. Reuse this mapping.

  **API/Type References**:
  - `src/ui/components/Sparkline.tsx:11` (`AgentTone`) — The union type for bar tones. Dominant tone must be one of these values.

  **WHY Each Reference Matters**:
  - Lines 234-250 show the exact loop where dominant detection must be added alongside existing sum logic.
  - Line 271 is the single point of change for the className — the bug root cause.
  - The `order` array provides the canonical agent→tone mapping to reuse.

  **Acceptance Criteria**:
  - [ ] Mini sparkline bars show different colors based on dominant agent (not all teal)
  - [ ] Prometheus-dominant buckets show red bars
  - [ ] Sisyphus-dominant buckets show teal bars
  - [ ] Atlas-dominant buckets show green bars
  - [ ] Bar heights remain unchanged (still summed)
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mini sparkline shows per-agent colors
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on port 4301, at least 1 project with prometheus activity
    Steps:
      1. Navigate to http://localhost:4301
      2. Wait for `.project-strip` to appear (timeout: 10s)
      3. Query `.sparkline--mini .sparkline-bar` elements
      4. Collect unique class names from all mini bar elements
      5. Assert that NOT all bars have class `sparkline-bar--teal` — at least one other tone should be present if multiple agents are active
      6. Take screenshot of collapsed project strips showing mini sparklines
    Expected Result: Mini bars use agent-specific colors, not uniform teal
    Failure Indicators: All bars have class `sparkline-bar--teal`, no color variety
    Evidence: .sisyphus/evidence/task-5-mini-agent-colors.png

  Scenario: Fallback to teal when only sisyphus active
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with only sisyphus activity
    Steps:
      1. Navigate to http://localhost:4301
      2. Find a project strip where only sisyphus sessions are active
      3. Query its `.sparkline--mini .sparkline-bar` elements
      4. Assert all bars have class `sparkline-bar--teal`
    Expected Result: Pure sisyphus activity still shows teal (no regression)
    Failure Indicators: Bars show wrong color for sisyphus-only project
    Evidence: .sisyphus/evidence/task-5-mini-teal-fallback.png
  ```

  **Commit**: YES
  - Message: `fix(sparkline): use dominant agent color in mini mode`
  - Files: `src/ui/components/Sparkline.tsx`
  - Pre-commit: `bun run build`

- [ ] 6. Add Background Activity Muted Bars (Bug 2)

  **What to do**:
  - In `Sparkline.tsx` `renderFull()`: after rendering stacked agent bars for each bucket, add a **separate muted bar** behind them for background agent activity
  - The background total is already available as `bgV` (from `lookup.get("background-total")?.values`)
  - For each bucket, compute background bar height: `bgBarH = (toSafe(bgV[i]) / scaleMax) * chartH`
  - Render a `<rect>` with class `sparkline-bar sparkline-bar--muted` **before** the stacked agent rects (so it renders behind them via SVG paint order)
  - The muted bar should be full-height from bottom (same x position as agent bars), with the `sparkline-grad-muted` gradient fill from Task 4
  - Also add muted bars to `renderMini()`: compute background total per bucket from a `background-total` series lookup and render a muted bar behind the dominant-agent bar
  - Update `computeScaleMax` to consider background values in the max calculation: `Math.max(stacked + bgVal, mainFromOverall)` so background bars don't exceed chart height

  **Must NOT do**:
  - Do NOT render background bars as an overlay on top of agent bars — they must be BEHIND (rendered first in SVG)
  - Do NOT change the stacked segment computation for agent bars
  - Do NOT merge background values into the `other` agent category
  - Do NOT add tooltips or interaction to background bars

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding rect elements with existing data that's already computed but not rendered
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: T19 (visual polish)
  - **Blocked By**: T1 (type definitions), T4 (muted gradient definition)

  **References**:

  **Pattern References**:
  - `src/ui/components/Sparkline.tsx:302` (`bgV` variable) — Already extracted: `const bgV = lookup.get("background-total")?.values ?? []`. The data is THERE — just never rendered.
  - `src/ui/components/Sparkline.tsx:323-351` (full mode bar rendering loop) — The `Array.from` loop where stacked segments are rendered. Insert muted bar BEFORE `segments.map()` in the JSX.
  - `src/ui/components/Sparkline.tsx:172-191` (`computeScaleMax`) — Currently uses `bgV` for subtraction only (`overallV - bgV`). Must also consider background height for scaling.
  - `src/ui/components/Sparkline.css:39-41` (`.sparkline-bar--muted`) — Already has basic styling: `fill: var(--text-muted)`. Will be updated by Task 4 to use gradient.

  **API/Type References**:
  - `src/types.ts:28-33` (`TimeSeriesSeries`) — The background-total series has `tone: "muted"`, confirming the styling intent.

  **WHY Each Reference Matters**:
  - Line 302 proves the data exists but is unused for rendering — this is the bug.
  - Lines 323-351 show exactly where the new rect must be inserted in the render loop.
  - `computeScaleMax` must be adjusted so background bars don't clip outside the chart area.

  **Acceptance Criteria**:
  - [ ] Full sparkline shows muted/gray bars behind colored agent bars
  - [ ] Muted bars represent `background-total` series values
  - [ ] Muted bars don't overlap or obscure agent bars (rendered behind)
  - [ ] Mini sparkline also shows muted background bars behind dominant-agent bars
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Background bars visible in full sparkline
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with background tasks active
    Steps:
      1. Navigate to http://localhost:4301
      2. Click a project strip to expand it
      3. Wait for `.sparkline--full` to appear (timeout: 5s)
      4. Query `.sparkline--full .sparkline-bar--muted` elements — expect count > 0
      5. Query `.sparkline--full .sparkline-bar--teal, .sparkline--full .sparkline-bar--red` — verify these exist too (agent bars are still present)
      6. Take screenshot of expanded sparkline
    Expected Result: Muted gray bars visible behind colored agent bars
    Failure Indicators: No `.sparkline-bar--muted` rects found, or muted bars cover agent bars
    Evidence: .sisyphus/evidence/task-6-background-bars-full.png

  Scenario: Background bars visible in mini sparkline
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with background tasks
    Steps:
      1. Navigate to http://localhost:4301
      2. Query `.sparkline--mini .sparkline-bar--muted` elements — expect count > 0
      3. Take screenshot of collapsed strips
    Expected Result: Mini sparklines show muted bars behind agent bars
    Failure Indicators: No muted bars in mini mode
    Evidence: .sisyphus/evidence/task-6-background-bars-mini.png
  ```

  **Commit**: YES
  - Message: `fix(sparkline): render background activity as muted bars in both modes`
  - Files: `src/ui/components/Sparkline.tsx`
  - Pre-commit: `bun run build`

---

- [ ] 7. Fix Expanded View Element Overlap and Positioning (Bug 3)

  **What to do**:
  - **Root cause**: The `.sparkline-slot--full` in `ProjectStrip.css:149-154` sets `height: 48px` but the Sparkline component defaults to `height: 80px` (Sparkline.tsx:294). This mismatch causes the SVG to overflow its container.
  - Fix the height inconsistency: change `.sparkline-slot--full` height to `80px` to match the SVG's default height, OR change the Sparkline default to `48px` and adjust paddings. **Recommended**: Set `.sparkline-slot--full` to `height: 80px` since the full chart needs more vertical space for stacked bars.
  - Also update `.sparkline--full` in `Sparkline.css:15-19` to ensure `height: 80px` matches the container.
  - Increase `.strip-body` `max-height` from `600px` to `900px` in `ProjectStrip.css:122` to accommodate the taller sparkline + session swimlane content that will be added in later tasks.
  - Add `overflow: visible` to `.sparkline-slot--full` to prevent clipping of bar glow effects.
  - Ensure each `.strip-section` has proper `flex-shrink: 0` so sections don't compress each other.

  **Must NOT do**:
  - Do NOT change the collapsed header height (40px)
  - Do NOT change mini sparkline dimensions
  - Do NOT add scrolling inside the expanded body — rely on max-height transition
  - Do NOT change the bar data computation or stacking logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS layout debugging requires visual inspection and understanding of flex/overflow behavior
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for diagnosing layout overlap issues and ensuring consistent visual hierarchy

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: T19 (visual polish)
  - **Blocked By**: T1 (type definitions used in Sparkline)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.css:149-154` (`.sparkline-slot--full`) — Sets height 48px, but SVG renders at 80px. This is the primary mismatch causing overflow/overlap.
  - `src/ui/components/Sparkline.css:15-19` (`.sparkline--full`) — CSS says `height: 80px`. The SVG and its container must agree.
  - `src/ui/components/Sparkline.tsx:294` (`const h = heightProp ?? 80`) — Default full height is 80px. Container must accommodate this.
  - `src/ui/components/ProjectStrip.css:121-123` (`.strip-body` max-height) — `max-height: 600px` may clip once session swimlanes are added.
  - `src/ui/components/ProjectStrip.css:125-131` (`.strip-body-inner`) — Flex column layout with gap. Each section needs `flex-shrink: 0` to prevent compression.
  - `src/ui/components/ProjectStrip.css:134-138` (`.strip-section`) — Flex column for each content section. Verify no height constraints.

  **API/Type References**:
  - `src/ui/components/Sparkline.tsx:294-297` — Full mode padding: `padTop=2, padBottom=2, chartH=h-4=76px`. The 76px chart area must fit within the 80px SVG.

  **WHY Each Reference Matters**:
  - The 48px vs 80px mismatch is the exact root cause of the overlap. Both files need to agree on the height.
  - `max-height: 600px` on `.strip-body` will become a bottleneck once swimlanes add more content.
  - Each `.strip-section` must not shrink, or sections will compress visually.

  **Acceptance Criteria**:
  - [ ] Full sparkline SVG height matches its container height (both 80px)
  - [ ] Expanded view sections don't overlap each other
  - [ ] Activity label, sparkline, plan progress, and session details are all vertically separated
  - [ ] Expanding a project strip smoothly reveals all sections
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Expanded view has no element overlap
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on port 4301, at least 1 project
    Steps:
      1. Navigate to http://localhost:4301
      2. Click the first `.project-strip` to expand it
      3. Wait for `.strip-body-inner` to be visible (timeout: 5s)
      4. Get bounding rects of ALL `.strip-section` elements inside the expanded strip
      5. For each consecutive pair (section[i], section[i+1]): assert section[i].bottom <= section[i+1].top (no vertical overlap)
      6. Get bounding rect of `.sparkline-slot--full` and `.sparkline--full svg` inside it — assert SVG fits within slot
      7. Take full-page screenshot
    Expected Result: All sections vertically stacked with no overlap, SVG fits container
    Failure Indicators: Any section pair overlaps (bottom > top of next), SVG exceeds container bounds
    Evidence: .sisyphus/evidence/task-7-no-overlap.png

  Scenario: Expand/collapse animation is smooth
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:4301
      2. Click first project strip header to expand
      3. Wait 300ms for transition
      4. Assert `.strip-body` has computed `max-height` > 0
      5. Click again to collapse
      6. Wait 300ms
      7. Assert `.strip-body` has computed `max-height` of 0
    Expected Result: Smooth expand/collapse with no visual jank
    Failure Indicators: Content appears/disappears instantly (no transition), content clipped during transition
    Evidence: .sisyphus/evidence/task-7-expand-collapse.png
  ```

  **Commit**: YES
  - Message: `fix(sparkline): resolve expanded view element overlap and height mismatch`
  - Files: `src/ui/components/Sparkline.css`, `src/ui/components/ProjectStrip.css`
  - Pre-commit: `bun run build`

- [ ] 8. Apply Gradient/Glow/Rounded Bar Styling (Bug 4)

  **What to do**:
  - This task CONSUMES the SVG `<defs>` and CSS created in Task 4 and applies them to all bars in both `renderMini()` and `renderFull()`
  - In `Sparkline.tsx` `renderFull()`: change all `<rect>` elements to use `fill="url(#sparkline-grad-{tone})"` instead of relying on CSS class fills
  - Add `rx="1"` to all `<rect>` elements in both renderMini and renderFull for rounded corners
  - For each rendered bar `<rect>`, add a companion "glow line" `<rect>` immediately after it: same x/width, height=1px, y = bar.y (top of bar), with full-opacity fill matching the tone color and CSS `filter: drop-shadow(0 0 4px {color})`
  - Glow line class: `sparkline-glow sparkline-glow--{tone}` — add these CSS classes to `Sparkline.css`
  - Each glow class sets `filter: drop-shadow(0 0 4px var(--glow-color-{tone}))` with `--glow-color-teal: rgba(0,212,170,0.6)`, `--glow-color-red: rgba(255,107,107,0.6)`, etc.
  - Ensure glow lines are rendered AFTER their parent bar (later in SVG = rendered on top)

  **Must NOT do**:
  - Do NOT add animation/transitions to the glow (static only)
  - Do NOT add pulse effects
  - Do NOT change bar heights or positions — styling only
  - Do NOT add hover tooltips or click handlers
  - Do NOT create separate component files for bars

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG rendering + CSS visual effects require visual-engineering expertise
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for achieving the polished gradient/glow aesthetic matching the `present` project

  **Parallelization**:
  - **Can Run In Parallel**: YES (but depends on T4 completing first)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: T19 (visual polish)
  - **Blocked By**: T4 (SVG gradient definitions must exist first)

  **References**:

  **Pattern References**:
  - `src/ui/components/Sparkline.tsx:341-349` (full mode rect rendering) — Each `segments.map()` renders a `<rect>`. Add `rx="1"` and `fill="url(#sparkline-grad-{seg.tone})"` to each. Add glow line rect after each.
  - `src/ui/components/Sparkline.tsx:268-277` (mini mode rect rendering) — Same pattern for mini bars. Add rx and gradient fill.
  - `/home/ezotoff/AI_projects/present/components/shared/ScaledBarChart.tsx:264-280` — The `present` project's AnimatedBar shows the visual structure to replicate: gradient background + border + glow line (h-[2px] with shadow-[0_0_8px]).

  **API/Type References**:
  - `src/ui/components/Sparkline.tsx:11` (`AgentTone`) — The 4 tones plus "muted" for background. Each needs a glow CSS class.
  - `src/styles/tokens.css:14-17` — Accent color values for deriving glow rgba colors.

  **WHY Each Reference Matters**:
  - Lines 341-349 and 268-277 are the exact JSX where rect attributes must be changed.
  - The `present` AnimatedBar is the visual reference for what the result should look like.
  - Token values ensure glow colors match the design system.

  **Acceptance Criteria**:
  - [ ] All bars in full mode have `rx="1"` for rounded corners
  - [ ] All bars in mini mode have `rx="1"`
  - [ ] All bars use SVG gradient fills (not flat CSS fills)
  - [ ] Glow line rects visible at top of each bar (1px height, full-opacity fill)
  - [ ] Glow effect visible via CSS `filter: drop-shadow`
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bars have rounded corners and gradient fills
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with activity expanded
    Steps:
      1. Navigate to http://localhost:4301
      2. Click a project to expand it
      3. Query `.sparkline--full .sparkline-bar` rects — assert ALL have attribute `rx` present
      4. Query first `.sparkline-bar` rect — assert `fill` attribute starts with `url(#sparkline-grad-`
      5. Take close-up screenshot of the full sparkline
    Expected Result: Bars have rounded corners (rx=1) and gradient fills
    Failure Indicators: Missing rx attribute, fill is flat color not url(#...)
    Evidence: .sisyphus/evidence/task-8-rounded-gradient-bars.png

  Scenario: Glow lines visible at top of bars
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project expanded
    Steps:
      1. Navigate to http://localhost:4301
      2. Expand a project
      3. Query `.sparkline--full .sparkline-glow` elements — expect count > 0
      4. Assert each glow rect has `height="1"` (or very small value)
      5. Assert each glow rect has computed CSS `filter` containing `drop-shadow`
      6. Take screenshot focusing on bar tops to show glow effect
    Expected Result: Thin glow lines visible at bar tops with drop-shadow
    Failure Indicators: No `.sparkline-glow` elements, or missing filter
    Evidence: .sisyphus/evidence/task-8-glow-lines.png
  ```

  **Commit**: YES
  - Message: `style(sparkline): apply gradient fills, rounded corners, and glow lines to all bars`
  - Files: `src/ui/components/Sparkline.tsx`, `src/ui/components/Sparkline.css`
  - Pre-commit: `bun run build`

---

- [ ] 9. useStripConfig Hook + localStorage Persistence

  **What to do**:
  - Create new file `src/ui/hooks/useStripConfig.ts`
  - Implement a React hook that manages 8 boolean toggles controlling which elements appear in the collapsed project strip:
    - `showMiniSparkline` (default: true)
    - `showPlanProgress` (default: true)
    - `showAgentBadge` (default: true)
    - `showLastUpdated` (default: true)
    - `showStatusDot` (default: true)
    - `showTokenUsage` (default: true)
    - `showBackgroundTasks` (default: true)
    - `showGitWorktrees` (default: true)
  - Read initial state from `localStorage.getItem('dashboard-strip-config')` with JSON.parse. If missing or parse error, use defaults.
  - On any toggle change, write updated state to `localStorage.setItem('dashboard-strip-config', JSON.stringify(state))`
  - Return `{ config: StripConfigState, toggle: (key: keyof StripConfigState) => void, reset: () => void }`
  - Use `StripConfigState` type from `src/types.ts` (added in Task 1)

  **Must NOT do**:
  - Do NOT use React Context — return hook state directly, lift to App.tsx later
  - Do NOT use zustand, jotai, or any state management library
  - Do NOT create a generic "settings service" abstraction
  - Do NOT add debouncing or throttling to localStorage writes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single hook file with straightforward useState + localStorage logic
  - **Skills**: []
    - No specialized skills needed for a React hook

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12, 13)
  - **Blocks**: T14 (SettingsPanel), T16 (wiring into ProjectStrip)
  - **Blocked By**: None (T1 adds types, but hook can be written concurrently if type is defined inline temporarily)

  **References**:

  **Pattern References**:
  - `src/ui/hooks/useExpandState.ts` — Existing hook pattern in this project. Follow same export style, naming convention, and structure (useState + callbacks).
  - `src/ui/hooks/useDensityMode.ts` — Another hook example. Note: hooks are simple files with single default/named export.

  **API/Type References**:
  - `src/types.ts` (`StripConfigState`) — The type with 8 boolean fields (added by Task 1). Import from `../../types`.

  **WHY Each Reference Matters**:
  - `useExpandState` shows the canonical hook pattern for this project: useState, useCallback, named export.
  - The `StripConfigState` type ensures the hook's state shape matches what SettingsPanel and ProjectStrip will consume.

  **Acceptance Criteria**:
  - [ ] `src/ui/hooks/useStripConfig.ts` exists and exports `useStripConfig`
  - [ ] Hook returns `config`, `toggle`, `reset` functions
  - [ ] Default state has all 8 toggles set to `true`
  - [ ] `localStorage.getItem('dashboard-strip-config')` returns JSON after toggle
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Config persists to localStorage
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running (hook must be imported somewhere to test — can add temporary import in App.tsx or test via browser console)
    Steps:
      1. Navigate to http://localhost:4301
      2. Execute in browser console: `localStorage.getItem('dashboard-strip-config')`
      3. If null, the hook hasn't been wired yet — verify via build only
      4. Run `bun run build` — expect exit 0
      5. Run `grep -n 'useStripConfig' src/ui/hooks/useStripConfig.ts` — expect match
    Expected Result: Hook file exists, builds cleanly, exports named function
    Failure Indicators: Build failure, missing export
    Evidence: .sisyphus/evidence/task-9-strip-config-hook.txt

  Scenario: Reset restores defaults
    Tool: Bash
    Preconditions: Hook file exists
    Steps:
      1. Run `bun run build` — expect exit 0
      2. Grep for `reset` function export: `grep 'reset' src/ui/hooks/useStripConfig.ts` — expect match
      3. Grep for all 8 toggle keys: `grep -c 'show' src/ui/hooks/useStripConfig.ts` — expect >= 8
    Expected Result: All 8 toggle keys present, reset function defined
    Failure Indicators: Missing toggle keys, no reset function
    Evidence: .sisyphus/evidence/task-9-strip-config-reset.txt
  ```

  **Commit**: YES
  - Message: `feat(config): add useStripConfig hook with localStorage persistence`
  - Files: `src/ui/hooks/useStripConfig.ts`
  - Pre-commit: `bun run build`

- [ ] 10. useProjectOrder Hook + localStorage Persistence

  **What to do**:
  - Create new file `src/ui/hooks/useProjectOrder.ts`
  - Implement a React hook that manages the order of project strips and column count:
    - `orderedIds: string[]` — ordered list of project sourceIds
    - `columns: number` — number of grid columns (1, 2, or 3)
  - Read initial state from `localStorage.getItem('dashboard-project-order')` with JSON.parse. If missing, return `{ orderedIds: [], columns: 1 }`.
  - Provide `reorder(oldIndex: number, newIndex: number)` that moves the item from oldIndex to newIndex in the orderedIds array (standard array move for DnD)
  - Provide `setColumns(n: number)` to change column count
  - Provide `syncIds(currentIds: string[])` that reconciles orderedIds with current project list (adds new ones at end, removes stale ones)
  - On any state change, persist to localStorage
  - Use `ProjectOrderState` type from `src/types.ts` (added in Task 1)

  **Must NOT do**:
  - Do NOT import @dnd-kit here — this hook manages pure state, DnD wiring is in Task 15
  - Do NOT add drag event handlers in this hook
  - Do NOT sort projects by status here — DnD order overrides sort

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple state hook with array manipulation + localStorage
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11, 12, 13)
  - **Blocks**: T15 (DnD grid wiring)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ui/hooks/useExpandState.ts` — Follow same hook pattern: useState, useCallback, named export.

  **API/Type References**:
  - `src/types.ts` (`ProjectOrderState`) — `{ orderedIds: string[], columns: number }` (added by Task 1).

  **WHY Each Reference Matters**:
  - `useExpandState` is the project's canonical hook pattern. Follow its structure exactly.

  **Acceptance Criteria**:
  - [ ] `src/ui/hooks/useProjectOrder.ts` exists and exports `useProjectOrder`
  - [ ] Hook returns `orderedIds`, `columns`, `reorder`, `setColumns`, `syncIds`
  - [ ] `syncIds` adds new IDs and removes stale ones
  - [ ] State persists to `localStorage` key `dashboard-project-order`
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hook exports and builds
    Tool: Bash
    Preconditions: Project builds
    Steps:
      1. Run `bun run build` — expect exit 0
      2. Run `grep -n 'export function useProjectOrder' src/ui/hooks/useProjectOrder.ts` — expect match
      3. Run `grep 'reorder' src/ui/hooks/useProjectOrder.ts` — expect match
      4. Run `grep 'syncIds' src/ui/hooks/useProjectOrder.ts` — expect match
    Expected Result: Hook exists with all required functions
    Failure Indicators: Build fails, missing exports
    Evidence: .sisyphus/evidence/task-10-project-order-hook.txt

  Scenario: Array reorder logic correct
    Tool: Bash
    Preconditions: Hook file exists
    Steps:
      1. Run `grep -c 'splice' src/ui/hooks/useProjectOrder.ts` — expect >= 1 (standard array move uses splice)
      2. Run `grep 'localStorage' src/ui/hooks/useProjectOrder.ts` — expect matches for both get and set
    Expected Result: Uses splice for array move, persists to localStorage
    Failure Indicators: No splice, no localStorage calls
    Evidence: .sisyphus/evidence/task-10-reorder-logic.txt
  ```

  **Commit**: YES
  - Message: `feat(layout): add useProjectOrder hook with localStorage persistence`
  - Files: `src/ui/hooks/useProjectOrder.ts`
  - Pre-commit: `bun run build`

- [ ] 11. useSoundNotifications Hook (Web Audio API)

  **What to do**:
  - Create new file `src/ui/hooks/useSoundNotifications.ts`
  - Implement a React hook that produces subtle notification tones using the Web Audio API
  - Manage `SoundConfig` state (from Task 1 types): `enabled`, `volume`, `onSessionIdle`, `onPlanComplete`, `onSessionError`
  - Persist config to `localStorage.getItem('dashboard-sound-config')`
  - Create an `AudioContext` lazily (on first sound trigger, not on mount — browsers block autoplay)
  - Implement 3 distinct tone generators:
    - `playSessionIdle()`: Low-frequency gentle tone (300Hz, 200ms duration, sine wave, volume ramp down)
    - `playPlanComplete()`: Rising two-tone sequence (400Hz then 600Hz, 150ms each, triangle wave)
    - `playSessionError()`: Short alert (500Hz, 100ms, sawtooth wave, two quick pulses)
  - Each `play*` function checks `config.enabled && config.on{Event}` before playing
  - Return `{ config, setConfig, playSessionIdle, playPlanComplete, playSessionError }`
  - Volume maps to GainNode value: `config.volume` is 0-100, map to 0.0-0.3 gain (subtle range)

  **Must NOT do**:
  - Do NOT import any audio library (howler.js, tone.js, etc.)
  - Do NOT embed base64 audio files — synthesize tones with oscillator nodes
  - Do NOT create AudioContext on component mount (browser autoplay policy blocks this)
  - Do NOT add complex sound sequences or melodies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Web Audio API requires understanding of AudioContext, OscillatorNode, GainNode lifecycle
  - **Skills**: []
    - No specialized skills for Web Audio — standard browser API

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 12, 13)
  - **Blocks**: T14 (SettingsPanel sound controls), T18 (wiring triggers)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ui/hooks/useDashboardData.ts` — Shows ref patterns (`useRef`) for holding mutable values (AudioContext, timers) across renders.

  **API/Type References**:
  - `src/types.ts` (`SoundConfig`) — `{ enabled: boolean, volume: number, onSessionIdle: boolean, onPlanComplete: boolean, onSessionError: boolean }` (added by Task 1).

  **External References**:
  - Web Audio API: `AudioContext`, `OscillatorNode`, `GainNode` — MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

  **WHY Each Reference Matters**:
  - `useDashboardData` shows useRef for mutable objects (abort controllers). AudioContext should use same pattern.
  - SoundConfig type defines the exact shape of persisted sound settings.

  **Acceptance Criteria**:
  - [ ] `src/ui/hooks/useSoundNotifications.ts` exists and exports `useSoundNotifications`
  - [ ] No audio library imports in the file (grep for 'howler', 'tone.js' returns 0)
  - [ ] `AudioContext` created lazily (not in useEffect or useState initializer)
  - [ ] Config persists to localStorage key `dashboard-sound-config`
  - [ ] Three distinct play functions exported
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hook builds without audio library dependencies
    Tool: Bash
    Preconditions: Project builds
    Steps:
      1. Run `bun run build` — expect exit 0
      2. Run `grep -c 'howler\|tone\.js\|Howl' src/ui/hooks/useSoundNotifications.ts` — expect 0
      3. Run `grep 'AudioContext' src/ui/hooks/useSoundNotifications.ts` — expect >= 1
      4. Run `grep 'OscillatorNode\|createOscillator' src/ui/hooks/useSoundNotifications.ts` — expect >= 1
    Expected Result: Uses Web Audio API, no library imports
    Failure Indicators: Audio library imports found, no AudioContext usage
    Evidence: .sisyphus/evidence/task-11-sound-hook.txt

  Scenario: AudioContext not created on import
    Tool: Bash
    Preconditions: Hook file exists
    Steps:
      1. Run `grep -n 'new AudioContext' src/ui/hooks/useSoundNotifications.ts` — note line numbers
      2. Verify the `new AudioContext` call is inside a function body, not at module level or in useState initializer
      3. Run `grep -B2 'new AudioContext' src/ui/hooks/useSoundNotifications.ts` — expect preceding line to be inside a function/conditional
    Expected Result: AudioContext is lazily created inside a play function or getter
    Failure Indicators: AudioContext at module level or in useEffect
    Evidence: .sisyphus/evidence/task-11-lazy-context.txt
  ```

  **Commit**: YES
  - Message: `feat(sound): add useSoundNotifications hook with Web Audio API`
  - Files: `src/ui/hooks/useSoundNotifications.ts`
  - Pre-commit: `bun run build`

- [ ] 12. SessionSwimlane Component

  **What to do**:
  - Create `src/ui/components/SessionSwimlane.tsx` and `src/ui/components/SessionSwimlane.css`
  - Component accepts `sessionTimeSeries: SessionTimeSeriesPayload` and renders one horizontal row per session
  - Each row shows:
    - Session label (left, fixed width ~80px, truncated)
    - Horizontal time bar chart (SVG, matching sparkline bucket count, showing that session's activity values)
    - Agent-colored bars: determine agent from session label/ID pattern and assign tone (sisyphus→teal, prometheus→red, atlas→green, other→sand)
    - Background sessions (isBackground: true) get muted tone
  - Rows are sorted: pinned sessions first, then by most recent activity
  - Add pin/unpin button (small icon) per row. Pinned state stored in component-local state (will be lifted to localStorage in integration)
  - Each row height: 16px with 2px gap between rows. Bar height fills row minus 2px padding.
  - SVG viewBox should match the sparkline's bucket count for visual alignment
  - Use same SVG `<defs>` gradient definitions as Sparkline (copy them or factor into shared constant)
  - Apply `rx="1"` and gradient fills to session bars, matching the Sparkline visual style from Task 4/8

  **Must NOT do**:
  - Do NOT create deep component hierarchy (SwimlaneContainer > SwimlaneRow > SwimlaneBar) — keep flat
  - Do NOT add click handlers to individual bars
  - Do NOT add tooltips
  - Do NOT virtualize the row list (sessions are typically <20)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG rendering + visual layout of swimlane rows requires visual-engineering expertise
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for designing the swimlane layout that visually aligns with the sparkline above it

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11, 13)
  - **Blocks**: T17 (wiring into ProjectStrip)
  - **Blocked By**: T3 (needs real session data from wired backend)

  **References**:

  **Pattern References**:
  - `src/ui/components/Sparkline.tsx:285-354` (`renderFull`) — The full sparkline rendering pattern. SessionSwimlane should mirror the SVG viewBox, bucket count, and bar width conventions for visual alignment.
  - `src/ui/components/Sparkline.tsx:54-157` (`computeStackedSegments`) — Shows the height computation pattern. Swimlane uses simpler single-tone bars per session.
  - `src/ui/components/Sparkline.css` — Bar styling classes to reuse (sparkline-bar--{tone}).

  **API/Type References**:
  - `src/types.ts:46-61` (`SessionTimeSeriesEntry`, `SessionTimeSeriesPayload`) — Input data shape. Each entry has `sessionId`, `sessionLabel`, `isBackground`, `values[]`.
  - `src/types.ts:11` (`AgentTone` from Sparkline) — Not in types.ts but defined in Sparkline.tsx. Swimlane needs same tone mapping.

  **WHY Each Reference Matters**:
  - `renderFull` shows the SVG conventions (viewBox, barW, barInset) that swimlane must match for visual alignment.
  - `SessionTimeSeriesPayload` defines the exact data contract the component consumes.

  **Acceptance Criteria**:
  - [ ] `src/ui/components/SessionSwimlane.tsx` and `.css` exist
  - [ ] Component renders one row per session in `sessionTimeSeries.sessions`
  - [ ] Each row has a label and SVG time bars
  - [ ] Bars use agent-colored gradients (matching sparkline visual style)
  - [ ] Background sessions use muted tone
  - [ ] Pin button toggles visibility persistence
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Swimlane renders session rows
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with active sessions, component wired into expanded view (may need T17 first for full test — partial test via storybook-style rendering)
    Steps:
      1. Navigate to http://localhost:4301
      2. Expand a project with active sessions
      3. Query `.session-swimlane .swimlane-row` elements — expect count > 0
      4. Query `.swimlane-row .swimlane-label` — verify text content is not empty
      5. Query `.swimlane-row svg rect` — verify bars exist with gradient fills
      6. Take screenshot of the swimlane area
    Expected Result: Multiple session rows with labels and colored time bars
    Failure Indicators: No rows rendered, empty labels, flat color bars
    Evidence: .sisyphus/evidence/task-12-swimlane-rows.png

  Scenario: Pin button toggles session persistence
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, swimlane visible
    Steps:
      1. Navigate to http://localhost:4301 and expand a project
      2. Find `.swimlane-pin` button on first row
      3. Click the pin button
      4. Assert the row gains `data-pinned="true"` attribute or `.swimlane-row--pinned` class
      5. Click again to unpin
      6. Assert pinned state removed
    Expected Result: Pin toggles visual state on the row
    Failure Indicators: No pin button, no visual change on click
    Evidence: .sisyphus/evidence/task-12-swimlane-pin.png
  ```

  **Commit**: YES
  - Message: `feat(swimlane): add SessionSwimlane component with per-session rows`
  - Files: `src/ui/components/SessionSwimlane.tsx`, `src/ui/components/SessionSwimlane.css`
  - Pre-commit: `bun run build`

- [ ] 13. AddProjectForm Component

  **What to do**:
  - Create `src/ui/components/AddProjectForm.tsx` and `src/ui/components/AddProjectForm.css`
  - Component renders a compact inline form for adding new projects:
    - Text input for `projectRoot` (absolute path, placeholder: "/path/to/project")
    - Optional text input for `label` (placeholder: "Project label")
    - Submit button
    - Status message area (success/error feedback)
  - On submit: call `fetch('POST /api/sources', { body: { projectRoot, label } })` (endpoint from Task 2)
  - Show loading state during request, success message on 200, error message on 400+
  - After successful add, clear the form and call an `onProjectAdded?: () => void` callback prop (so parent can refetch)
  - Form validation: projectRoot must be non-empty, show inline error if empty on submit
  - Style to match control room aesthetic: dark inputs with border, monospace font for path input

  **Must NOT do**:
  - Do NOT add file browser/picker functionality
  - Do NOT validate path existence client-side (server does this)
  - Do NOT add drag-and-drop file upload
  - Do NOT add project removal from this form

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form component with styled inputs matching the control room theme
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for designing a compact inline form that fits the dark dashboard aesthetic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11, 12)
  - **Blocks**: T19 (polish)
  - **Blocked By**: T2 (POST /api/sources endpoint must exist)

  **References**:

  **Pattern References**:
  - `src/ui/components/DashboardHeader.tsx` — Existing header component pattern. AddProjectForm will be placed near the header or in a dropdown.
  - `src/ui/App.css:63-77` (`.header-btn` styles) — Button styling pattern to follow for the submit button.
  - `src/styles/tokens.css` — Use existing design tokens for colors, fonts, spacing, borders.

  **API/Type References**:
  - `src/server/api.ts` (`POST /api/sources`) — Accepts `{ projectRoot: string, label?: string }`, returns `{ ok: true, sourceId }` or `{ ok: false, error }`.

  **WHY Each Reference Matters**:
  - `DashboardHeader` shows component structure and styling patterns used in the app header area.
  - The POST API contract defines exactly what the form submits and what responses to handle.

  **Acceptance Criteria**:
  - [ ] `src/ui/components/AddProjectForm.tsx` and `.css` exist
  - [ ] Form has projectRoot input, optional label input, submit button
  - [ ] Submit calls POST /api/sources with correct payload
  - [ ] Success clears form and shows success message
  - [ ] Error shows error message from API
  - [ ] Empty projectRoot shows validation error without calling API
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Add project form submits successfully
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on port 4301
    Steps:
      1. Navigate to http://localhost:4301
      2. Find the add project form (may be in header area or settings panel)
      3. Fill `.add-project-input[name="projectRoot"]` with "/home/ezotoff/AI_projects/ez-omo-dash"
      4. Fill `.add-project-input[name="label"]` with "test-project"
      5. Click `.add-project-submit` button
      6. Wait for success message to appear (timeout: 5s)
      7. Assert form inputs are cleared after success
    Expected Result: Project added successfully, form cleared, success message shown
    Failure Indicators: No success message, form not cleared, error shown
    Evidence: .sisyphus/evidence/task-13-add-project-success.png

  Scenario: Add project form shows validation error
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:4301
      2. Leave projectRoot input empty
      3. Click submit button
      4. Assert error message appears containing "path" or "required"
      5. Verify no network request was made (or request returned 400)
    Expected Result: Inline validation error, no API call for empty path
    Failure Indicators: No error message, API call with empty path, form submits
    Evidence: .sisyphus/evidence/task-13-add-project-validation.png
  ```

  **Commit**: YES
  - Message: `feat(projects): add AddProjectForm component with API integration`
  - Files: `src/ui/components/AddProjectForm.tsx`, `src/ui/components/AddProjectForm.css`
  - Pre-commit: `bun run build`

---

- [ ] 14. SettingsPanel Component (Config Toggles + Sound Settings)

  **What to do**:
  - Create `src/ui/components/SettingsPanel.tsx` and `src/ui/components/SettingsPanel.css`
  - Renders a slide-out or dropdown panel with two sections:
    - **Display Toggles**: 8 checkboxes/switches, one per `StripConfigState` key, labeled: "Mini Sparkline", "Plan Progress", "Agent Badge", "Last Updated", "Status Dot", "Token Usage", "Background Tasks", "Git Worktrees"
    - **Sound Settings**: Master enable/disable toggle, volume slider (0-100), per-event toggles for "Session Idle", "Plan Complete", "Session Error", and a "Test" button per sound that calls the play function
  - Props: `{ stripConfig: StripConfigState, onToggleStrip: (key) => void, soundConfig: SoundConfig, onSoundConfigChange: (config) => void, onTestSound: (event: 'idle' | 'complete' | 'error') => void, open: boolean, onClose: () => void }`
  - Panel opens from a gear icon button in the DashboardHeader (button added here or in Task 15)
  - Style: dark panel matching control room aesthetic, positioned as overlay or sidebar
  - Close on click outside or pressing Escape

  **Must NOT do**:
  - Do NOT create a generic "Settings Service" abstraction
  - Do NOT use a modal library
  - Do NOT add settings categories/tabs beyond the two sections
  - Do NOT persist settings from this component — the hooks handle persistence

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI panel with toggles, slider, and styled layout requires visual-engineering
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for panel layout, toggle/switch design, and dark theme styling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 15, 16, 17, 18)
  - **Blocks**: T19 (polish)
  - **Blocked By**: T9 (useStripConfig for strip toggle state), T11 (useSoundNotifications for sound controls)

  **References**:

  **Pattern References**:
  - `src/ui/components/DashboardHeader.tsx` — The header where the settings gear button will be placed. Follow button styling.
  - `src/ui/App.css:63-77` (`.header-btn`) — Button style for the gear icon trigger.
  - `src/styles/tokens.css` — All design tokens for consistent styling.

  **API/Type References**:
  - `src/types.ts` (`StripConfigState`) — The 8 boolean toggle keys.
  - `src/types.ts` (`SoundConfig`) — Sound settings shape.

  **WHY Each Reference Matters**:
  - DashboardHeader is where the gear button goes — need to match its styling.
  - Types define exact prop contracts the panel receives.

  **Acceptance Criteria**:
  - [ ] `src/ui/components/SettingsPanel.tsx` and `.css` exist
  - [ ] Panel shows 8 display toggles with correct labels
  - [ ] Panel shows sound master toggle, volume slider, 3 event toggles
  - [ ] "Test" buttons call onTestSound for each event
  - [ ] Panel closes on Escape key or click outside
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings panel opens and shows all toggles
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, settings panel wired into App
    Steps:
      1. Navigate to http://localhost:4301
      2. Click the settings gear button in the header
      3. Wait for `.settings-panel` to appear (timeout: 3s)
      4. Query `.settings-panel .settings-toggle` elements — expect count >= 8
      5. Query `.settings-panel .sound-toggle` elements — expect count >= 3
      6. Query `.settings-panel input[type="range"]` — expect 1 (volume slider)
      7. Take screenshot of open settings panel
    Expected Result: Panel visible with all toggles, slider, and test buttons
    Failure Indicators: Panel doesn't appear, wrong toggle count, no slider
    Evidence: .sisyphus/evidence/task-14-settings-panel.png

  Scenario: Settings panel closes on Escape
    Tool: Playwright (playwright skill)
    Preconditions: Settings panel is open
    Steps:
      1. Open settings panel (click gear)
      2. Assert `.settings-panel` is visible
      3. Press Escape key
      4. Wait 300ms
      5. Assert `.settings-panel` is not visible
    Expected Result: Panel closes on Escape
    Failure Indicators: Panel remains visible after Escape
    Evidence: .sisyphus/evidence/task-14-settings-close.png
  ```

  **Commit**: YES
  - Message: `feat(settings): add SettingsPanel with config toggles and sound settings`
  - Files: `src/ui/components/SettingsPanel.tsx`, `src/ui/components/SettingsPanel.css`
  - Pre-commit: `bun run build`

- [ ] 15. DnD Multi-Column Grid Layout in App.tsx

  **What to do**:
  - In `src/ui/App.tsx`: wrap the `.project-stack` with `<DndContext>` from `@dnd-kit/core` and `<SortableContext>` from `@dnd-kit/sortable`
  - Replace the flexbox `.project-stack` with a CSS Grid layout:
    - `grid-template-columns: repeat(var(--grid-cols), 1fr)` where `--grid-cols` comes from `useProjectOrder().columns`
    - Default: 1 column (existing behavior). Support 1, 2, or 3 columns.
  - Wrap each `ProjectStripWithChildren` in a `<SortableItem>` wrapper using `useSortable` hook from @dnd-kit/sortable
  - Handle `onDragEnd` from DndContext: call `useProjectOrder().reorder(oldIndex, newIndex)` to persist new order
  - Use `useProjectOrder().syncIds(sortedProjects.map(p => p.sourceId))` on data change to keep order in sync
  - Apply `useProjectOrder().orderedIds` to re-sort the projects (override status sort when DnD order exists)
  - Add column count control: buttons or dropdown in the header area for 1/2/3 columns
  - In `App.css`: update `.project-stack` from `display: flex; flex-direction: column` to `display: grid; grid-template-columns: repeat(var(--grid-cols, 1), 1fr); gap: var(--sp-2)`
  - Add drag handle visual indicator (grab cursor) to ProjectStrip header

  **Must NOT do**:
  - Do NOT install @dnd-kit/utilities or additional packages
  - Do NOT add drag preview customization (use default)
  - Do NOT add column resizing — equal-width columns only
  - Do NOT remove status-based sorting — it applies within the initial order, DnD overrides it after first reorder

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: DnD integration requires understanding @dnd-kit API, CSS Grid, and state management
  - **Skills**: []
    - No specialized skills — @dnd-kit has good docs

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 16, 17, 18)
  - **Blocks**: T19 (polish)
  - **Blocked By**: T1 (@dnd-kit deps), T10 (useProjectOrder hook for state)

  **References**:

  **Pattern References**:
  - `src/ui/App.tsx:75-87` (`.project-stack` rendering) — The existing map loop that renders ProjectStrips. Wrap with DndContext/SortableContext, change to grid.
  - `src/ui/App.tsx:102-139` (`ProjectStripWithChildren`) — Each strip instance. Wrap with useSortable.
  - `src/ui/App.css:110-117` (`.project-stack` CSS) — Change from flex to grid layout.

  **API/Type References**:
  - `src/ui/hooks/useProjectOrder.ts` — Provides `orderedIds`, `columns`, `reorder`, `syncIds` (from Task 10).

  **External References**:
  - @dnd-kit sortable docs: https://docs.dndkit.com/presets/sortable — SortableContext, useSortable hook, DndContext onDragEnd handler.

  **WHY Each Reference Matters**:
  - Lines 75-87 are the exact render loop to modify with DnD wrappers.
  - `useProjectOrder` provides the reorder callback for DnD onDragEnd.
  - @dnd-kit docs show exact API for SortableContext + useSortable integration.

  **Acceptance Criteria**:
  - [ ] Projects can be dragged and dropped to reorder
  - [ ] Drag order persists across page refresh (localStorage)
  - [ ] Column count can be changed to 1, 2, or 3
  - [ ] Grid layout renders correctly at each column count
  - [ ] New projects appear in the grid without breaking order
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Drag and drop reorder works
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, at least 2 projects
    Steps:
      1. Navigate to http://localhost:4301
      2. Get text of first `.strip-label` element (original first project)
      3. Drag first `.project-strip` to second position using Playwright drag API
      4. Wait 500ms for state update
      5. Get text of first `.strip-label` again — assert it's different from original
      6. Reload page
      7. Get text of first `.strip-label` — assert it matches post-drag order (persisted)
    Expected Result: Drag reorder works and persists across refresh
    Failure Indicators: Can't drag, order reverts on refresh, labels don't change
    Evidence: .sisyphus/evidence/task-15-dnd-reorder.png

  Scenario: Multi-column layout works
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, at least 2 projects
    Steps:
      1. Navigate to http://localhost:4301
      2. Find and click the 2-column layout button
      3. Wait 300ms
      4. Assert `.project-stack` has CSS `grid-template-columns` containing two `fr` values
      5. Take screenshot showing 2-column layout
      6. Click 3-column button
      7. Take screenshot showing 3-column layout
    Expected Result: Projects arrange into 2 then 3 columns
    Failure Indicators: Grid doesn't change, projects stack vertically regardless
    Evidence: .sisyphus/evidence/task-15-multi-column.png
  ```

  **Commit**: YES
  - Message: `feat(layout): implement multi-column DnD grid layout in App`
  - Files: `src/ui/App.tsx`, `src/ui/App.css`
  - Pre-commit: `bun run build`

- [ ] 16. Wire Config Toggles into ProjectStrip

  **What to do**:
  - In `src/ui/components/ProjectStrip.tsx`: accept new optional prop `stripConfig?: StripConfigState`
  - Conditionally render each element in the collapsed header based on config:
    - `showStatusDot` → `.strip-status-dot` (line 52)
    - `showMiniSparkline` → `.sparkline-slot--mini` (line 54)
    - `showAgentBadge` → `.strip-agent-badge` (line 55)
    - `showPlanProgress` → `.plan-slot--compact` (line 56)
    - `showLastUpdated` → `.strip-updated` (line 57)
  - For expanded body sections, conditionally render:
    - `showTokenUsage` → Token usage section (lines 119-137)
    - `showBackgroundTasks` → Background tasks section (lines 99-116)
    - `showGitWorktrees` → Reserved for future (just add the config key check, no section exists yet)
  - If `stripConfig` is undefined (not passed), show all elements (backward compatible)
  - In `src/ui/App.tsx`: pass `stripConfig` from `useStripConfig()` hook to each `ProjectStripWithChildren`

  **Must NOT do**:
  - Do NOT restructure the ProjectStrip component — just add conditional rendering
  - Do NOT add animation to element show/hide — instant toggle
  - Do NOT change CSS class names

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple conditional rendering — add `{config?.showX && ...}` wrappers around existing JSX
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15, 17, 18)
  - **Blocks**: T19 (polish)
  - **Blocked By**: T9 (useStripConfig hook must exist)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:51-58` (collapsed header elements) — Each element on this line gets wrapped in `{config?.showX !== false && ...}`. The specific lines to modify.
  - `src/ui/components/ProjectStrip.tsx:119-137` (token usage section) — Already has `{tokenUsage && ...}` conditional. Add `config?.showTokenUsage !== false` check.
  - `src/ui/components/ProjectStrip.tsx:99-116` (background tasks section) — Add `config?.showBackgroundTasks !== false` check.

  **API/Type References**:
  - `src/types.ts` (`StripConfigState`) — The 8 boolean config keys to check.
  - `src/ui/components/ProjectStrip.tsx:31-41` (`ProjectStripProps`) — Add optional `stripConfig` prop here.

  **WHY Each Reference Matters**:
  - Lines 51-58 are the exact JSX elements to wrap with conditionals.
  - The existing `{tokenUsage && ...}` pattern shows how conditional rendering is already done in this component.

  **Acceptance Criteria**:
  - [ ] Each of 8 config toggles hides/shows its corresponding element
  - [ ] Untoggled elements are completely removed from DOM (not just hidden via CSS)
  - [ ] Missing `stripConfig` prop shows all elements (backward compat)
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Toggle hides mini sparkline from collapsed view
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, settings panel wired
    Steps:
      1. Navigate to http://localhost:4301
      2. Assert `.sparkline-slot--mini` is visible in the first project strip
      3. Open settings panel, uncheck "Mini Sparkline" toggle
      4. Assert `.sparkline-slot--mini` is no longer in the DOM for any project strip
      5. Re-check "Mini Sparkline"
      6. Assert `.sparkline-slot--mini` reappears
    Expected Result: Toggle controls sparkline visibility in real-time
    Failure Indicators: Element remains after toggle, or doesn't reappear
    Evidence: .sisyphus/evidence/task-16-config-toggles.png

  Scenario: Config persists across refresh
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:4301
      2. Open settings, uncheck "Agent Badge"
      3. Assert `.strip-agent-badge` is not in DOM
      4. Reload page
      5. Assert `.strip-agent-badge` is still not in DOM (persisted)
    Expected Result: Toggle state survives page reload
    Failure Indicators: Elements reappear after reload
    Evidence: .sisyphus/evidence/task-16-config-persist.png
  ```

  **Commit**: YES
  - Message: `feat(config): wire strip config toggles into ProjectStrip collapsed and expanded views`
  - Files: `src/ui/components/ProjectStrip.tsx`, `src/ui/App.tsx`
  - Pre-commit: `bun run build`

- [ ] 17. Wire SessionSwimlane into Expanded ProjectStrip

  **What to do**:
  - In `src/ui/components/ProjectStrip.tsx`: add a new `children` slot for the session swimlane: `sessionSwimlane: React.ReactNode`
  - Add a new `.strip-section` in the expanded body (after the sparkline section, before plan section) that renders the swimlane:
    ```
    <div className="strip-section">
      <span className="strip-section-label">Session Activity</span>
      <div className="swimlane-slot">{children?.sessionSwimlane}</div>
    </div>
    ```
  - In `src/ui/App.tsx` `ProjectStripWithChildren`: add the SessionSwimlane to the children object:
    ```
    sessionSwimlane: (
      <SessionSwimlane sessionTimeSeries={project.sessionTimeSeries} />
    )
    ```
  - Import `SessionSwimlane` in App.tsx
  - Add `.swimlane-slot` CSS in `ProjectStrip.css`: `width: 100%; min-height: 48px;`

  **Must NOT do**:
  - Do NOT modify SessionSwimlane component itself — just wire it in
  - Do NOT add session swimlane to collapsed view
  - Do NOT add loading states for the swimlane

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple wiring — add slot to children pattern, import and render component
  - **Skills**: []
    - No specialized skills

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15, 16, 18)
  - **Blocks**: T19 (polish)
  - **Blocked By**: T12 (SessionSwimlane component must exist)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:35-41` (`children` prop shape) — Add `sessionSwimlane: React.ReactNode` to the existing children object type.
  - `src/ui/components/ProjectStrip.tsx:65-68` (sparkline section) — The section after which to insert the swimlane section.
  - `src/ui/App.tsx:109-136` (`ProjectStripWithChildren` children) — Where to add the `sessionSwimlane` entry.

  **API/Type References**:
  - `src/ui/components/SessionSwimlane.tsx` — The component to import and render (from Task 12).
  - `src/types.ts:54-61` (`SessionTimeSeriesPayload`) — Data passed to SessionSwimlane.

  **WHY Each Reference Matters**:
  - The children pattern (lines 35-41) is how ProjectStrip receives render-props. Must extend, not replace.
  - Lines 65-68 show the insertion point for the new section.

  **Acceptance Criteria**:
  - [ ] Session swimlane appears in expanded project view
  - [ ] Swimlane is between Activity sparkline and Plan progress sections
  - [ ] Swimlane receives `sessionTimeSeries` data from project snapshot
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Swimlane visible in expanded view
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, project with sessions
    Steps:
      1. Navigate to http://localhost:4301
      2. Click a project strip to expand
      3. Wait for `.strip-body-inner` to appear
      4. Query `.session-swimlane` inside the expanded strip — expect it exists
      5. Query `.strip-section-label` elements — assert one contains text "Session Activity"
      6. Take screenshot of expanded view showing swimlane
    Expected Result: Session swimlane section visible with session rows
    Failure Indicators: No swimlane found, section label missing
    Evidence: .sisyphus/evidence/task-17-swimlane-wired.png

  Scenario: Swimlane not in collapsed view
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:4301
      2. Ensure all projects are collapsed (no [data-expanded="true"])
      3. Query `.session-swimlane` on page — expect count 0 (not visible when collapsed)
    Expected Result: Swimlane only appears in expanded view
    Failure Indicators: Swimlane visible when collapsed
    Evidence: .sisyphus/evidence/task-17-swimlane-collapsed.png
  ```

  **Commit**: YES
  - Message: `feat(swimlane): wire SessionSwimlane into expanded ProjectStrip view`
  - Files: `src/ui/components/ProjectStrip.tsx`, `src/ui/components/ProjectStrip.css`, `src/ui/App.tsx`
  - Pre-commit: `bun run build`

- [ ] 18. Wire Sound Notification Triggers into Polling Loop

  **What to do**:
  - In `src/ui/App.tsx` (or a new wrapper component): integrate `useSoundNotifications` hook
  - Compare consecutive polling snapshots to detect status transitions:
    - **Session idle**: A project's `mainSession.status` transitions from `busy`/`running_tool`/`thinking` to `idle` → call `playSessionIdle()`
    - **Plan complete**: A project's `planProgress.status` transitions from `in progress` to `complete` → call `playPlanComplete()`
    - **Session error**: A project's `mainSession.status` becomes `unknown` after being any active state, or `errorHint` appears → call `playSessionError()`
  - Keep a `useRef` of the previous snapshot for comparison. On each new `data` from `useDashboardData`, diff against previous.
  - Only trigger sounds when `connected` is true (don't alert on initial load)
  - Add a `firstLoad` ref that skips sound on the very first successful data fetch (prevents alerts on page load)
  - Pass sound config and play functions down to SettingsPanel (if not already done in T14)

  **Must NOT do**:
  - Do NOT trigger sounds on every poll — only on STATUS TRANSITIONS
  - Do NOT play sounds when page first loads (first data fetch)
  - Do NOT play sounds when `connected` is false
  - Do NOT add sound to background task status changes (only main session + plan)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: State comparison logic with useRef + conditional sound triggers
  - **Skills**: []
    - No specialized skills

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15, 16, 17)
  - **Blocks**: T19 (polish)
  - **Blocked By**: T11 (useSoundNotifications hook must exist)

  **References**:

  **Pattern References**:
  - `src/ui/hooks/useDashboardData.ts:27-51` (polling loop) — Shows where new data arrives. The diff logic reads `data` state after each successful fetch.
  - `src/ui/App.tsx:39-91` (App component) — Where `useDashboardData` results are consumed. Sound trigger logic goes here or in a wrapper.

  **API/Type References**:
  - `src/types.ts:82-108` (`ProjectSnapshot`) — `mainSession.status` and `planProgress.status` are the fields to diff.
  - `src/types.ts:16-19` (`SessionStatus`, `PlanStatus`) — The status enum values for transition detection.
  - `src/ui/hooks/useSoundNotifications.ts` — Provides `playSessionIdle`, `playPlanComplete`, `playSessionError` (from Task 11).

  **WHY Each Reference Matters**:
  - The polling loop (useDashboardData) is where new data arrives — sound triggers must fire on data change.
  - ProjectSnapshot status fields are the exact values to compare for transitions.

  **Acceptance Criteria**:
  - [ ] Sound triggers on main session status transition to idle
  - [ ] Sound triggers on plan progress transition to complete
  - [ ] Sound triggers on session error/unknown transition
  - [ ] No sound on first data load
  - [ ] No sound when disconnected
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No sound on initial page load
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:4301 (fresh page load)
      2. Wait for data to load (`.project-strip` appears)
      3. Check that AudioContext was NOT created (via window.__audioContextCreated flag if added for testing, or by monitoring console)
      4. Verify no audio playback occurred
    Expected Result: Page loads silently, no sounds on first data fetch
    Failure Indicators: Sound plays on initial load
    Evidence: .sisyphus/evidence/task-18-no-initial-sound.txt

  Scenario: Sound configuration respected
    Tool: Bash
    Preconditions: Build succeeds
    Steps:
      1. Run `bun run build` — expect exit 0
      2. Run `grep 'playSessionIdle\|playPlanComplete\|playSessionError' src/ui/App.tsx` — expect matches (triggers are wired)
      3. Run `grep 'firstLoad\|prevSnapshot\|previousData' src/ui/App.tsx` — expect match (diff logic present)
    Expected Result: Sound triggers wired with diff logic and first-load guard
    Failure Indicators: No play function calls in App.tsx, no diff logic
    Evidence: .sisyphus/evidence/task-18-sound-wiring.txt
  ```

  **Commit**: YES
  - Message: `feat(sound): wire sound notification triggers into data polling loop`
  - Files: `src/ui/App.tsx`
  - Pre-commit: `bun run build`

- [ ] 19. Visual Polish Pass — Consistency, Density Modes, Edge Cases

  **What to do**:
  - Audit all new and modified components for visual consistency:
    - Verify gradient stops, glow colors, and rounded corners are identical between `renderMini()`, `renderFull()`, and `SessionSwimlane`
    - Ensure all bar tones (teal, red, green, sand, muted) look correct in both 1-column and 2/3-column grid layouts
    - Verify font sizes, spacing, and alignment match between collapsed header elements (status dot, agent badge, sparkline, plan progress, timestamp)
  - Test and fix edge cases:
    - **Empty state**: 0 projects — verify AddProjectForm is accessible and app doesn't crash
    - **Single project**: Layout looks correct in all column modes (1/2/3 cols)
    - **Many projects**: 10+ projects — verify scrolling, grid layout, and DnD still work
    - **No sessions**: Project with zero active sessions — swimlane shows "No active sessions" placeholder
    - **Rapid expand/collapse**: Quickly toggling multiple project strips doesn't cause rendering artifacts
    - **All toggles off**: Every config toggle disabled — collapsed strip still has header with label
  - Density mode compatibility:
    - If `useDensityMode` exists, verify compact/normal/comfortable modes don't break any new components
    - SessionSwimlane row heights should respect density (compact: 14px, normal: 16px, comfortable: 20px)
  - AddProjectForm polish:
    - Form input focus states visible (border color change on focus)
    - Error/success messages fade after 3s using CSS transition
  - SettingsPanel polish:
    - Toggle switches have visible on/off states (color change)
    - Volume slider shows current value
    - Panel backdrop dims the main content slightly
  - DnD polish:
    - Drag handle cursor (`grab` → `grabbing` on drag)
    - Dragged item has subtle elevation (`box-shadow`, `opacity: 0.9`)
    - Drop target area highlighted during drag

  **Must NOT do**:
  - Do NOT add framer-motion or any animation library
  - Do NOT change any functional logic — styling and edge case fixes only
  - Do NOT refactor component structure
  - Do NOT add new features
  - Do NOT add excessive comments or documentation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Pure visual polish requires eye for detail and UI/UX sensibility
  - **Skills**: [`frontend-ui-ux`, `playwright`]
    - `frontend-ui-ux`: Needed for visual consistency auditing and polish decisions
    - `playwright`: Needed for running visual QA scenarios to verify polish changes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 5)
  - **Blocks**: T20 (integration QA)
  - **Blocked By**: T5, T6, T7, T8, T13, T14, T15, T16, T17, T18 (all implementation tasks)

  **References**:

  **Pattern References**:
  - `src/styles/tokens.css` — All design tokens for spacing, colors, typography. Polish must use these, not hardcoded values.
  - `src/ui/components/Sparkline.css` — Bar styling classes to verify consistency across mini/full/swimlane.
  - `src/ui/components/ProjectStrip.css` — Strip layout CSS to verify density mode compatibility.
  - `src/ui/App.css` — Grid layout CSS to verify multi-column edge cases.
  - `/home/ezotoff/AI_projects/present/components/shared/ScaledBarChart.tsx:133-224` — `present` project BAR_STYLES as the visual reference target.

  **API/Type References**:
  - `src/ui/hooks/useDensityMode.ts` — Density mode hook. Check if it affects spacing tokens used by new components.

  **WHY Each Reference Matters**:
  - `tokens.css` is the single source of truth for visual consistency — all polish changes must reference it.
  - The `present` project is the visual benchmark we're trying to match.

  **Acceptance Criteria**:
  - [ ] All gradients/glows visually consistent across mini sparkline, full sparkline, and session swimlane
  - [ ] Empty state (0 projects) renders gracefully with AddProjectForm accessible
  - [ ] Single project in 2/3-column mode doesn't stretch awkwardly
  - [ ] 10+ projects render and scroll correctly
  - [ ] All toggles off → collapsed strip still shows project label
  - [ ] No sessions → swimlane shows placeholder text
  - [ ] DnD drag handle visual feedback works (cursor, shadow)
  - [ ] SettingsPanel backdrop and toggle states are clear
  - [ ] `bun run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Empty state renders gracefully
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, ALL projects removed from sources.json (backup first)
    Steps:
      1. Navigate to http://localhost:4301
      2. Wait for page load (timeout: 5s)
      3. Assert no `.project-strip` elements exist
      4. Assert AddProjectForm is visible (`.add-project-input` or form trigger button)
      5. Assert no JavaScript errors in console
      6. Take screenshot of empty state
    Expected Result: Clean empty state with clear path to add a project
    Failure Indicators: Crash, error overlay, or no way to add projects
    Evidence: .sisyphus/evidence/task-19-empty-state.png

  Scenario: Visual consistency across sparkline modes
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, at least 1 project with activity
    Steps:
      1. Navigate to http://localhost:4301
      2. Take screenshot of collapsed strip showing mini sparkline
      3. Click to expand
      4. Take screenshot of full sparkline
      5. Take screenshot of session swimlane
      6. Compare gradient colors visually — teal bars should match across all 3 views
      7. Verify glow lines present in full sparkline and swimlane
    Expected Result: Consistent gradient/glow styling across all time bar views
    Failure Indicators: Color mismatch between views, missing glow in some views
    Evidence: .sisyphus/evidence/task-19-visual-consistency.png

  Scenario: Multi-column edge cases
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, at least 1 project
    Steps:
      1. Navigate to http://localhost:4301
      2. Switch to 3-column mode
      3. With 1 project: take screenshot — assert project doesn't stretch full 3 cols
      4. With 2 projects: take screenshot — verify clean 2-of-3 layout
      5. Expand a project in multi-column mode — verify expanded view spans correctly
      6. Test DnD in multi-column mode — verify reorder works
    Expected Result: Grid layout handles all project counts gracefully
    Failure Indicators: Stretched single project, broken layout with odd counts, DnD fails in multi-col
    Evidence: .sisyphus/evidence/task-19-multicol-edge.png

  Scenario: All config toggles off
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, settings panel accessible
    Steps:
      1. Navigate to http://localhost:4301
      2. Open settings panel
      3. Uncheck ALL 8 display toggles
      4. Close settings panel
      5. Assert `.strip-header` still shows project label text
      6. Assert no other elements visible in collapsed strip besides label and expand trigger
      7. Take screenshot
    Expected Result: Minimal collapsed strip with just the project label
    Failure Indicators: Strip collapses to nothing, label disappears, or crash
    Evidence: .sisyphus/evidence/task-19-all-toggles-off.png
  ```

  **Evidence to Capture:**
  - [ ] task-19-empty-state.png
  - [ ] task-19-visual-consistency.png
  - [ ] task-19-multicol-edge.png
  - [ ] task-19-all-toggles-off.png

  **Commit**: YES
  - Message: `style(polish): visual consistency pass, edge case fixes, density mode compat`
  - Files: Multiple CSS + TSX files
  - Pre-commit: `bun run build`

- [ ] 20. Full Integration QA — All Features Working Together

  **What to do**:
  - Execute a comprehensive end-to-end QA pass across ALL features implemented in Tasks 1-19
  - Start dev server (`bun run dev`) and run the full test suite (`bun run test`)
  - Verify each feature works in isolation AND in combination:
    1. **Bug fixes (T5-T8)**: Mini sparkline colors, background bars, no overlap, gradient styling
    2. **Project registration (T2+T13)**: Add a new project via form, verify it appears in the grid
    3. **DnD layout (T15)**: Reorder projects, switch columns, verify persistence
    4. **Config toggles (T9+T14+T16)**: Toggle elements, verify persistence, verify toggles work in multi-column
    5. **Session swimlane (T3+T12+T17)**: Verify swimlane renders in expanded view with real session data
    6. **Sound notifications (T11+T18)**: Verify sounds trigger on status transitions (may need to simulate by watching active session)
  - Test cross-feature interactions:
    - Add project → reorder via DnD → toggle some config options → expand and verify swimlane → verify sounds
    - DnD reorder + page refresh → order persists
    - Config toggle + page refresh → toggles persist
    - Multi-column + expand project → layout correct
    - All features after clearing localStorage → graceful defaults
  - Run `bun run build` final time to confirm zero build errors
  - Collect all evidence screenshots/outputs into `.sisyphus/evidence/task-20-*`

  **Must NOT do**:
  - Do NOT fix bugs found — log them and report. Fixes go back to the specific task owner.
  - Do NOT modify source code — QA only
  - Do NOT skip any feature — ALL must be verified

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive QA requires methodical testing across all features
  - **Skills**: [`playwright`]
    - `playwright`: Essential for browser-based visual and interaction testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 5, after T19)
  - **Blocks**: F1, F2, F3, F4 (Final Verification Wave)
  - **Blocked By**: T19 (visual polish must be complete)

  **References**:

  **Pattern References**:
  - All QA scenarios from Tasks 1-19 — re-execute each one in sequence
  - `.sisyphus/evidence/` — Check that all prior task evidence files exist

  **API/Type References**:
  - `src/server/api.ts` — All API endpoints to test: GET /health, GET /projects, GET /sources, POST /sources
  - `src/types.ts` — All types to verify data shapes match

  **WHY Each Reference Matters**:
  - Prior QA scenarios serve as the regression test suite. Re-running them validates nothing broke during later tasks.
  - API endpoints are the backend integration points that must all return correct data.

  **Acceptance Criteria**:
  - [ ] `bun run build` exits 0
  - [ ] `bun run test` passes (if tests exist)
  - [ ] All 4 bug fixes verified via Playwright screenshots
  - [ ] All 5 features functional via Playwright + curl
  - [ ] Cross-feature interactions all pass
  - [ ] localStorage persistence verified for: config toggles, project order, sound config
  - [ ] All evidence files collected in `.sisyphus/evidence/task-20-*`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full feature walkthrough — happy path
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running on port 4301, at least 1 project registered
    Steps:
      1. Navigate to http://localhost:4301
      2. Verify page loads without errors (no error overlays)
      3. Check collapsed strip: verify mini sparkline has agent-specific colors (not all teal)
      4. Check collapsed strip: verify muted background bars visible in mini sparkline
      5. Expand a project strip
      6. Verify no element overlap in expanded view
      7. Verify gradient fills and glow lines on full sparkline bars
      8. Verify session swimlane section visible with rows
      9. Collapse project
     10. Open settings panel (gear icon)
     11. Uncheck "Agent Badge" toggle
     12. Close settings panel
     13. Verify `.strip-agent-badge` removed from DOM
     14. Switch to 2-column layout
     15. Verify grid has 2 columns
     16. Drag first project to second position
     17. Verify order changed
     18. Reload page
     19. Verify: agent badge still hidden, 2-column layout persisted, drag order persisted
     20. Take final full-page screenshot
    Expected Result: All features work together, persistence survives reload
    Failure Indicators: Any step fails — document which and continue
    Evidence: .sisyphus/evidence/task-20-full-walkthrough.png

  Scenario: Add project end-to-end
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:4301
      2. Count existing `.project-strip` elements
      3. Find and fill AddProjectForm with projectRoot: "/home/ezotoff/AI_projects/ez-omo-dash"
      4. Submit the form
      5. Wait for success message (timeout: 5s)
      6. Wait for next poll cycle (up to 5s)
      7. Count `.project-strip` elements — expect >= previous count
      8. Take screenshot showing new project in grid
    Expected Result: New project appears in dashboard after form submission
    Failure Indicators: Form error, project doesn't appear, count unchanged
    Evidence: .sisyphus/evidence/task-20-add-project-e2e.png

  Scenario: API health and data shape verification
    Tool: Bash (curl)
    Preconditions: Dev server running on port 4301
    Steps:
      1. `curl -s http://localhost:4301/api/health | jq .ok` — expect true
      2. `curl -s http://localhost:4301/api/projects | jq '.projects | length'` — expect >= 0
      3. `curl -s http://localhost:4301/api/projects | jq '.projects[0] | keys'` — verify has: sourceId, label, mainSession, planProgress, sessionTimeSeries, sparklineData
      4. `curl -s http://localhost:4301/api/sources | jq '.sources | length'` — expect >= 0
    Expected Result: All API endpoints return correct data shapes
    Failure Indicators: 500 errors, missing fields, malformed JSON
    Evidence: .sisyphus/evidence/task-20-api-health.txt

  Scenario: Build and test pass clean
    Tool: Bash
    Preconditions: All code changes committed
    Steps:
      1. Run `bun run build` — expect exit 0
      2. Run `bun run test 2>&1 || true` — capture output
      3. Check for TypeScript errors: `grep -c 'error TS' build-output.txt` — expect 0
    Expected Result: Clean build, tests pass
    Failure Indicators: Build errors, test failures
    Evidence: .sisyphus/evidence/task-20-build-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-20-full-walkthrough.png
  - [ ] task-20-add-project-e2e.png
  - [ ] task-20-api-health.txt
  - [ ] task-20-build-test.txt

  **Commit**: NO (QA only — no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no framer-motion, no howler.js, no zustand imports.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Start dev server (`bun run dev`). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-feature integration: DnD reorder + config toggle persistence + sound triggers. Test edge cases: empty state (no projects), single project, 10+ projects. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `chore(deps): add @dnd-kit/core, @dnd-kit/sortable and new type defs` — package.json, types.ts
- **T2**: `feat(registry): restore write functions and add POST /api/sources` — sources-registry.ts, api.ts
- **T3**: `fix(backend): wire derivePerSessionTimeSeries in multi-project service` — multi-project.ts
- **T4**: `style(sparkline): add SVG gradient/glow definitions and bar CSS overhaul` — Sparkline.css, Sparkline.tsx
- **T5**: `fix(sparkline): use per-agent colors in mini mode` — Sparkline.tsx
- **T6**: `fix(sparkline): render background activity as muted bars` — Sparkline.tsx
- **T7**: `fix(sparkline): resolve expanded view element overlap and positioning` — Sparkline.tsx, Sparkline.css, ProjectStrip.css
- **T8**: `style(sparkline): apply gradient/glow/rounded bar styling` — Sparkline.tsx, Sparkline.css
- **T9**: `feat(config): add useStripConfig hook with localStorage persistence` — useStripConfig.ts
- **T10**: `feat(layout): add useProjectOrder hook with localStorage persistence` — useProjectOrder.ts
- **T11**: `feat(sound): add useSoundNotifications hook with Web Audio API` — useSoundNotifications.ts
- **T12**: `feat(swimlane): add SessionSwimlane component` — SessionSwimlane.tsx, SessionSwimlane.css
- **T13**: `feat(projects): add AddProjectForm component` — AddProjectForm.tsx, AddProjectForm.css
- **T14**: `feat(settings): add SettingsPanel with config toggles and sound settings` — SettingsPanel.tsx, SettingsPanel.css
- **T15**: `feat(layout): implement multi-column DnD grid in App` — App.tsx, App.css
- **T16**: `feat(config): wire strip config toggles into ProjectStrip` — ProjectStrip.tsx, App.tsx
- **T17**: `feat(swimlane): wire SessionSwimlane into expanded ProjectStrip` — ProjectStrip.tsx, App.tsx
- **T18**: `feat(sound): wire sound notification triggers into polling loop` — useDashboardData.ts or App.tsx
- **T19**: `style(polish): visual consistency pass, density modes, edge cases` — multiple files
- **T20**: `test(qa): full integration QA with Playwright` — evidence only

---

## Success Criteria

### Verification Commands
```bash
bun run build               # Expected: exits 0, no errors
bun run test                # Expected: all tests pass
curl localhost:4301/api/health  # Expected: {"ok":true,"version":"0.1.0"}
curl -X POST localhost:4301/api/sources -H 'Content-Type: application/json' -d '{"projectRoot":"/tmp/test"}' # Expected: {"ok":true}
```

### Final Checklist
- [ ] All 4 bugs verified fixed (per-agent colors, background bars, no overlap, styled bars)
- [ ] Project addition persists to sources.json
- [ ] DnD reorder works and persists across refresh
- [ ] Config toggles hide/show elements and persist across refresh
- [ ] Session swimlanes display per-session colored rows
- [ ] Sound notifications fire on configured events
- [ ] Zero forbidden patterns (no framer-motion, no howler, no zustand, no CSS-in-JS)
- [ ] All "Must NOT Have" items absent from codebase
