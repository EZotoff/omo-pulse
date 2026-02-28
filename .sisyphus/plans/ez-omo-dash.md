# ez-omo-dash: Multi-Project OpenCode Dashboard

## TL;DR

> **Quick Summary**: Build a web-based multi-project monitoring dashboard for OpenCode AI coding sessions. Reads from the existing global SQLite database and sources registry to display 10+ projects simultaneously with collapsible "control panel strips", per-session time-series activity, and plan progress visualization.
>
> **Deliverables**:
> - Bun+Hono+Vite+React web application
> - Multi-project REST API aggregating data from all registered OpenCode sources
> - Collapsible project strip UI with sparklines, status indicators, plan progress
> - Per-session time-series visualization (extending existing per-agent breakdown)
> - Expandable detail views for drilling into individual projects/sessions
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves + final verification
> **Critical Path**: Task 1 → Task 4 → Task 7 → Task 11 → Task 14 → Task 16 → F1-F4

**Reference Dashboard**: The existing `oh-my-opencode-dashboard@0.4.0` source code is at:
`/home/ezotoff/.bun/install/cache/oh-my-opencode-dashboard@0.4.0@@registry.npmmirror.com@@@1/`
(Abbreviated as `$REF/` in references below)

---

## Context

### Original Request
Build a dashboard for monitoring multiple OpenCode AI coding projects simultaneously. The existing `oh-my-opencode-dashboard` only supports viewing one project at a time via a dropdown. The user needs a "Control Room" view showing 10+ projects on one screen, with collapsible strips that can compress to thin "control panel" lines showing key activity indicators.

### Interview Summary
**Key Discussions**:
- Analyzed existing dashboard architecture: React/TypeScript/Hono/Bun, single-project view via sources dropdown
- OpenCode stores all data in a single global SQLite at `~/.local/share/opencode/opencode.db` (3.4GB)
- Sources registry (`~/.local/share/opencode/dashboard/sources.json`) maps project roots to IDs
- Technology decision: Hybrid architecture — Bun+Hono+SQLite data layer + React web client
- TUI deferred to follow-up (Ratatui preferred for future)
- Agent interface deferred but API designed for future agent consumption
- Tests after implementation

**Research Findings**:
- Data ingestion simplification: Since all projects share one SQLite, multi-project = calling existing ingestion N times for N sources — no separate aggregation DB needed
- Time-series currently tracks per-agent (sisyphus/prometheus/atlas/background) in 2s buckets over 5min window
- Plan progress reads from `.sisyphus/boulder.json` per project root
- Existing dashboard has comprehensive data normalization and fallback handling

### Metis Review
**Identified Gaps** (addressed):
- Data ingestion strategy unclear → RESOLVED: Read same global SQLite, no aggregation DB
- Auto-discovery vs registry → RESOLVED: Use existing manual sources registry
- SQLite 3.4GB performance → Applied: WAL-mode read-only, query limits
- WebSocket vs polling → Applied: Start with polling (2s interval, matching existing)
- Per-session time-series not in existing code → Added: New ingestion module needed

---

## Work Objectives

### Core Objective
Create a multi-project web dashboard that displays 10+ OpenCode projects on a single screen with collapsible, information-dense "control panel strips" showing real-time activity, per-session time-series, and plan progress.

### Concrete Deliverables
- `ez-omo-dash` web application (Bun+Hono+Vite+React)
- Multi-project REST API: `/api/health`, `/api/projects`, `/api/projects/:id`
- Collapsible project strip component with sparkline, status, plan progress
- Per-session time-series visualization (sessions within each project shown separately)
- Expand/collapse mechanics for density scaling (2-5 projects → 10+)
- Dark/light theme support

### Definition of Done
- [ ] `bun run dev` starts the dashboard on a configured port
- [ ] Dashboard displays data for 2+ registered projects simultaneously
- [ ] Each project shows as a collapsible strip with sparkline activity
- [ ] Per-session time-series shows individual sessions within each project
- [ ] Plan/boulder progress displayed per project
- [ ] Strips collapse to thin ~40px bars showing key indicators
- [ ] Scales to 10+ projects in scrollable view
- [ ] `bun test` passes all tests
- [ ] `bun run build` produces production build

### Must Have
- Multi-project simultaneous view (not a dropdown switcher)
- Collapsible project strips with sparkline activity visualization
- Per-session time-series (which sessions are active over time)
- Plan/boulder progress bars per project
- Read-only access to existing OpenCode SQLite + sources registry
- REST API endpoints returning structured JSON (agent-consumable in future)
- Dark and light theme support
- Responsive to 2-5 projects (learnable) and 10+ (dense mode)

### Must NOT Have (Guardrails)
- NO TUI client in this plan (deferred to v2)
- NO agent-facing API implementation beyond basic JSON endpoints
- NO authentication/authorization (localhost assumption)
- NO writing to OpenCode's SQLite database (strictly read-only)
- NO modifying `.sisyphus/boulder.json` or any project files
- NO WebSocket/SSE — polling only (2s interval)
- NO mobile-responsive design
- NO alerting/notifications system
- NO creating a separate aggregation SQLite database
- NO rewriting existing ingestion logic from scratch — adapt/extend existing patterns
- NO excessive comments, JSDoc bloat, or over-abstraction (AI slop guardrails)
- NO `as any` or `@ts-ignore` — proper TypeScript throughout

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: YES (tests after implementation)
- **Framework**: vitest (matching existing dashboard's test setup)
- **Setup**: Task 1 includes vitest configuration

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Data Layer**: Use Bash (bun test / bun run) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent, start immediately):
├── Task 1: Project scaffolding + build config [quick]
├── Task 2: Core types and data models [quick]
├── Task 3: Ingestion layer — copy and adapt from existing dashboard [unspecified-high]
└── Task 4: CSS design tokens + base styles [visual-engineering]

Wave 2 (Data + Components — depends on Wave 1, MAX PARALLEL):
├── Task 5: Multi-project aggregation service (depends: 2, 3) [deep]
├── Task 6: Per-session time-series engine (depends: 2, 3) [deep]
├── Task 7: Hono API routes (depends: 2, 5) [unspecified-high]
├── Task 8: Project strip UI component (depends: 2, 4) [visual-engineering]
├── Task 9: Sparkline + activity bar component (depends: 2, 4) [visual-engineering]
└── Task 10: Plan progress indicator component (depends: 2, 4) [visual-engineering]

Wave 3 (Integration — depends on Wave 2):
├── Task 11: Dashboard layout + multi-project grid (depends: 7, 8, 9, 10) [visual-engineering]
├── Task 12: Expand/collapse + detail view (depends: 8, 11) [visual-engineering]
├── Task 13: Data polling + state management (depends: 7, 11) [unspecified-high]
└── Task 14: Responsive scaling (2-5 → 10+ projects) (depends: 11, 12) [visual-engineering]

Wave 4 (Test + Polish — depends on Wave 3):
├── Task 15: Unit + integration tests (depends: 5, 6, 7, 13) [unspecified-high]
├── Task 16: Playwright QA + final polish (depends: 14, 15) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel verification):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → Task 11 → Task 14 → Task 16 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2-10 | 1 |
| 2 | — | 5-10 | 1 |
| 3 | — | 5, 6, 7 | 1 |
| 4 | — | 8, 9, 10 | 1 |
| 5 | 2, 3 | 7 | 2 |
| 6 | 2, 3 | 11, 13 | 2 |
| 7 | 2, 5 | 11, 13 | 2 |
| 8 | 2, 4 | 11, 12 | 2 |
| 9 | 2, 4 | 11 | 2 |
| 10 | 2, 4 | 11 | 2 |
| 11 | 7, 8, 9, 10 | 12, 13, 14 | 3 |
| 12 | 8, 11 | 14 | 3 |
| 13 | 7, 11 | 15 | 3 |
| 14 | 11, 12 | 16 | 3 |
| 15 | 5, 6, 7, 13 | 16 | 4 |
| 16 | 14, 15 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `unspecified-high`, T4 `visual-engineering`
- **Wave 2**: 6 tasks — T5 `deep`, T6 `deep`, T7 `unspecified-high`, T8 `visual-engineering`, T9 `visual-engineering`, T10 `visual-engineering`
- **Wave 3**: 4 tasks — T11 `visual-engineering`, T12 `visual-engineering`, T13 `unspecified-high`, T14 `visual-engineering`
- **Wave 4**: 2 tasks — T15 `unspecified-high`, T16 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Project scaffolding + build config

  **What to do**:
  - Initialize `package.json` with `bun init` (name: `ez-omo-dash`, type: `module`)
  - Install dependencies: `hono`, `react@18`, `react-dom@18`
  - Install devDependencies: `@vitejs/plugin-react`, `vite@5`, `vitest@1`, `typescript@5`, `bun-types`, `@types/react@18`, `@types/react-dom@18`
  - Create `tsconfig.json` with `strict: true`, `jsx: react-jsx`, `moduleResolution: bundler`, `target: esnext`, paths aliased `~/*` → `./src/*`
  - Create `vite.config.ts` matching reference pattern: React plugin, proxy `/api` to backend port (env `EZ_DASH_API_PORT` defaulting to `51244`), inject `__APP_VERSION__` from package.json
  - Create `index.html` with root div and script tag pointing to `src/main.tsx`
  - Create `src/main.tsx` with bare React render (just `<div>ez-omo-dash loading...</div>`)
  - Create `src/server/start.ts` as Bun entrypoint: Hono app serving static files + API prefix, listening on port from env
  - Add scripts to package.json: `dev` (runs both API + Vite), `dev:api`, `dev:ui`, `build`, `build:ui` (vite build), `start`, `test` (vitest)
  - Create `.gitignore` for `node_modules/`, `dist/`, `.sisyphus/evidence/`
  - Create `src/server/dev.ts` to start the API server standalone (for dev mode)

  **Must NOT do**:
  - Do NOT add any CSS frameworks (Tailwind, etc.) — raw CSS with design tokens (Task 4)
  - Do NOT implement any API routes yet (Task 7)
  - Do NOT create any React components beyond the bare bootstrap

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Boilerplate scaffolding with known patterns; no complex logic
  - **Skills**: []
    - No specialized skills needed for project init
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI work in this task
    - `deployment`: No deployment config yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 2-10 (all subsequent tasks need project structure)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/package.json` — Dependency versions, script patterns, engine constraints (Bun >=1.1.0)
  - `$REF/vite.config.ts` — Vite config with React plugin, API proxy pattern, version injection
  - `$REF/tsconfig.json` — TypeScript config for Bun+React projects
  - `$REF/index.html` — HTML entry structure
  - `$REF/src/main.tsx` — React entry point pattern
  - `$REF/src/server/start.ts` — Hono server startup, static file serving, Bun.serve usage
  - `$REF/src/server/dev.ts` — Dev mode API server standalone

  **WHY Each Reference Matters**:
  - `package.json`: Copy dependency versions exactly to avoid compatibility issues; match script naming conventions
  - `vite.config.ts`: The API proxy pattern is critical — UI dev server proxies `/api/*` to the Hono backend; version injection pattern reused
  - `start.ts/dev.ts`: Understand how Hono serves both API and static Vite build in production vs dev

  **Acceptance Criteria**:
  - [ ] `bun install` completes without errors
  - [ ] `bun run dev:api` starts Hono server on configured port
  - [ ] `bun run dev:ui` starts Vite dev server
  - [ ] `bun run build` produces `dist/` directory with bundled assets
  - [ ] `bun test` runs vitest (0 tests, no errors)
  - [ ] TypeScript compiles cleanly: `bunx tsc --noEmit` exits 0

  **QA Scenarios:**

  ```
  Scenario: Dev API server starts and responds
    Tool: Bash (curl)
    Preconditions: Project scaffolded, dependencies installed
    Steps:
      1. Run `bun run dev:api &` in background
      2. Wait 2s for server startup
      3. `curl -s http://localhost:51244/api/health`
      4. Kill background process
    Expected Result: HTTP 200, body contains `{"ok":true}`
    Failure Indicators: Connection refused, non-200 status, missing ok field
    Evidence: .sisyphus/evidence/task-1-api-health.txt

  Scenario: Vite build produces valid output
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run `bun run build`
      2. Check `ls dist/` for index.html and assets/
      3. Verify `dist/index.html` contains `<div id="root">`
    Expected Result: dist/ contains index.html and at least one .js file in assets/
    Failure Indicators: Build fails, dist/ empty, no JS output
    Evidence: .sisyphus/evidence/task-1-vite-build.txt
  ```

  **Commit**: YES
  - Message: `feat(scaffold): init project with Bun+Hono+Vite+React`
  - Files: `package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/server/start.ts, src/server/dev.ts, .gitignore`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 2. Core types and data models

  **What to do**:
  - Create `src/types.ts` with all shared TypeScript types for the dashboard
  - Define `SourceRegistryEntry` type (matching existing: `id`, `projectRoot`, `label`, `createdAt`, `updatedAt`)
  - Define `ProjectSnapshot` type — the per-project data blob returned by the aggregation service:
    ```ts
    type ProjectSnapshot = {
      sourceId: string
      label: string
      projectRoot: string
      mainSession: { agent: string; currentModel: string | null; currentTool: string; lastUpdated: string; sessionLabel: string; sessionId: string | null; status: SessionStatus }
      planProgress: { name: string; completed: number; total: number; path: string; status: PlanStatus; steps: PlanStep[] }
      timeSeries: TimeSeriesPayload
      backgroundTasks: BackgroundTaskSummary[]
      sessionTimeSeries: SessionTimeSeriesPayload // NEW: per-session breakdown
      tokenUsage?: TokenUsageSummary
      lastUpdatedMs: number
    }
    ```
  - Define `SessionStatus` = `'busy' | 'idle' | 'thinking' | 'running_tool' | 'unknown'`
  - Define `PlanStatus` = `'not started' | 'in progress' | 'complete'`
  - Define `PlanStep` = `{ checked: boolean; text: string }`
  - Define `BackgroundTaskSummary` (matching existing `BackgroundTaskRow` shape but flattened for API)
  - Define `TimeSeriesPayload` and `TimeSeriesSeries` types (matching existing)
  - Define `SessionTimeSeriesPayload` — NEW type for per-session activity breakdown:
    ```ts
    type SessionTimeSeriesEntry = {
      sessionId: string
      sessionLabel: string
      isBackground: boolean
      values: number[] // tool-call counts per bucket
    }
    type SessionTimeSeriesPayload = {
      windowMs: number; bucketMs: number; buckets: number; anchorMs: number; serverNowMs: number
      sessions: SessionTimeSeriesEntry[]
    }
    ```
  - Define `DashboardMultiProjectPayload` — the top-level API response:
    ```ts
    type DashboardMultiProjectPayload = {
      projects: ProjectSnapshot[]
      serverNowMs: number
      pollIntervalMs: number
    }
    ```
  - Define `TokenUsageSummary` type (input/output/total tokens)

  **Must NOT do**:
  - Do NOT implement any logic — this file is TYPES ONLY
  - Do NOT import from reference dashboard — define our own clean types
  - Do NOT use `any` or `unknown` in public type signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions with no complex logic
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Types, not UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5-10 (all Wave 2 tasks import these types)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/ingest/session.ts:6-46` — `SessionMetadata`, `StoredMessageMeta`, `MainSessionView` type definitions
  - `$REF/src/ingest/timeseries.ts:7-23` — `TimeSeriesSeries`, `TimeSeriesPayload` types
  - `$REF/src/ingest/boulder.ts:5-22` — `BoulderState`, `PlanProgress`, `PlanStep` types
  - `$REF/src/ingest/sources-registry.ts:6-23` — `SourceRegistryEntry`, `SourceListItem` types
  - `$REF/src/server/dashboard.ts:21-71` — `DashboardPayload` type (the current single-project shape)
  - `$REF/src/ingest/storage-backend.ts:10-28` — `StorageBackend`, `SqliteReadResult` types

  **WHY Each Reference Matters**:
  - `session.ts` types: Our `ProjectSnapshot.mainSession` shape mirrors `MainSessionView`
  - `timeseries.ts` types: We reuse `TimeSeriesPayload` exactly; add `SessionTimeSeriesPayload` alongside it
  - `boulder.ts` types: `PlanProgress` and `PlanStep` are reused verbatim
  - `dashboard.ts` DashboardPayload: Shows the full single-project payload shape we're wrapping in multi-project

  **Acceptance Criteria**:
  - [ ] `src/types.ts` exists and exports all types listed above
  - [ ] `bunx tsc --noEmit` passes with zero errors
  - [ ] Types are self-contained (no imports from external packages except standard lib)

  **QA Scenarios:**

  ```
  Scenario: Types compile cleanly
    Tool: Bash
    Preconditions: Task 1 scaffolding complete
    Steps:
      1. Run `bunx tsc --noEmit`
      2. Check exit code
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Type errors in src/types.ts
    Evidence: .sisyphus/evidence/task-2-typecheck.txt

  Scenario: Types are importable
    Tool: Bash (bun eval)
    Preconditions: src/types.ts exists
    Steps:
      1. Run `bun eval "import type { ProjectSnapshot, DashboardMultiProjectPayload, SessionTimeSeriesPayload } from './src/types'; console.log('types OK')"`
    Expected Result: Prints 'types OK' without errors
    Failure Indicators: Import error, missing export
    Evidence: .sisyphus/evidence/task-2-import.txt
  ```

  **Commit**: YES
  - Message: `feat(types): define multi-project data models`
  - Files: `src/types.ts`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 3. Ingestion layer — adapt from existing dashboard

  **What to do**:
  - Create `src/ingest/` directory with adapted ingestion modules
  - Copy and adapt these files from the reference dashboard, preserving logic but adjusting imports:
    - `src/ingest/paths.ts` — Path utilities (`getOpenCodeStorageDir`, `getDataDir`, `realpathSafe`, `assertAllowedPath`)
    - `src/ingest/storage-backend.ts` — Storage backend detection and SQLite reader functions (`selectStorageBackend`, `isSqliteUsable`, `withReadonlyDb`, all `read*Sqlite` functions)
    - `src/ingest/sources-registry.ts` — Source registry reading (`loadRegistry`, `listSources`, `getSourceById`; strip `addOrUpdateSource` and `writeRegistry` since we're READ-ONLY)
    - `src/ingest/session.ts` — Session metadata reading (`readMainSessionMetas`, `pickActiveSessionId`, `getMainSessionView`, `getStorageRoots`)
    - `src/ingest/boulder.ts` — Plan progress reading (`readBoulderState`, `readPlanProgress`, `readPlanSteps`, `getPlanProgressFromMarkdown`)
    - `src/ingest/timeseries.ts` — Time series derivation (`deriveTimeSeriesActivity`)
    - `src/ingest/sqlite-derive.ts` — SQLite-based derivation functions (all `derive*Sqlite` and `get*Sqlite` functions)
    - `src/ingest/background-tasks.ts` — Background task reading
    - `src/ingest/model.ts` — Model string extraction (`extractModelString`, `pickLatestModelString`)
    - `src/ingest/token-usage-core.ts` — Token usage aggregation
    - `src/ingest/token-usage.ts` — Token usage from file storage
    - `src/ingest/tool-calls.ts` — Tool call derivation
  - KEY ADAPTATION: Remove all write operations (we only READ). Strip `addOrUpdateSource`, `writeRegistry`, any mutation functions
  - KEY ADAPTATION: Update `getDataDir` / path defaults to use correct path: `~/.local/share/opencode/`
  - KEY ADAPTATION: The actual sources.json is at `~/.local/share/opencode/storage/dashboard/sources.json` (not `~/.local/share/opencode/dashboard/`)
  - Ensure all SQLite operations use `readonly: true` mode
  - Do NOT rewrite logic — copy faithfully and make minimal changes for our import paths

  **Must NOT do**:
  - Do NOT rewrite any ingestion logic from scratch — adapt existing code
  - Do NOT add any write operations to SQLite or filesystem
  - Do NOT change the data shapes returned by ingestion functions
  - Do NOT import from the reference package at runtime — copy source code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Significant code volume to copy/adapt, need careful attention to import paths and removed mutations
  - **Skills**: []
    - No specialized skills needed — this is copy/adapt work
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend data layer, no UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 6, 7 (aggregation, per-session timeseries, API routes)
  - **Blocked By**: None (can start immediately, copies from reference dashboard)

  **References**:

  **Pattern References** (existing code to follow — THE primary source):
  - `$REF/src/ingest/paths.ts` — Path utilities, MUST copy `getDataDir`, `getOpenCodeStorageDir`, `realpathSafe`, `assertAllowedPath`
  - `$REF/src/ingest/storage-backend.ts` — THE critical file: `selectStorageBackend()`, `isSqliteUsable()`, `withReadonlyDb()`, all `read*Sqlite()` functions
  - `$REF/src/ingest/sources-registry.ts` — Registry loading: `loadRegistry()`, `listSources()`, `getSourceById()`. Strip: `addOrUpdateSource`, `writeRegistry`
  - `$REF/src/ingest/session.ts` — Session reading: all exported functions. Copy verbatim
  - `$REF/src/ingest/boulder.ts` — Plan progress: all functions. Copy verbatim
  - `$REF/src/ingest/timeseries.ts` — Time series derivation. Copy verbatim
  - `$REF/src/ingest/sqlite-derive.ts` — SQLite derivation: all exported functions. Copy verbatim
  - `$REF/src/ingest/background-tasks.ts` — Background task reading
  - `$REF/src/ingest/model.ts` — Model string extraction
  - `$REF/src/ingest/token-usage-core.ts` — Token usage core
  - `$REF/src/ingest/token-usage.ts` — Token usage file-based
  - `$REF/src/ingest/tool-calls.ts` — Tool call derivation

  **External References**:
  - Actual sources.json location: `/home/ezotoff/.local/share/opencode/storage/dashboard/sources.json`
  - Actual SQLite DB location: `/home/ezotoff/.local/share/opencode/opencode.db`

  **WHY Each Reference Matters**:
  - These are the PRODUCTION-PROVEN ingestion functions. We copy them to avoid reimplementation bugs.
  - `storage-backend.ts` is the most critical — it has the SQLite read-only pattern with WAL-mode awareness and error classification
  - `sources-registry.ts` reads the project registry — our multi-project view iterates over these sources
  - Stripping writes ensures we NEVER corrupt OpenCode's data

  **Acceptance Criteria**:
  - [ ] `src/ingest/` directory exists with all listed files
  - [ ] `bunx tsc --noEmit` passes with zero errors
  - [ ] No write/mutation functions in any ingestion file (grep for `writeFile`, `mkdirSync.*recursive`, `renameSync` in our copies — should be zero except path assertions)
  - [ ] All SQLite opens use `{ readonly: true }`

  **QA Scenarios:**

  ```
  Scenario: Ingestion reads sources registry successfully
    Tool: Bash (bun eval)
    Preconditions: Ingestion files copied, dependencies installed
    Steps:
      1. Run `bun eval "
         const { listSources } = require('./src/ingest/sources-registry');
         const { getDataDir, getOpenCodeStorageDir } = require('./src/ingest/paths');
         const storageRoot = getOpenCodeStorageDir();
         const sources = listSources(storageRoot);
         console.log('sources:', sources.length);
         console.log('first:', JSON.stringify(sources[0]));
         "`
      2. Verify sources.length > 0
      3. Verify first source has id, label fields
    Expected Result: sources.length >= 7 (matching known registry), each with id/label
    Failure Indicators: Import error, sources empty, path resolution failure
    Evidence: .sisyphus/evidence/task-3-sources-registry.txt

  Scenario: Ingestion reads SQLite database successfully
    Tool: Bash (bun eval)
    Preconditions: Ingestion files ready
    Steps:
      1. Run `bun eval "
         const { selectStorageBackend } = require('./src/ingest/storage-backend');
         const backend = selectStorageBackend();
         console.log('kind:', backend.kind);
         if (backend.kind === 'sqlite') console.log('path:', backend.sqlitePath);
         "`
      2. Verify kind is 'sqlite'
      3. Verify path points to opencode.db
    Expected Result: kind: sqlite, path contains 'opencode.db'
    Failure Indicators: Falls back to 'files', path wrong, DB open error
    Evidence: .sisyphus/evidence/task-3-sqlite-backend.txt

  Scenario: No write operations present
    Tool: Bash (grep)
    Preconditions: Files copied
    Steps:
      1. `grep -rn 'writeFileSync\|writeFile\|writeRegistry\|addOrUpdateSource\|renameSync' src/ingest/ || echo 'CLEAN'`
      2. Only `assertAllowedPath` references to path resolution are acceptable
    Expected Result: Output is 'CLEAN' or only contains assertAllowedPath-related path.resolve
    Failure Indicators: Any writeFile/writeRegistry/addOrUpdate found
    Evidence: .sisyphus/evidence/task-3-no-writes.txt
  ```

  **Commit**: YES
  - Message: `feat(ingest): adapt read-only ingestion layer from existing dashboard`
  - Files: `src/ingest/*.ts`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 4. CSS design tokens + base styles

  **What to do**:
  - Create `src/styles/tokens.css` with CSS custom properties for the dashboard design system:
    - Color palette: dark theme as default, light theme via `[data-theme="light"]` selector
    - Dark: backgrounds `#0a0a0f`, `#12121a`, `#1a1a2e`; accents teal `#00d4aa`, red `#ff6b6b`, green `#4ecdc4`, amber `#ffa502`
    - Light: backgrounds `#f8f9fa`, `#ffffff`, `#e9ecef`; accents adjusted for contrast
    - Typography: `font-family: 'Inter', system-ui, sans-serif`; sizes from `--font-xs: 0.65rem` to `--font-xl: 1.25rem`
    - Spacing scale: `--sp-1: 4px` through `--sp-8: 32px`
    - Strip height tokens: `--strip-collapsed: 40px`, `--strip-expanded: auto`
    - Border radius: `--radius-sm: 4px`, `--radius-md: 8px`
    - Transitions: `--transition-fast: 150ms ease`, `--transition-normal: 250ms ease`
    - Status colors: `--status-busy: #00d4aa`, `--status-idle: #666`, `--status-thinking: #ffa502`, `--status-tool: #4ecdc4`, `--status-unknown: #444`
  - Create `src/styles/base.css` with global resets and base styles:
    - CSS reset (box-sizing, margin, font smoothing)
    - Body styles using tokens
    - Scrollbar styling (thin, dark-themed)
    - Utility classes: `.truncate`, `.mono` (monospace font)
  - Create `src/styles/index.css` that imports tokens.css and base.css (barrel file)
  - Import `src/styles/index.css` in `src/main.tsx`

  **Must NOT do**:
  - Do NOT install any CSS framework (Tailwind, styled-components, etc.)
  - Do NOT create component-specific styles here (those go in component files)
  - Do NOT use hardcoded colors anywhere — always reference tokens

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Design system work requiring aesthetic judgment for color palette and spacing
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Design token selection, color theory for dark/light themes, spacing consistency
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing for CSS tokens

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 8, 9, 10 (UI components need design tokens)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/styles.css` — Existing dashboard styles for color inspiration and patterns
  - `$REF/src/App.tsx` — How styles are applied in the existing dashboard

  **External References**:
  - Inter font: Available via system fonts or Google Fonts CDN

  **WHY Each Reference Matters**:
  - `styles.css`: Shows existing color choices and dark theme approach — we should maintain visual consistency while improving information density
  - The collapsed strip height of 40px is a key UX constraint — enough for sparkline + status indicators but dense enough for 10+ projects

  **Acceptance Criteria**:
  - [ ] `src/styles/tokens.css` exists with all listed custom properties
  - [ ] `src/styles/base.css` exists with global resets
  - [ ] `src/styles/index.css` imports both
  - [ ] Dark and light theme tokens defined
  - [ ] `bun run build` succeeds (CSS processed by Vite)

  **QA Scenarios:**

  ```
  Scenario: CSS tokens are valid and build succeeds
    Tool: Bash
    Preconditions: Task 1 scaffolding complete, styles files created
    Steps:
      1. Run `bun run build`
      2. Check `dist/assets/` for .css output file
      3. Verify CSS output contains `--strip-collapsed` custom property
    Expected Result: Build succeeds, CSS bundle contains our custom properties
    Failure Indicators: Build fails, CSS properties missing from output
    Evidence: .sisyphus/evidence/task-4-css-build.txt

  Scenario: Theme switching tokens exist for both dark and light
    Tool: Bash (grep)
    Preconditions: tokens.css exists
    Steps:
      1. `grep -c 'data-theme.*light' src/styles/tokens.css`
      2. `grep -c '\-\-status-busy' src/styles/tokens.css`
      3. `grep -c '\-\-strip-collapsed' src/styles/tokens.css`
    Expected Result: All three greps return >= 1
    Failure Indicators: Missing theme selector or token definitions
    Evidence: .sisyphus/evidence/task-4-theme-tokens.txt
  ```

  **Commit**: YES
  - Message: `feat(styles): add CSS design tokens and base styles`
  - Files: `src/styles/tokens.css, src/styles/base.css, src/styles/index.css`
  - Pre-commit: `bun run build`

---

- [ ] 5. Multi-project aggregation service

  **What to do**:
  - Create `src/server/multi-project.ts` — the core multi-project data orchestrator
  - Implement `buildMultiProjectPayload(storageRoot, storageBackend, nowMs)` function that:
    1. Calls `listSources(storageRoot)` to get all registered sources
    2. For each source, calls `buildDashboardPayload()` (from adapted ingestion layer) to get the single-project snapshot
    3. Transforms each `DashboardPayload` into a `ProjectSnapshot` (our new type from Task 2)
    4. Wraps everything in `DashboardMultiProjectPayload` with `serverNowMs` and `pollIntervalMs`
  - Implement lazy `DashboardStore` caching per source (reuse pattern from reference `start.ts:82-105`): `storeBySourceId` and `storeByProjectRoot` Maps
  - Implement `getOrCreateStore(sourceId, projectRoot, storageRoot, storageBackend)` factory that creates `DashboardStore` instances on first access
  - Add per-source error isolation: if one source fails, include error flag in its `ProjectSnapshot` but don't fail the entire multi-project response
  - Export `createMultiProjectService(opts: { storageRoot, storageBackend, pollIntervalMs })` that returns `{ getMultiProjectPayload: () => DashboardMultiProjectPayload }`
  - IMPORTANT: This task must also copy/adapt `$REF/src/server/dashboard.ts` into `src/server/dashboard.ts` — specifically `buildDashboardPayload()`, `createDashboardStore()`, and `DashboardStore` type. These are the single-project builder functions that this multi-project service calls N times (once per source). Strip any write operations from the copy.

  **Must NOT do**:
  - Do NOT create a separate aggregation database — read directly from shared SQLite
  - Do NOT modify the ingestion layer (Task 3) — only import from it
  - Do NOT add WebSocket/SSE — this service is called on each API poll
  - Do NOT add any write operations

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex data orchestration with caching, error isolation, and multi-source coordination
  - **Skills**: []
    - No specialized skills needed — pure backend TypeScript
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend only
    - `deployment`: No deployment config

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9, 10)
  - **Blocks**: Task 7 (API routes need this service)
  - **Blocked By**: Tasks 2, 3 (types + ingestion layer)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/server/start.ts:74-105` — Lazy store creation pattern: `createDashboardStore()`, `storeBySourceId`, `storeByProjectRoot` Maps, `getStoreForSource()` factory
  - `$REF/src/server/dashboard.ts:290-482` — `buildDashboardPayload()` function — the single-project payload builder we call N times for N sources
  - `$REF/src/server/dashboard.ts:493-560` — `createDashboardStore()` with dirty-flag caching and poll interval
  - `$REF/src/ingest/sources-registry.ts:listSources()` — Returns all registered sources with id, projectRoot, label

  **API/Type References**:
  - `src/types.ts:ProjectSnapshot` — Output shape per project (from Task 2)
  - `src/types.ts:DashboardMultiProjectPayload` — Top-level response shape

  **WHY Each Reference Matters**:
  - `start.ts:74-105`: This IS the lazy store pattern we need. Copy the Map-based cache approach but wrap it in a service class instead of loose variables
  - `dashboard.ts:buildDashboardPayload`: We call this per source — understanding its inputs (projectRoot, storage, storageBackend) is essential
  - `dashboard.ts:createDashboardStore`: The dirty-flag + poll-interval caching pattern prevents redundant SQLite queries

  **Acceptance Criteria**:
  - [ ] `src/server/multi-project.ts` exports `createMultiProjectService`
  - [ ] `bunx tsc --noEmit` passes with zero errors
  - [ ] Service returns `DashboardMultiProjectPayload` with correct shape
  - [ ] Handles 0 sources gracefully (empty projects array)
  - [ ] Per-source errors don't crash the entire response

  **QA Scenarios:**

  ```
  Scenario: Multi-project service returns all registered projects
    Tool: Bash (bun eval)
    Preconditions: Tasks 1-3 complete, sources.json has 7+ entries
    Steps:
      1. Run `bun eval "
         const { createMultiProjectService } = require('./src/server/multi-project');
         const { selectStorageBackend, getLegacyStorageRootForBackend } = require('./src/ingest/storage-backend');
         const backend = selectStorageBackend();
         const storageRoot = getLegacyStorageRootForBackend(backend);
         const svc = createMultiProjectService({ storageRoot, storageBackend: backend, pollIntervalMs: 2000 });
         const payload = svc.getMultiProjectPayload();
         console.log('projects:', payload.projects.length);
         console.log('first:', JSON.stringify(payload.projects[0]?.label));
         console.log('serverNowMs:', typeof payload.serverNowMs);
         "
      2. Verify projects.length >= 7
      3. Verify serverNowMs is a number
    Expected Result: projects array contains all registered sources, each with label and sourceId
    Failure Indicators: projects.length === 0, import error, missing fields
    Evidence: .sisyphus/evidence/task-5-multi-project-payload.txt

  Scenario: Service handles source with missing project directory
    Tool: Bash (bun eval)
    Preconditions: At least one source points to a non-existent directory
    Steps:
      1. Invoke getMultiProjectPayload()
      2. Check that response still includes other valid projects
      3. Check that the invalid source has an error indicator or is gracefully handled
    Expected Result: Valid projects returned normally; invalid source doesn't crash response
    Failure Indicators: Unhandled exception, entire payload fails
    Evidence: .sisyphus/evidence/task-5-error-isolation.txt
  ```

  **Commit**: YES
  - Message: `feat(aggregation): multi-project snapshot service`
  - Files: `src/server/multi-project.ts`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 6. Per-session time-series engine

  **What to do**:
  - Create `src/ingest/per-session-timeseries.ts` — NEW module not in the reference dashboard
  - Implement `derivePerSessionTimeSeries(opts)` that produces `SessionTimeSeriesPayload`:
    - Query the global SQLite for all sessions belonging to a given project (filter by `directory` column in session table)
    - For each session, count tool_call/message activity in 2-second buckets over a 5-minute window (matching existing time-series parameters)
    - Identify whether each session is a background task session or main session using boulder `session_ids`
    - Return `SessionTimeSeriesPayload` with per-session breakdown
  - Use `withReadonlyDb()` from the ingestion layer for safe SQLite access
  - The SQL query pattern: group messages by session_id and floor(created_at / bucketMs) to produce bucket counts
  - Handle edge cases: sessions with no recent activity get zero-filled arrays; sessions that started mid-window get partial arrays
  - Export function matching signature: `derivePerSessionTimeSeries(opts: { sqlitePath: string; projectRoot: string; boulderSessionIds?: string[]; nowMs?: number }) => SessionTimeSeriesPayload`

  **Must NOT do**:
  - Do NOT modify existing `timeseries.ts` or `sqlite-derive.ts` — this is a new, additive module
  - Do NOT query more than 5 minutes of data (performance constraint on 3.4GB DB)
  - Do NOT write to the SQLite database
  - Do NOT use `as any` — proper typing throughout

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New SQL query design against large DB, requires careful performance consideration and edge case handling
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend data engine, no UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8, 9, 10)
  - **Blocks**: Tasks 11, 13 (dashboard layout and data polling need this)
  - **Blocked By**: Tasks 2, 3 (types + ingestion layer for SQLite access patterns)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/ingest/sqlite-derive.ts:deriveTimeSeriesActivitySqlite` — The existing per-agent time-series derivation; our per-session version follows the same bucket/window structure but groups by session instead of agent
  - `$REF/src/ingest/timeseries.ts:deriveTimeSeriesActivity` — File-based derivation showing the bucket calculation logic: `anchorMs = floor(nowMs / bucketMs) * bucketMs`, window=5min, bucket=2s
  - `$REF/src/ingest/storage-backend.ts:withReadonlyDb` — The read-only SQLite access wrapper we must use
  - `$REF/src/ingest/session.ts:readMainSessionMetas` — Shows how sessions are queried and filtered by project root

  **API/Type References**:
  - `src/types.ts:SessionTimeSeriesPayload` — Output shape (from Task 2)
  - `src/types.ts:SessionTimeSeriesEntry` — Per-session entry with values array

  **External References**:
  - SQLite DB schema: `~/.local/share/opencode/opencode.db` — tables: `session`, `message`, `tool_call` with `created_at` timestamps

  **WHY Each Reference Matters**:
  - `deriveTimeSeriesActivitySqlite`: This is the closest existing code to what we're building. It uses SQL GROUP BY with floor arithmetic on timestamps to produce bucket counts. We replicate this but group by session_id instead of agent
  - `withReadonlyDb`: MUST use this for all SQLite access — it handles WAL mode, readonly flag, and error wrapping
  - `readMainSessionMetas`: Shows the directory-based filtering pattern for getting sessions belonging to a project

  **Acceptance Criteria**:
  - [ ] `src/ingest/per-session-timeseries.ts` exists and exports `derivePerSessionTimeSeries`
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Returns `SessionTimeSeriesPayload` shape with windowMs, bucketMs, buckets, sessions array
  - [ ] Each session in the output has sessionId, sessionLabel, isBackground, and values array
  - [ ] Values array length equals buckets count

  **QA Scenarios:**

  ```
  Scenario: Per-session time-series returns data for active project
    Tool: Bash (bun eval)
    Preconditions: Tasks 1-3 complete, SQLite DB accessible
    Steps:
      1. Pick a known project root from sources.json (e.g., the current project)
      2. Run `bun eval "
         const { derivePerSessionTimeSeries } = require('./src/ingest/per-session-timeseries');
         const { selectStorageBackend } = require('./src/ingest/storage-backend');
         const backend = selectStorageBackend();
         const result = derivePerSessionTimeSeries({
           sqlitePath: backend.sqlitePath,
           projectRoot: '/home/ezotoff/AI_projects/ez-omo-dash',
         });
         console.log('sessions:', result.sessions.length);
         console.log('buckets:', result.buckets);
         console.log('windowMs:', result.windowMs);
         if (result.sessions[0]) {
           console.log('first session values length:', result.sessions[0].values.length);
           console.log('first session id:', result.sessions[0].sessionId);
         }
         "
      3. Verify buckets === 150 (5min / 2s)
      4. Verify windowMs === 300000
      5. Verify sessions[0].values.length === 150
    Expected Result: SessionTimeSeriesPayload with correct bucket count and per-session data
    Failure Indicators: Import error, wrong bucket count, empty sessions when project has activity
    Evidence: .sisyphus/evidence/task-6-per-session-ts.txt

  Scenario: Per-session time-series handles project with no recent activity
    Tool: Bash (bun eval)
    Preconditions: Use a project root with no sessions in last 5 minutes
    Steps:
      1. Call derivePerSessionTimeSeries with a stale or inactive project root
      2. Verify sessions array is empty or all values are zeros
    Expected Result: Valid payload shape with empty/zero sessions — no errors
    Failure Indicators: Exception thrown, malformed payload
    Evidence: .sisyphus/evidence/task-6-no-activity.txt
  ```

  **Commit**: YES
  - Message: `feat(timeseries): per-session time-series engine`
  - Files: `src/ingest/per-session-timeseries.ts`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 7. Hono API routes

  **What to do**:
  - Create `src/server/api.ts` — Hono router with all dashboard API endpoints
  - Implement endpoints:
    - `GET /health` → `{ ok: true, version: string }` — Health check
    - `GET /sources` → `{ ok: true, sources: SourceRegistryEntry[], defaultSourceId: string | null }` — List all registered projects
    - `GET /projects` → `DashboardMultiProjectPayload` — All projects with snapshots (calls multi-project service from Task 5)
    - `GET /projects/:sourceId` → `ProjectSnapshot` — Single project detail (with full per-session time-series)
    - `GET /tool-calls/:sessionId` → Tool call details per session (reuse reference pattern from `$REF/src/server/api.ts:61-121`)
  - Wire API router into the Hono app created in Task 1's `src/server/start.ts`
  - Add response headers: `Cache-Control: no-cache` on all API responses to prevent stale data
  - Add error handling middleware: catch unhandled errors, return `{ ok: false, error: string }` with 500 status
  - Add `Content-Type: application/json` header on all responses

  **Must NOT do**:
  - Do NOT add authentication/authorization
  - Do NOT add WebSocket/SSE endpoints — polling only
  - Do NOT add write endpoints (POST/PUT/DELETE)
  - Do NOT add `as any` type casts in route handlers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple API endpoints with data integration; not purely visual or purely algorithmic
  - **Skills**: []
    - No specialized skills needed — standard Hono routing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Backend API only
    - `deployment`: No deployment in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES (partially — can scaffold route structure immediately, wire to Task 5 service once available)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8, 9, 10)
  - **Blocks**: Tasks 11, 13 (layout and polling need API endpoints)
  - **Blocked By**: Tasks 2, 5 (types + multi-project service)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/server/api.ts` — COMPLETE reference: Hono API setup, health endpoint, sources endpoint, dashboard endpoint with sourceId query param, tool-calls endpoint with session validation
  - `$REF/src/server/start.ts:107` — How API router is mounted: `app.route('/api', createApi(opts))`
  - `$REF/src/server/api.ts:11` — Session ID validation pattern: `SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/`

  **API/Type References**:
  - `src/types.ts:DashboardMultiProjectPayload` — Response shape for `/projects`
  - `src/types.ts:ProjectSnapshot` — Response shape for `/projects/:sourceId`
  - `src/server/multi-project.ts:createMultiProjectService` — Data provider (Task 5)

  **WHY Each Reference Matters**:
  - `api.ts`: Almost identical endpoint structure — we're adding `/projects` (multi) alongside the existing `/dashboard` (single) pattern
  - `start.ts:107`: Shows exact Hono mounting syntax we need to replicate
  - Session validation: Security pattern to prevent path traversal in session IDs

  **Acceptance Criteria**:
  - [ ] `src/server/api.ts` exports `createApi` function
  - [ ] `bunx tsc --noEmit` passes
  - [ ] All 5 endpoints respond with correct status codes and shapes
  - [ ] Error handler returns 500 with `{ ok: false }` on unexpected errors

  **QA Scenarios:**

  ```
  Scenario: API health endpoint responds
    Tool: Bash (curl)
    Preconditions: Server running (`bun run dev:api &`)
    Steps:
      1. `curl -s http://localhost:51244/api/health | jq .`
    Expected Result: `{ "ok": true, "version": "..." }`
    Failure Indicators: Connection refused, missing ok field
    Evidence: .sisyphus/evidence/task-7-health.txt

  Scenario: Multi-project endpoint returns all projects
    Tool: Bash (curl)
    Preconditions: Server running, sources registered
    Steps:
      1. `curl -s http://localhost:51244/api/projects | jq '.projects | length'`
      2. `curl -s http://localhost:51244/api/projects | jq '.projects[0].label'`
      3. `curl -s http://localhost:51244/api/projects | jq '.serverNowMs'`
    Expected Result: projects.length >= 7, first project has label, serverNowMs is number
    Failure Indicators: Empty array, 500 error, missing fields
    Evidence: .sisyphus/evidence/task-7-projects.txt

  Scenario: Single project detail endpoint
    Tool: Bash (curl)
    Preconditions: Server running, at least one source exists
    Steps:
      1. Get first source ID: `SOURCE_ID=$(curl -s http://localhost:51244/api/sources | jq -r '.sources[0].id')`
      2. `curl -s http://localhost:51244/api/projects/$SOURCE_ID | jq '.label'`
    Expected Result: Returns ProjectSnapshot with label, mainSession, planProgress, timeSeries
    Failure Indicators: 404, missing fields, wrong source
    Evidence: .sisyphus/evidence/task-7-single-project.txt

  Scenario: Invalid session ID rejected
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. `curl -s -o /dev/null -w '%{http_code}' http://localhost:51244/api/tool-calls/../etc/passwd`
    Expected Result: HTTP 400
    Failure Indicators: HTTP 200 or 500 (should be 400 for invalid format)
    Evidence: .sisyphus/evidence/task-7-invalid-session.txt
  ```

  **Commit**: YES
  - Message: `feat(api): multi-project Hono API routes`
  - Files: `src/server/api.ts` (updated `src/server/start.ts` wiring)
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 8. Project strip UI component

  **What to do**:
  - Create `src/ui/components/ProjectStrip.tsx` — The core UI component for displaying one project in the dashboard
  - Create `src/ui/components/ProjectStrip.css` — Component styles using design tokens from Task 4
  - The ProjectStrip has TWO visual states:
    - **Collapsed** (~40px height): Thin horizontal bar showing: project label, status indicator dot, mini sparkline, plan progress fraction (e.g., "4/7"), last-updated timestamp
    - **Expanded** (variable height): Full detail view with: larger sparkline, per-session time-series, background tasks list, plan steps checklist, token usage summary
  - Props interface:
    ```tsx
    type ProjectStripProps = {
      project: ProjectSnapshot
      expanded: boolean
      onToggleExpand: () => void
    }
    ```
  - Collapsed strip layout (left to right):
    - Status dot (4px circle, color from `--status-{status}` tokens)
    - Project label (truncated, max 20 chars)
    - Mini sparkline (48px wide, 20px tall — last 30 buckets only)
    - Agent name badge
    - Plan progress: "4/7" or "—" if no plan
    - Last updated relative time ("2s ago", "1m ago")
    - Expand/collapse chevron icon
  - Click anywhere on collapsed strip to expand; click chevron or header to collapse
  - Use `data-expanded` attribute for CSS-based expand/collapse animation

  **Must NOT do**:
  - Do NOT implement the sparkline rendering itself (that's Task 9)
  - Do NOT implement the plan progress bar (that's Task 10)
  - Do NOT add data fetching — this is a pure presentational component receiving props
  - Do NOT use any CSS framework — raw CSS with design tokens only
  - Do NOT add expand/collapse animation beyond CSS transitions

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with layout, visual states, and dense information display
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dense information layout, visual hierarchy, interaction design for collapsed/expanded states
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing in this task (testing in Wave 4)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 9, 10)
  - **Blocks**: Tasks 11, 12 (dashboard layout and expand/collapse integration)
  - **Blocked By**: Tasks 2, 4 (types for props interface + design tokens for styling)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/App.tsx:1024-1489` — The existing single-project dashboard layout: section structure, status pills, data formatting, background task rows
  - `$REF/src/App.tsx:157-363` — `TimeSeriesActivitySection` component — shows how sparkline SVGs are structured and how data flows from props to SVG rects
  - `$REF/src/App.tsx:578-584` — `statusTone()` function mapping status strings to color tones

  **API/Type References**:
  - `src/types.ts:ProjectSnapshot` — The data shape received as props
  - `src/styles/tokens.css` — All `--status-*`, `--strip-*`, `--sp-*`, `--font-*` tokens

  **WHY Each Reference Matters**:
  - `App.tsx` layout: Shows how data is formatted for display (time formatting, status pills, plan fraction). We're distilling this into a much denser strip format
  - `TimeSeriesActivitySection`: The mini sparkline in collapsed mode will be a simplified version of this SVG approach
  - Design tokens: The strip MUST use token variables for all colors, sizes, transitions

  **Acceptance Criteria**:
  - [ ] `src/ui/components/ProjectStrip.tsx` exists and exports `ProjectStrip`
  - [ ] `src/ui/components/ProjectStrip.css` exists with styles using CSS custom properties
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Component renders placeholder slots for Sparkline (Task 9) and PlanProgress (Task 10) children
  - [ ] Collapsed height is ~40px per design spec
  - [ ] `data-expanded` attribute toggles correctly

  **QA Scenarios:**

  ```
  Scenario: ProjectStrip renders in collapsed state
    Tool: Playwright
    Preconditions: Component mounted with mock ProjectSnapshot data in a test page
    Steps:
      1. Navigate to dev server
      2. Find `.project-strip` element
      3. Assert `data-expanded` attribute is "false" or absent
      4. Assert element height <= 48px (allowing padding)
      5. Assert project label text is visible
      6. Assert status dot element exists with correct color class
      7. Screenshot collapsed strip
    Expected Result: Thin horizontal bar showing label, status dot, agent badge, plan fraction
    Failure Indicators: Height > 48px, missing label, no status indicator
    Evidence: .sisyphus/evidence/task-8-collapsed.png

  Scenario: ProjectStrip expands on click
    Tool: Playwright
    Preconditions: Component mounted
    Steps:
      1. Click on `.project-strip` element
      2. Wait 300ms for transition
      3. Assert `data-expanded` is "true"
      4. Assert element height > 100px
      5. Assert expanded sections are visible (detail area)
      6. Screenshot expanded strip
    Expected Result: Strip expands to show detail sections
    Failure Indicators: No height change, data-expanded doesn't toggle
    Evidence: .sisyphus/evidence/task-8-expanded.png
  ```

  **Commit**: YES (groups with Tasks 9, 10)
  - Message: `feat(ui): project strip, sparkline, plan progress components`
  - Files: `src/ui/components/ProjectStrip.tsx, src/ui/components/ProjectStrip.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 9. Sparkline + activity bar component

  **What to do**:
  - Create `src/ui/components/Sparkline.tsx` — A pure SVG sparkline component for visualizing time-series activity
  - Create `src/ui/components/Sparkline.css` — Styles for sparkline container and hover states
  - Two rendering modes:
    - **Mini mode** (for collapsed strip): 48px wide × 20px tall, last 30 buckets, single color, no labels
    - **Full mode** (for expanded detail): Full width × 80px tall, all 150 buckets, multi-series stacked bars, time axis labels
  - Props interface:
    ```tsx
    type SparklineProps = {
      mode: 'mini' | 'full'
      timeSeries: TimeSeriesPayload
      sessionTimeSeries?: SessionTimeSeriesPayload
      width?: number
      height?: number
      className?: string
    }
    ```
  - SVG implementation:
    - Use `<svg>` with `viewBox` matching data dimensions (reference: `viewBox="0 0 ${buckets} 28"` at App.tsx:167-168)
    - Each time bucket = one `<rect>`, barWidth = 0.85 of bucket width (reference: barW=0.85 at App.tsx:168)
    - Mini mode: single series (sum of all agents), teal color (`--status-busy`)
    - Full mode: stacked bars per agent/session using `computeStackedSegments` approach from `$REF/src/timeseries-stacked.ts`
      - Series colors via CSS classes: `timeSeriesBar--teal` (sisyphus), `timeSeriesBar--red` (prometheus), `timeSeriesBar--green` (atlas), `timeSeriesBar--muted` (background)
    - Bar height proportional to value, normalized to max value in window
    - Zero values render as 0-height rects (no visible bar)
    - SVG has `aria-hidden="true"` (matches reference — no interactivity)
  - Optional: hover highlight via CSS `:hover` on rect elements (opacity change only)
  - Component must be PURE: no side effects, no state, no data fetching — only renders from props

  **Must NOT do**:
  - Do NOT use Canvas — SVG only for accessibility and CSS styling
  - Do NOT add JS-based interactivity or tooltips (CSS hover only)
  - Do NOT import any charting library (D3, recharts, etc.) — raw SVG
  - Do NOT fetch data — pure presentational component

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG rendering with careful visual proportions and color design
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: SVG layout, color palette design, information density
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing in this task (Wave 4)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8, 10)
  - **Blocks**: Task 11 (dashboard layout integrates this component)
  - **Blocked By**: Tasks 2, 4 (types for props + design tokens for colors)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/App.tsx:167-168` — SVG viewBox and bar width: `viewBox="0 0 ${buckets} 28"`, `barW = 0.85`
  - `$REF/src/App.tsx:239-276` — SVG rect rendering loop: iterates buckets, calls `computeStackedSegments()`, renders `<rect>` per segment
  - `$REF/src/App.tsx:405-410` — Series tone definitions: sisyphus="teal", prometheus="red", atlas="green", background="muted"
  - `$REF/src/timeseries-stacked.ts` — `computeStackedSegments()`: computes y-offset and height for stacked bar segments

  **API/Type References**:
  - `src/types.ts:TimeSeriesPayload` — Input data shape
  - `src/types.ts:SessionTimeSeriesPayload` — Per-session input for full mode
  - `src/styles/tokens.css` — `--status-*` colors for series palette

  **WHY Each Reference Matters**:
  - `App.tsx:167-276`: This IS the SVG sparkline we adapt. Mini = simplified single-series; Full = extended with session stacking
  - `timeseries-stacked.ts`: Stacked segment computation handles normalization and overlap prevention — reuse algorithm
  - Series tones: CSS class pattern (`timeSeriesBar--teal`) applies colors without inline styles

  **Acceptance Criteria**:
  - [ ] `src/ui/components/Sparkline.tsx` exports `Sparkline` component
  - [ ] `src/ui/components/Sparkline.css` exists with styles using CSS custom properties
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Mini mode renders compact sparkline with single-color bars
  - [ ] Full mode renders stacked multi-series bars with color differentiation
  - [ ] Component is pure: no useState, no useEffect, no fetch calls

  **QA Scenarios:**

  ```
  Scenario: Mini sparkline renders in collapsed strip
    Tool: Playwright
    Preconditions: Component mounted with mock TimeSeriesPayload (30 buckets, values 0-10)
    Steps:
      1. Navigate to dev server test page
      2. Find `svg.sparkline-mini` element
      3. Assert SVG width=48, height=20
      4. Count `rect` elements inside SVG — expect 30
      5. Assert rects have fill color matching teal token
      6. Screenshot
    Expected Result: Compact bar chart with 30 bars, teal, proportional heights
    Failure Indicators: Wrong rect count, no visible bars, wrong colors
    Evidence: .sisyphus/evidence/task-9-mini-sparkline.png

  Scenario: Full sparkline renders stacked bars
    Tool: Playwright
    Preconditions: Component with mock TimeSeriesPayload (150 buckets, 3 series)
    Steps:
      1. Find `svg.sparkline-full` element
      2. Assert rect count >= 150 (stacked = buckets × series)
      3. Assert at least 3 distinct fill colors via CSS classes
      4. Assert SVG viewBox correct dimensions
      5. Screenshot
    Expected Result: Wide stacked bar chart with distinguishable series colors
    Failure Indicators: Single color, wrong bucket count, overflow
    Evidence: .sisyphus/evidence/task-9-full-sparkline.png
  ```

  **Commit**: YES (groups with Tasks 8, 10)
  - Message: `feat(ui): project strip, sparkline, plan progress components`
  - Files: `src/ui/components/Sparkline.tsx, src/ui/components/Sparkline.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 10. Plan progress indicator component

  **What to do**:
  - Create `src/ui/components/PlanProgress.tsx` — Displays plan/boulder progress for a project
  - Create `src/ui/components/PlanProgress.css` — Styles using design tokens
  - Two rendering modes:
    - **Compact mode** (for collapsed strip): Text fraction "4/7" with color-coded status, or "—" if no plan
    - **Full mode** (for expanded detail): Progress bar + step checklist
  - Props interface:
    ```tsx
    type PlanProgressProps = {
      planProgress: ProjectSnapshot['planProgress']
      mode: 'compact' | 'full'
      className?: string
    }
    ```
  - Compact mode:
    - Display `{completed}/{total}` with color: green if complete, amber if in progress, gray if not started
    - Display "—" if `total === 0` (no plan)
  - Full mode:
    - Progress bar: `progressTrack` container + `progressFill` inner div
    - Fill width = `clampPercent((completed / total) * 100)` percent (ref: App.tsx:1271-1274)
    - Plan name displayed above bar (basename only, strip path)
    - Status pill badge: `<span className="pill pill-${statusTone(status)}">{status}</span>` (ref: App.tsx:1670-1671)
    - Step checklist: each PlanStep as `[✓] text` or `[ ] text` in monospace (ref: App.tsx:1698-1705)
    - Max 10 steps visible, "+ N more" truncation if exceeding
  - Color mapping: `--status-busy` for complete, `--status-thinking` for in-progress, `--status-idle` for not started

  **Must NOT do**:
  - Do NOT add any data fetching — pure presentational
  - Do NOT add interactive step toggling (read-only display)
  - Do NOT use any UI component library — raw CSS for progress bar
  - Do NOT show raw file paths in plan name — basename only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Progress bar, checklist, and color-coded states
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Progress visualization, checklist UX, status indicators
  - **Skills Evaluated but Omitted**:
    - `playwright`: Testing in Wave 4

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8, 9)
  - **Blocks**: Task 11 (dashboard layout integrates this)
  - **Blocked By**: Tasks 2, 4 (types + design tokens)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/App.tsx:1271-1274` — Progress percentage: `clampPercent((completed / total) * 100)`
  - `$REF/src/App.tsx:1670-1671` — Status pill badge: `<span className={"pill pill-" + statusTone(status)}>`
  - `$REF/src/App.tsx:1698-1705` — Step checklist: mono font, `[x]`/`[ ]` prefix, step text
  - `$REF/src/App.tsx:578-584` — `statusTone()` function: maps status strings to color tone names
  - CSS classes from reference: `progressWrap`, `progressTrack`, `progressFill`, `pill`, `pill-${tone}`

  **API/Type References**:
  - `src/types.ts:PlanStatus` — `'not started' | 'in progress' | 'complete'`
  - `src/types.ts:PlanStep` — `{ checked: boolean; text: string }`
  - `src/types.ts:ProjectSnapshot['planProgress']` — Full shape: name, completed, total, path, status, steps[]

  **WHY Each Reference Matters**:
  - `App.tsx:1271-1274`: clampPercent prevents CSS overflow — copy exactly
  - `App.tsx:1698-1705`: Mono font `[x]`/`[ ]` is proven checklist UX pattern
  - `statusTone()`: Central color-mapping function to replicate

  **Acceptance Criteria**:
  - [ ] `src/ui/components/PlanProgress.tsx` exports `PlanProgress` component
  - [ ] `src/ui/components/PlanProgress.css` exists with styles
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Compact mode shows fraction text with correct color
  - [ ] Full mode shows progress bar + step checklist
  - [ ] "—" displayed when no plan exists (total === 0)

  **QA Scenarios:**

  ```
  Scenario: Compact mode shows plan fraction
    Tool: Playwright
    Preconditions: planProgress { completed: 4, total: 7, status: 'in progress' }
    Steps:
      1. Find `.plan-progress-compact` element
      2. Assert text content is "4/7"
      3. Assert amber/in-progress color styling
      4. Screenshot
    Expected Result: "4/7" in amber
    Failure Indicators: Wrong text, wrong color
    Evidence: .sisyphus/evidence/task-10-compact.png

  Scenario: Compact mode shows dash when no plan
    Tool: Playwright
    Preconditions: planProgress { completed: 0, total: 0, status: 'not started' }
    Steps:
      1. Find `.plan-progress-compact` element
      2. Assert text content is "—"
      3. Assert gray/idle color
    Expected Result: "—" in gray
    Failure Indicators: Shows "0/0" instead of dash
    Evidence: .sisyphus/evidence/task-10-no-plan.png

  Scenario: Full mode shows progress bar and checklist
    Tool: Playwright
    Preconditions: planProgress { steps: [{checked: true, text: 'Step 1'}, {checked: false, text: 'Step 2'}], completed: 1, total: 2, name: 'auth-refactor', status: 'in progress' }
    Steps:
      1. Find `.plan-progress-full` element
      2. Assert `.progressFill` width is ~50% of `.progressTrack`
      3. Assert plan name "auth-refactor" visible
      4. Assert first step shows checkmark
      5. Assert second step shows empty box
      6. Screenshot
    Expected Result: Bar at 50%, checklist with 1 checked + 1 unchecked
    Failure Indicators: No bar, wrong fill, steps missing
    Evidence: .sisyphus/evidence/task-10-full.png
  ```

  **Commit**: YES (groups with Tasks 8, 9)
  - Message: `feat(ui): project strip, sparkline, plan progress components`
  - Files: `src/ui/components/PlanProgress.tsx, src/ui/components/PlanProgress.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 11. Dashboard layout + multi-project grid

  **What to do**:
  - Create `src/ui/App.tsx` — Main dashboard application component
  - Create `src/ui/App.css` — Dashboard layout styles
  - Create `src/ui/components/DashboardHeader.tsx` — Top bar with title, theme toggle, connection status
  - Layout structure:
    - Top header bar: app title "ez-omo-dash", theme toggle (dark/light), connection indicator dot, last-update timestamp
    - Main area: vertical stack of ProjectStrip components, one per project
    - Each strip contains: ProjectStrip (Task 8) with embedded Sparkline (Task 9) and PlanProgress (Task 10)
  - Wire components together:
    - App receives `DashboardMultiProjectPayload` as data prop
    - Map `payload.projects` → `<ProjectStrip>` for each, passing project snapshot
    - Inside each ProjectStrip, render `<Sparkline mode={expanded ? 'full' : 'mini'}>` and `<PlanProgress mode={expanded ? 'full' : 'compact'}`>
  - Theme toggle: `data-theme` attribute on `<html>` element, toggled via button, persisted to localStorage
  - Connection status: green dot = connected, red = disconnected, with `connected` prop
  - CSS layout:
    - `page` class: full viewport, column flex
    - `container` class: max-width 1400px, centered, padding from tokens
    - `stack` class: vertical flex with gap from `--sp-2`
  - Sort projects: active (busy/thinking/tool) first, then idle, then unknown
  - Update `src/main.tsx` to render `<App>` with initial empty state

  **Must NOT do**:
  - Do NOT add data fetching here (that's Task 13)
  - Do NOT implement expand/collapse state management (that's Task 12)
  - Do NOT add responsive breakpoints yet (that's Task 14)
  - Do NOT add a sidebar or tab navigation — single vertical stack only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Composing UI components into a cohesive dashboard layout
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Layout composition, visual hierarchy, component integration
  - **Skills Evaluated but Omitted**:
    - `playwright`: Testing in Wave 4

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 2 UI components)
  - **Parallel Group**: Wave 3 (with Tasks 12, 13, 14)
  - **Blocks**: Tasks 12, 13, 14 (all Wave 3 tasks depend on this layout)
  - **Blocked By**: Tasks 7, 8, 9, 10 (API routes + all UI components)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/App.tsx:1527-2103` — Main layout structure: `page` > `container` > `header` > `main.stack` > `footer`
  - `$REF/src/App.tsx:1025-1083` — State declarations: multiple useState for connected, data, theme, etc.
  - `$REF/src/App.tsx:1607-1750` — `grid2` layout for 2-column cards (we adapt this into vertical strip stacking)
  - `$REF/src/main.tsx` — React entry point rendering pattern

  **API/Type References**:
  - `src/types.ts:DashboardMultiProjectPayload` — Top-level data shape passed to App
  - `src/types.ts:ProjectSnapshot` — Per-project data for each strip
  - All Wave 2 component exports: ProjectStrip, Sparkline, PlanProgress

  **WHY Each Reference Matters**:
  - `App.tsx:1527-2103`: Shows the full layout hierarchy and CSS class conventions we maintain consistency with
  - State declarations: Shows the pattern of multiple useState hooks that we simplify for multi-project (fewer states, more data)
  - We're replacing the single-project `grid2` layout with a vertical stack of project strips

  **Acceptance Criteria**:
  - [ ] `src/ui/App.tsx` exports `App` component
  - [ ] `src/ui/App.css` exists with layout styles
  - [ ] `src/ui/components/DashboardHeader.tsx` exists
  - [ ] `bunx tsc --noEmit` passes
  - [ ] App renders a list of ProjectStrip components from data
  - [ ] Theme toggle switches `data-theme` attribute
  - [ ] Projects sorted by activity status (active first)

  **QA Scenarios:**

  ```
  Scenario: Dashboard renders multiple project strips
    Tool: Playwright
    Preconditions: Dev server running, API returning 3+ projects
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait for data load (2-3s)
      3. Count `.project-strip` elements
      4. Assert count >= 3
      5. Assert first strip has `.status-dot` element
      6. Assert header shows "ez-omo-dash" title
      7. Screenshot full dashboard
    Expected Result: Vertical stack of project strips, each showing label and status
    Failure Indicators: No strips rendered, blank page, JS errors in console
    Evidence: .sisyphus/evidence/task-11-dashboard.png

  Scenario: Theme toggle works
    Tool: Playwright
    Preconditions: Dashboard loaded
    Steps:
      1. Check `document.documentElement.dataset.theme` — should be "dark" (default)
      2. Click `.theme-toggle` button
      3. Assert `data-theme` is now "light"
      4. Assert background color changed
      5. Screenshot light theme
    Expected Result: Theme switches between dark and light
    Failure Indicators: No attribute change, colors don't update
    Evidence: .sisyphus/evidence/task-11-theme-toggle.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): main layout with project strip integration`
  - Files: `src/ui/App.tsx, src/ui/App.css, src/ui/components/DashboardHeader.tsx, src/main.tsx`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 12. Expand/collapse + detail view

  **What to do**:
  - Create `src/ui/hooks/useExpandState.ts` — Custom hook managing which project strips are expanded
  - Implement `useExpandState()` hook:
    - State: `Set<string>` of expanded source IDs
    - `toggle(sourceId)`: add/remove from set
    - `expandAll()` / `collapseAll()`: bulk operations
    - Persist expanded state to `localStorage` key `ez-dash-expanded`
    - On initial load, restore from localStorage (empty set = all collapsed)
  - Integrate hook into `src/ui/App.tsx`:
    - Pass `expanded={expandedIds.has(project.sourceId)}` and `onToggleExpand={() => toggle(project.sourceId)}` to each ProjectStrip
  - Create expanded detail panel content within ProjectStrip:
    - When expanded, show:
      - Full-width Sparkline (mode='full') with per-session time-series
      - Full PlanProgress (mode='full') with step checklist
      - Background tasks list: each task as a small row with status, agent, model, last tool
      - Token usage summary (if available): input/output/total in compact format
      - Main session details: agent, model, current tool, session label
    - CSS transition on height: `max-height` transition for smooth expand/collapse
  - Add "Expand All" / "Collapse All" buttons to DashboardHeader

  **Must NOT do**:
  - Do NOT add data fetching — uses data already provided by parent App
  - Do NOT add animation libraries — CSS `max-height` + `overflow: hidden` transition only
  - Do NOT nest expanded views (no expanding within expanded)
  - Do NOT add lazy loading for detail content

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: State-driven UI transitions with detail panel layout
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Expand/collapse UX, detail layout, transition smoothness
  - **Skills Evaluated but Omitted**:
    - `playwright`: Testing in Wave 4

  **Parallelization**:
  - **Can Run In Parallel**: YES (partially, with Tasks 13, 14 after Task 11)
  - **Parallel Group**: Wave 3 (with Tasks 11, 13, 14)
  - **Blocks**: Task 14 (responsive scaling depends on expand/collapse working)
  - **Blocked By**: Tasks 8, 11 (ProjectStrip component + dashboard layout)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/App.tsx:1069-1073` — `expandedBgTaskIds` / `expandedMainTaskIds` state pattern: `useState<Set<string>>` for tracking expanded items
  - `$REF/src/App.tsx:1607-1750` — Card-based detail sections: how session details, background tasks, tool calls are rendered in expanded view
  - `$REF/src/App.tsx:1024-1083` — localStorage persistence pattern: theme stored in localStorage, restored on mount

  **API/Type References**:
  - `src/types.ts:ProjectSnapshot` — Full data available for detail view: backgroundTasks, mainSession, tokenUsage
  - `src/types.ts:BackgroundTaskSummary` — Shape for background task rows
  - `src/ui/hooks/useExpandState.ts` — New hook (created in this task)

  **WHY Each Reference Matters**:
  - `expandedBgTaskIds` pattern: Exact same Set-based toggle pattern we need, just for project strips instead of task rows
  - Card detail sections: Content structure for expanded view — we compress this into a strip detail panel
  - localStorage: Persistence pattern so expanded state survives page refresh

  **Acceptance Criteria**:
  - [ ] `src/ui/hooks/useExpandState.ts` exports `useExpandState` hook
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Clicking a strip toggles expanded state
  - [ ] Expanded strip shows full sparkline, plan checklist, background tasks, session details
  - [ ] "Expand All" / "Collapse All" buttons work in header
  - [ ] Expanded state persists across page refresh (localStorage)
  - [ ] CSS transition animates smoothly (max-height transition)

  **QA Scenarios:**

  ```
  Scenario: Strip expand/collapse toggles
    Tool: Playwright
    Preconditions: Dashboard loaded with 3+ projects, all collapsed
    Steps:
      1. Assert all `.project-strip` have `data-expanded="false"` or no attribute
      2. Click first `.project-strip`
      3. Wait 400ms for transition
      4. Assert first strip has `data-expanded="true"`
      5. Assert first strip height > 100px
      6. Assert `.sparkline-full` visible inside first strip
      7. Assert `.plan-progress-full` visible inside first strip
      8. Click first strip header again
      9. Wait 400ms
      10. Assert first strip collapsed (height <= 48px)
      11. Screenshot both states
    Expected Result: Smooth toggle between collapsed (40px) and expanded (detail view)
    Failure Indicators: No height change, detail content missing, jerky transition
    Evidence: .sisyphus/evidence/task-12-expand-collapse.png

  Scenario: Expand All / Collapse All buttons
    Tool: Playwright
    Preconditions: Dashboard loaded, all collapsed
    Steps:
      1. Click "Expand All" button in header
      2. Wait 500ms
      3. Assert ALL `.project-strip` have `data-expanded="true"`
      4. Click "Collapse All" button
      5. Wait 500ms
      6. Assert ALL `.project-strip` have `data-expanded="false"`
      7. Screenshot
    Expected Result: All strips expand/collapse simultaneously
    Failure Indicators: Some strips don't respond, buttons missing
    Evidence: .sisyphus/evidence/task-12-bulk-toggle.png

  Scenario: Expanded state persists across refresh
    Tool: Playwright
    Preconditions: Dashboard loaded
    Steps:
      1. Expand first 2 strips
      2. Reload page
      3. Wait for data load (3s)
      4. Assert first 2 strips are expanded, rest collapsed
    Expected Result: localStorage preserves expanded source IDs
    Failure Indicators: All strips reset to collapsed after refresh
    Evidence: .sisyphus/evidence/task-12-persistence.png
  ```

  **Commit**: YES
  - Message: `feat(ui): expand/collapse state with detail view panels`
  - Files: `src/ui/hooks/useExpandState.ts, src/ui/App.tsx (updated), src/ui/components/ProjectStrip.tsx (updated), src/ui/components/DashboardHeader.tsx (updated)`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 13. Data polling + state management

  **What to do**:
  - Create `src/ui/hooks/useDashboardData.ts` — Custom hook handling API polling and state
  - Implement `useDashboardData()` hook:
    - Fetches `GET /api/projects` on a recursive `setTimeout` loop (not setInterval)
    - Poll delay: 2200ms when connected, 3600ms when disconnected (matching reference at App.tsx:1368-1369)
    - State managed via `useState<DashboardMultiProjectPayload | null>`
    - Track `connected: boolean`, `lastUpdate: number`, `errorHint: string | null`
    - On successful fetch: parse JSON, update data state, set connected=true, clear errorHint
    - On fetch error: set connected=false, set errorHint with error message, keep last-known data (don't clear)
    - Use `AbortController` to cancel in-flight requests on unmount
    - Return: `{ data, connected, lastUpdate, errorHint }`
  - Pattern from reference (App.tsx:1328-1379):
    - `useEffect` starts the polling loop
    - Inner `tick()` function: fetch → parse → setState → setTimeout(tick, delay)
    - Cleanup: clearTimeout + abort controller
  - Integrate into `src/ui/App.tsx`:
    - Replace static data prop with `useDashboardData()` hook
    - Pass `connected` to DashboardHeader for status indicator
    - Pass `lastUpdate` to DashboardHeader for timestamp display
    - Show loading skeleton or "Connecting..." while `data === null`

  **Must NOT do**:
  - Do NOT use `setInterval` — recursive setTimeout only (prevents request pile-up)
  - Do NOT use React Query, SWR, or any data fetching library
  - Do NOT add WebSocket/SSE — polling only
  - Do NOT retry immediately on error — use the slower 3600ms delay

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Data fetching lifecycle with error handling and state management
  - **Skills**: []
    - No specialized skills needed — standard React hooks pattern
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Logic-only, no visual work

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 14 after Task 11)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 14)
  - **Blocks**: Task 15 (tests need polling to work for integration tests)
  - **Blocked By**: Tasks 7, 11 (API routes + dashboard layout)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/App.tsx:1328-1379` — THE polling implementation: `useEffect` with recursive setTimeout, `tick()` function, AbortController cleanup, connected/disconnected delay switching
  - `$REF/src/App.tsx:1343-1348` — Successful fetch: `const raw = await safeFetchJson(url); const d = toDashboardPayload(raw); setData(d); setLastUpdate(Date.now());`
  - `$REF/src/App.tsx:1349-1366` — Error handling: `catch(e) { setConnected(false); setErrorHint(msg); }` — does NOT clear existing data
  - `$REF/src/App.tsx:1368-1369` — Delay calculation: `const delay = nextConnected ? 2200 : 3600`

  **API/Type References**:
  - `src/types.ts:DashboardMultiProjectPayload` — Response shape from `/api/projects`
  - `src/server/api.ts:GET /api/projects` — The endpoint we poll (Task 7)

  **WHY Each Reference Matters**:
  - `App.tsx:1328-1379`: This is the EXACT polling pattern — recursive setTimeout with AbortController is the proven approach. Copy the structure, change the URL and data type
  - Error handling pattern: Critical that we DON'T clear data on error — show stale data with disconnected indicator
  - Delay switching: Slower polling when disconnected prevents hammering a dead server

  **Acceptance Criteria**:
  - [ ] `src/ui/hooks/useDashboardData.ts` exports `useDashboardData` hook
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Dashboard auto-refreshes data every ~2.2 seconds
  - [ ] Connection indicator shows green when connected
  - [ ] On API failure: shows last-known data + disconnected indicator
  - [ ] AbortController cleans up on unmount

  **QA Scenarios:**

  ```
  Scenario: Dashboard loads data automatically
    Tool: Playwright
    Preconditions: Dev server running (both API + UI)
    Steps:
      1. Navigate to http://localhost:5173
      2. Wait 5s for initial data load
      3. Assert at least one `.project-strip` is rendered
      4. Assert `.connection-indicator` has connected styling (green dot)
      5. Assert `.last-update` shows a timestamp
      6. Wait 3s more
      7. Assert `.last-update` timestamp has changed (auto-refresh)
    Expected Result: Data loads and auto-refreshes
    Failure Indicators: No data after 5s, connection shows disconnected, no refresh
    Evidence: .sisyphus/evidence/task-13-auto-polling.png

  Scenario: Dashboard handles API failure gracefully
    Tool: Playwright
    Preconditions: Dashboard loaded with data, then API server stopped
    Steps:
      1. Verify data is displayed (strips visible)
      2. Stop API server process
      3. Wait 5s for poll failure
      4. Assert `.connection-indicator` shows disconnected styling (red dot)
      5. Assert project strips are STILL visible (stale data preserved)
      6. Assert `.error-hint` or disconnected message visible
    Expected Result: Stale data shown with disconnected indicator — no blank screen
    Failure Indicators: Dashboard goes blank, JS error, strips disappear
    Evidence: .sisyphus/evidence/task-13-api-failure.png
  ```

  **Commit**: YES
  - Message: `feat(data): polling hook with error recovery`
  - Files: `src/ui/hooks/useDashboardData.ts, src/ui/App.tsx (updated)`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 14. Responsive scaling (2-5 → 10+ projects)

  **What to do**:
  - Create `src/ui/hooks/useDensityMode.ts` — Hook that detects project count and viewport height to determine density mode
  - Implement density modes:
    - **Comfortable** (2-5 projects): Collapsed strip = 48px, more padding, larger font in strip
    - **Dense** (6-10 projects): Collapsed strip = 40px, tighter padding, smaller font
    - **Ultra-dense** (10+ projects): Collapsed strip = 36px, minimal padding, abbreviate labels
  - `useDensityMode(projectCount: number)` returns `'comfortable' | 'dense' | 'ultra-dense'`
  - Apply density via CSS custom property `--density` on the container element
  - CSS media query integration:
    - Container applies `data-density="comfortable|dense|ultra-dense"` attribute
    - Density-specific CSS overrides strip height, font-size, padding, sparkline dimensions
  - Scrollable project list:
    - Main stack area gets `overflow-y: auto` when projects exceed viewport
    - Smooth scroll behavior
    - Scroll position preserved across data refreshes (don't jump to top)
  - Density-aware mini sparkline:
    - Comfortable: 48px wide sparkline
    - Dense: 40px wide
    - Ultra-dense: 32px wide
  - Add project count badge to DashboardHeader: "7 projects" or "12 projects"
  - Integrate into App.tsx: wrap container with density attribute

  **Must NOT do**:
  - Do NOT add mobile breakpoints (desktop-only per requirement)
  - Do NOT add virtual scrolling (simple overflow-y scroll is sufficient for ~20 projects)
  - Do NOT change the expand behavior based on density (expand always works the same)
  - Do NOT add user-configurable density (auto-detect only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS-driven density scaling with careful visual tuning
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Information density design, responsive sizing, scroll behavior
  - **Skills Evaluated but Omitted**:
    - `playwright`: Testing in Wave 4

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13 after Task 11)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: Task 16 (Playwright QA tests this scaling behavior)
  - **Blocked By**: Tasks 11, 12 (layout + expand/collapse must exist first)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/styles/tokens.css:--strip-collapsed` — Base strip height token (Task 4)
  - `src/ui/components/ProjectStrip.css` — Strip height and padding styles to override per density
  - `$REF/src/App.tsx:1527-1540` — Page/container CSS structure for scroll context

  **API/Type References**:
  - `src/ui/hooks/useDensityMode.ts` — New hook (created in this task)
  - `src/styles/tokens.css` — `--strip-collapsed`, `--sp-*`, `--font-*` tokens to override per density

  **WHY Each Reference Matters**:
  - Strip tokens: Density modes override these via CSS `[data-density]` selectors — need to know current token names
  - Reference layout: Container scroll context determines where `overflow-y` goes

  **Acceptance Criteria**:
  - [ ] `src/ui/hooks/useDensityMode.ts` exports `useDensityMode` hook
  - [ ] `bunx tsc --noEmit` passes
  - [ ] Dashboard with 3 projects uses comfortable density (48px strips)
  - [ ] Dashboard with 8 projects uses dense density (40px strips)
  - [ ] Dashboard with 12+ projects uses ultra-dense density (36px strips)
  - [ ] Project list scrolls when exceeding viewport height
  - [ ] Scroll position preserved across data refresh

  **QA Scenarios:**

  ```
  Scenario: Density modes apply based on project count
    Tool: Playwright
    Preconditions: Dashboard loaded with 7+ projects
    Steps:
      1. Navigate to dashboard
      2. Wait for data load
      3. Check `data-density` attribute on container
      4. With 7 projects, assert density is "dense"
      5. Assert collapsed strip height is ~40px
      6. Measure font size in strip — should be smaller than comfortable default
      7. Screenshot dense mode
    Expected Result: Dense mode applied with 40px strips and tighter spacing
    Failure Indicators: Wrong density mode, strip height unchanged from default
    Evidence: .sisyphus/evidence/task-14-dense-mode.png

  Scenario: Dashboard scrolls with many projects
    Tool: Playwright
    Preconditions: Dashboard with 10+ projects (or mock data)
    Steps:
      1. Navigate to dashboard
      2. Wait for data load
      3. Assert main stack area has `overflow-y: auto` or `scroll` computed style
      4. Scroll down 200px
      5. Assert scroll position changed
      6. Wait for next poll cycle (3s)
      7. Assert scroll position is STILL at 200px (not reset to top)
      8. Screenshot scrolled view
    Expected Result: Scrollable area with position preserved across refresh
    Failure Indicators: No scroll, scroll resets on refresh, content clips
    Evidence: .sisyphus/evidence/task-14-scroll.png
  ```

  **Commit**: YES
  - Message: `feat(ui): density-responsive scaling for 2-5 to 10+ projects`
  - Files: `src/ui/hooks/useDensityMode.ts, src/ui/App.tsx (updated), src/ui/App.css (updated), src/ui/components/ProjectStrip.css (updated), src/ui/components/DashboardHeader.tsx (updated)`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 15. Unit + integration tests

  **What to do**:
  - Create test files using vitest (configured in Task 1):
    - `src/__tests__/multi-project.test.ts` — Unit tests for multi-project aggregation service
    - `src/__tests__/per-session-timeseries.test.ts` — Unit tests for per-session time-series engine
    - `src/__tests__/api.test.ts` — Integration tests for Hono API routes
    - `src/__tests__/hooks.test.ts` — Tests for custom React hooks (useDashboardData, useExpandState, useDensityMode)
  - Test coverage priorities:
    - Multi-project service: test with 0 sources, 1 source, multiple sources; error isolation (one source fails, others succeed)
    - Per-session timeseries: test bucket calculation, zero-activity projects, session filtering by project root
    - API routes: test each endpoint returns correct shape; test error responses (invalid sourceId, invalid sessionId)
    - Hooks: test expand/collapse toggle, density mode thresholds, polling lifecycle (start/stop)
  - Use vitest built-in mocking for SQLite access (mock `withReadonlyDb`)
  - For API tests: create Hono app in-memory using `app.request()` (no need for running server)
  - For hook tests: use `renderHook` from `@testing-library/react` (add as devDependency if needed)

  **Must NOT do**:
  - Do NOT test React component rendering (Playwright handles that in Task 16)
  - Do NOT test CSS styles or visual appearance
  - Do NOT create snapshot tests
  - Do NOT mock the entire ingestion layer — mock at the SQLite boundary only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files covering different layers; requires understanding of mocking patterns
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Tests, not UI
    - `playwright`: Unit tests, not browser tests

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 16 partially — unit tests can run while Playwright setup happens)
  - **Parallel Group**: Wave 4 (with Task 16)
  - **Blocks**: Final Verification Wave (tests must pass before review)
  - **Blocked By**: Tasks 5, 6, 7, 13 (all data + API + state management must be complete)

  **References**:

  **Pattern References** (existing code to follow):
  - `$REF/src/server/api.ts` — Hono app structure to test via `app.request()` pattern
  - `$REF/src/ingest/storage-backend.ts:withReadonlyDb` — The SQLite boundary to mock
  - `$REF/src/server/dashboard.ts:buildDashboardPayload` — Function under test for multi-project service

  **API/Type References**:
  - `src/server/multi-project.ts:createMultiProjectService` — Service under test
  - `src/ingest/per-session-timeseries.ts:derivePerSessionTimeSeries` — Function under test
  - `src/server/api.ts:createApi` — Hono router under test
  - `src/ui/hooks/*.ts` — All custom hooks under test

  **WHY Each Reference Matters**:
  - `withReadonlyDb`: Mocking at this boundary lets us test all logic above SQLite without needing a real DB
  - `app.request()`: Hono provides in-memory request testing without HTTP server — fast and reliable

  **Acceptance Criteria**:
  - [ ] All test files exist in `src/__tests__/`
  - [ ] `bun test` passes with 0 failures
  - [ ] At least 15 test cases covering: aggregation, timeseries, API routes, hooks
  - [ ] Multi-project service tested with 0, 1, and N sources
  - [ ] API error responses tested (invalid IDs)
  - [ ] Hook lifecycle tested (mount, unmount, state changes)

  **QA Scenarios:**

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: All Tasks 1-14 complete
    Steps:
      1. Run `bun test`
      2. Check exit code
      3. Verify output shows pass count >= 15
      4. Verify 0 failures
    Expected Result: All tests green, exit code 0
    Failure Indicators: Any test failure, import errors, mock setup errors
    Evidence: .sisyphus/evidence/task-15-test-results.txt

  Scenario: Tests cover error cases
    Tool: Bash
    Preconditions: Test files written
    Steps:
      1. Run `bun test --reporter=verbose`
      2. Grep output for 'error', 'invalid', 'failure', 'empty'
      3. Assert at least 3 error-case test names found
    Expected Result: Error scenarios covered in test names
    Failure Indicators: Only happy-path tests, no error coverage
    Evidence: .sisyphus/evidence/task-15-error-tests.txt
  ```

  **Commit**: YES
  - Message: `test: unit and integration tests for services, API, and hooks`
  - Files: `src/__tests__/*.test.ts`
  - Pre-commit: `bun test`

---

- [ ] 16. Playwright QA + final polish

  **What to do**:
  - Create `tests/e2e/dashboard.spec.ts` — Playwright end-to-end test suite
  - Install Playwright as devDependency: `bun add -d @playwright/test`
  - Create `playwright.config.ts` with:
    - Base URL: `http://localhost:5173` (Vite dev server)
    - Web server command: `bun run dev` with auto-start
    - Chromium only (single browser sufficient for dashboard)
    - Screenshot on failure enabled
  - E2E test cases:
    - Dashboard loads and shows project strips
    - Strip expand/collapse works
    - Sparkline SVG renders with correct rect count
    - Plan progress shows correct fraction
    - Theme toggle switches dark/light
    - Data auto-refreshes (timestamp changes)
    - Scrolling works with many projects
    - Density mode applied based on project count
  - Final polish tasks:
    - Add `<title>ez-omo-dash</title>` to index.html
    - Add favicon (simple SVG favicon inline)
    - Verify `bun run build` produces clean production build
    - Verify production build serves correctly from Hono static files
    - Fix any TypeScript strict mode warnings
    - Remove any `console.log` from production code
    - Verify dark theme is visually clean (no white flashes, consistent colors)

  **Must NOT do**:
  - Do NOT test in multiple browsers (Chromium only)
  - Do NOT add visual regression testing (screenshot comparison)
  - Do NOT add performance benchmarks
  - Do NOT add CI pipeline configuration (local only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E testing + polish requires running the full app and verifying behavior
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation for E2E testing, selectors, assertions
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Polish is minor; testing is primary focus

  **Parallelization**:
  - **Can Run In Parallel**: PARTIALLY (with Task 15 — Playwright setup can happen while unit tests run)
  - **Parallel Group**: Wave 4 (with Task 15)
  - **Blocks**: Final Verification Wave (E2E must pass before review)
  - **Blocked By**: Tasks 14, 15 (all UI complete + unit tests passing)

  **References**:

  **Pattern References** (existing code to follow):
  - All QA scenarios from Tasks 8-14: each task defined specific Playwright scenarios to execute here
  - `src/ui/components/ProjectStrip.tsx` — CSS class names for selectors: `.project-strip`, `.status-dot`, `[data-expanded]`
  - `src/ui/components/Sparkline.tsx` — Selector: `svg.sparkline-mini`, `svg.sparkline-full`
  - `src/ui/components/PlanProgress.tsx` — Selectors: `.plan-progress-compact`, `.plan-progress-full`, `.progressFill`
  - `src/ui/App.tsx` — Selectors: `.theme-toggle`, `.connection-indicator`, `.last-update`

  **External References**:
  - Playwright docs: `@playwright/test` test runner, `page.goto()`, `page.locator()`, `expect().toBeVisible()`

  **WHY Each Reference Matters**:
  - Task QA scenarios: These define EXACTLY what to test — this task executes all of them systematically
  - Component selectors: Need exact CSS class names to write stable Playwright selectors

  **Acceptance Criteria**:
  - [ ] `playwright.config.ts` exists with Chromium config
  - [ ] `tests/e2e/dashboard.spec.ts` exists with 8+ test cases
  - [ ] `bunx playwright test` passes all tests
  - [ ] `bun run build` succeeds cleanly
  - [ ] Production build serves correctly via Hono
  - [ ] No `console.log` in production source files
  - [ ] `bunx tsc --noEmit` passes with zero warnings

  **QA Scenarios:**

  ```
  Scenario: Full E2E test suite passes
    Tool: Bash
    Preconditions: All Tasks 1-15 complete, dev server running
    Steps:
      1. Run `bunx playwright test --reporter=list`
      2. Check exit code
      3. Verify all tests pass (8+ tests)
    Expected Result: All E2E tests green, exit code 0
    Failure Indicators: Any test failure, timeout, selector not found
    Evidence: .sisyphus/evidence/task-16-e2e-results.txt

  Scenario: Production build serves correctly
    Tool: Bash (curl)
    Preconditions: `bun run build` completed
    Steps:
      1. Run `bun run start &` (production mode)
      2. Wait 2s
      3. `curl -s http://localhost:51244/ | grep '<title>ez-omo-dash</title>'`
      4. `curl -s http://localhost:51244/api/health | jq .ok`
      5. Kill server
    Expected Result: HTML served with correct title, API responds healthy
    Failure Indicators: 404, missing title, API 500
    Evidence: .sisyphus/evidence/task-16-production-build.txt

  Scenario: No console.log in production code
    Tool: Bash (grep)
    Preconditions: Source files finalized
    Steps:
      1. `grep -rn 'console\.log' src/ --include='*.ts' --include='*.tsx' | grep -v '__tests__' | grep -v '.test.' || echo 'CLEAN'`
    Expected Result: Output is 'CLEAN' or only test files
    Failure Indicators: console.log found in non-test source files
    Evidence: .sisyphus/evidence/task-16-no-console-log.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): Playwright tests and production polish`
  - Files: `playwright.config.ts, tests/e2e/dashboard.spec.ts, index.html (updated), package.json (updated devDeps)`
  - Pre-commit: `bun test && bunx playwright test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(scaffold): init project with Bun+Hono+Vite+React` — package.json, configs
- **Wave 1**: `feat(types): define multi-project data models` — src/types.ts
- **Wave 1**: `feat(ingest): adapt ingestion layer from existing dashboard` — src/ingest/*
- **Wave 1**: `feat(styles): add CSS design tokens and base styles` — src/styles/*
- **Wave 2**: `feat(aggregation): multi-project snapshot service` — src/server/multi-project.ts
- **Wave 2**: `feat(timeseries): per-session time-series engine` — src/ingest/per-session-timeseries.ts
- **Wave 2**: `feat(api): multi-project Hono routes` — src/server/api.ts
- **Wave 2**: `feat(ui): project strip, sparkline, plan progress components` — src/ui/components/*
- **Wave 3**: `feat(dashboard): main layout with project strip integration` — src/ui/App.tsx, src/ui/components/DashboardHeader.tsx
- **Wave 3**: `feat(ui): expand/collapse state with detail view panels` — src/ui/hooks/useExpandState.ts
- **Wave 3**: `feat(data): polling hook with error recovery` — src/ui/hooks/useDashboardData.ts
- **Wave 3**: `feat(ui): density-responsive scaling for 2-5 to 10+ projects` — src/ui/hooks/useDensityMode.ts
- **Wave 4**: `test: unit and integration tests for services, API, and hooks` — src/__tests__/*
- **Wave 4**: `test(e2e): Playwright tests and production polish` — tests/e2e/*, playwright.config.ts

---

## Success Criteria

### Verification Commands
```bash
bun run dev            # Expected: Server starts, dashboard accessible at configured port
bun test               # Expected: All tests pass
bun run build          # Expected: Clean production build
curl localhost:PORT/api/health  # Expected: {"ok": true}
curl localhost:PORT/api/projects | jq 'length'  # Expected: >= 2
```

### Final Checklist
- [ ] All "Must Have" present and working
- [ ] All "Must NOT Have" absent from codebase
- [ ] All tests pass (`bun test`)
- [ ] Build succeeds (`bun run build`)
- [ ] Dashboard renders 2+ projects simultaneously
- [ ] Strips collapse/expand smoothly
- [ ] Per-session time-series visible when expanded
- [ ] Plan progress displayed per project
- [ ] Works in both dark and light themes
- [ ] E2E tests pass (`bunx playwright test`)
- [ ] Density scaling works (2-5 comfortable, 6-10 dense, 10+ ultra-dense)
- [ ] Data auto-refreshes without page reload
- [ ] No `console.log` in production source files
- [ ] No `as any` or `@ts-ignore` in source files
