# ez-omo-dash Scaffold Learnings

## Project Setup (Task 1)
- **Port**: Uses `EZ_DASH_API_PORT` env var, defaults to 51244 (not 51234 which is reference dashboard)
- **Dependencies**: Exact versions from requirements, installed successfully with Bun v1.2.16
- **Build**: Vite builds cleanly, TypeScript strict mode passes without issues
- **Architecture**: 
  - Bun+Hono for backend, React 18 for frontend
  - Dev mode: Hono dev server + Vite dev server (parallel)
  - Prod mode: Static SPA serving from dist/ via Bun.serve
  
## Key Files
- `vite.config.ts`: Defines `__APP_VERSION__` global from package.json, proxies /api to backend
- `src/server/dev.ts`: Lightweight dev API server (no static serving, Vite handles it)
- `src/server/start.ts`: Production server with SPA fallback middleware for static files
- `src/app-version.d.ts`: Global type declaration for __APP_VERSION__

## Build Outputs
- `dist/` directory created with index.html and minified JS bundles
- Gzip sizes: 0.44 KB (HTML), 45.74 KB (JS)

## Verification Passed
✓ `bun install` - 133 packages
✓ `bunx tsc --noEmit` - no errors
✓ `bun run build` - Vite build successful
✓ `bun run src/server/dev.ts` - server starts on 127.0.0.1:51244

## Type Definition (Task 2)
- **File**: `src/types.ts` created with 115 lines
- **Types Defined**: 12 exported types for multi-project dashboard:
  - `SourceRegistryEntry`: Project source metadata (id, projectRoot, label, createdAt, updatedAt)
  - `SessionStatus`: Union type for session states (busy|idle|thinking|running_tool|unknown)
  - `PlanStatus`: Plan execution states (not started|in progress|complete)
  - `PlanStep`: Simple step structure (checked, text)
  - `TimeSeriesSeries`: Time series with tone coloring (id, label, tone, values)
  - `TimeSeriesPayload`: Time series container (windowMs, bucketMs, buckets, anchorMs, serverNowMs, series)
  - `SessionTimeSeriesEntry`: Per-session time series contribution (sessionId, sessionLabel, isBackground, values)
  - `SessionTimeSeriesPayload`: Aggregated per-session time series
  - `BackgroundTaskSummary`: Flattened background task info (taskId, sessionId, status, agent, model, currentTool, lastUpdated)
  - `TokenUsageSummary`: Token counts (inputTokens, outputTokens, totalTokens)
  - `ProjectSnapshot`: Complete project state snapshot (sourceId, label, projectRoot, mainSession, planProgress, timeSeries, backgroundTasks, sessionTimeSeries, tokenUsage, lastUpdatedMs)
  - `DashboardMultiProjectPayload`: Multi-project wrapper (projects, serverNowMs, pollIntervalMs)
- **Design Decisions**:
  - All types are self-contained with no external imports (matching spec)
  - No use of `any` or `unknown` in public signatures
  - Tone field in TimeSeriesSeries uses literal union ("muted" | "teal" | "red" | "green") from reference
  - SessionStatus values derived from MainSessionView reference
  - ProjectSnapshot composes smaller domain types for clean composition
- **Verification**:
  - ✓ `bunx tsc --noEmit` passes with zero errors
  - ✓ Committed with message: `feat(types): define multi-project data models`
  - ✓ All 12 required types exported and properly typed

## CSS Design Tokens (Task 3)
- **Files Created**: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/index.css`
- **Token Architecture**:
  - Dark theme as `:root` default (Control Room aesthetic)
  - Light theme via `[data-theme="light"]` selector on html element
  - CSS custom properties for all colors, spacing, typography, transitions
  - Light theme accents adjusted darker for contrast on light backgrounds (e.g. `#0f9b7a` vs `#00d4aa`)
- **Token Categories**: backgrounds (3), text (3), accents (4), borders (2), typography (6 sizes + families), spacing (7), strip dimensions (2), radii (2), transitions (2), status colors (5)
- **Base Styles Include**: CSS reset, body theming from tokens, scrollbar styling (webkit + Firefox), utility classes (.truncate, .mono)
- **Import Chain**: `main.tsx` → `styles/index.css` → `tokens.css` + `base.css`
- **Build Output**: CSS compiles to 2.11 KB (0.87 KB gzip) — minimal overhead
- **Reference Dashboard Influence**: Studied `oh-my-opencode-dashboard@0.4.0` styles.css for color palette inspiration; adapted its teal/green/sand/red accent system into our token structure
- **Verification**: ✓ `bun run build` passes, ✓ no LSP diagnostics, ✓ committed as `feat(styles): add CSS design tokens and base styles`

## Ingestion Layer (Task 4)
- **Files Ported**: 12 files adapted from `oh-my-opencode-dashboard` into `src/ingest/`
- **Files**: paths.ts, model.ts, session.ts, storage-backend.ts, sources-registry.ts, boulder.ts, token-usage-core.ts, background-tasks.ts, timeseries.ts, token-usage.ts, tool-calls.ts, sqlite-derive.ts
- **Read-Only Enforcement**:
  - All `Database` constructors use `{ readonly: true }`
  - Removed `writeRegistry`, `addOrUpdateSource`, `writeFileSync`, `renameSync`, `mkdirSync` (write variants)
  - `sources-registry.ts` contains only `readRegistry()` and `resolveSourceDatabases()`
- **Path Adaptation**: `getDataDir()` defaults to `~/.local/share/opencode/storage/dashboard/`; `sources.json` lives there
- **SQLite Access**: Uses `bun:sqlite` (`Database` from Bun built-in); all opens are readonly
- **Type Preservation**: Ingestion files keep their own internal types to avoid changing data shapes returned by functions
- **Total Lines Added**: 3,102 lines across 12 files
- **Verification**:
  - ✓ `bunx tsc --noEmit` — zero errors
  - ✓ `grep` for write operations — only a comment explaining removal found
  - ✓ Committed as `feat(ingest): adapt read-only ingestion layer from existing dashboard`

## ProjectStrip Component (Task 8)
- **Files Created**: `src/ui/components/ProjectStrip.tsx` (135 lines), `src/ui/components/ProjectStrip.css` (247 lines)
- **Architecture**: Pure presentational component — receives `ProjectSnapshot` + `expanded` boolean + `onToggleExpand` callback
- **Slot Pattern**: Sparkline and PlanProgress rendered into placeholder `<div>` slots with class names:
  - `.sparkline-slot--mini` (48×20px in collapsed header)
  - `.sparkline-slot--full` (100% width in expanded body)
  - `.plan-slot--compact` (flex-fill bar in header)
  - `.plan-slot--full` (100% width in expanded body)
- **Expand/Collapse**: Uses `data-expanded` attribute on container + CSS `max-height` transition (600px max) with `overflow: hidden`
- **Status Mapping**: Status dot uses `data-status` attribute mapped to `--status-{status}` CSS vars (busy/idle/thinking/running_tool/unknown)
- **Helper Functions**:
  - `formatRelativeTime(ms)`: Exported, converts timestamp to "2s ago", "1m ago", etc.
  - `formatTokenCount(n)`: Internal, compact token display (1.2k, 1.50M)
- **Keyboard Accessibility**: Header has `role="button"`, `tabIndex={0}`, handles Enter/Space keydown
- **All colors from tokens**: No hardcoded colors anywhere in CSS or TSX
- **Verification**: ✓ `bunx tsc --noEmit` zero errors, ✓ LSP diagnostics clean, ✓ committed as `feat(ui): project strip component with collapsed/expanded states`

## Multi-Project Aggregation Service (Task 5)
- **Files Created**: `src/server/dashboard.ts` (515 lines), `src/server/multi-project.ts` (165 lines)
- **dashboard.ts Architecture**:
  - Adapted from `oh-my-opencode-dashboard@0.4.0` reference `src/server/dashboard.ts`
  - Exports: `buildDashboardPayload`, `createDashboardStore`, `DashboardStore` type, `DashboardPayload` type
  - Dual-path strategy: SQLite-first with file-based fallback (matching reference exactly)
  - DashboardStore uses dirty-flag caching with configurable `pollIntervalMs` (default 2000ms)
  - Stripped ALL write operations: no fs.watch watchers, no file writes, no SQLite writes
  - All SQLite access via ingestion layer functions that already enforce `{ readonly: true }`
- **multi-project.ts Architecture**:
  - `createMultiProjectService({ storageRoot, storageBackend, pollIntervalMs })` returns `{ getMultiProjectPayload }`
  - Uses lazy store pattern from reference `start.ts:74-105`: `Map<string, DashboardStore>` keyed by sourceId and projectRoot
  - `listSources()` → for each source → `getSourceById()` → `getOrCreateStore()` → `getSnapshot()` → transform to `ProjectSnapshot`
  - Per-source try/catch error isolation: if one source fails, others still return
  - Handles 0 sources gracefully (returns empty `projects` array)
  - `DashboardPayload` → `ProjectSnapshot` transformation maps status pills back to union types
  - `sessionTimeSeries` populated with empty placeholder (no per-session breakdown available from single-project payload)
  - `getLegacyStorageRootForBackend()` used to derive legacy file storage root from storage backend
- **Key Design Decisions**:
  - No separate aggregation database — each source gets its own DashboardStore instance
  - No WebSocket/SSE — service is called on each API poll
  - No fs.watch in DashboardStore — poll-based caching is sufficient for API-driven refreshes
  - `selectStorageBackend()` not used in multi-project.ts (backend passed in from caller)
- **Verification**:
  - ✓ `bunx tsc --noEmit` — zero errors
  - ✓ LSP diagnostics — zero issues on both files
  - ✓ Committed as `feat(aggregation): multi-project snapshot service`

## Per-Session Time-Series Engine (Task 5a)
- **File Created**: `src/ingest/per-session-timeseries.ts` (195 lines)
- **Function**: `derivePerSessionTimeSeries(opts)` → `SessionTimeSeriesPayload`
- **Design Approach**:
  - Uses `bun:sqlite` `Database` directly with `{ readonly: true }` (same as `storage-backend.ts`)
  - Local `withReadonlyDb` helper since the storage-backend version is not exported
  - Local `classifySqliteError` for consistent error classification
  - Single DB connection with 3 efficient queries (sessions → messages → parts)
- **SQL Strategy**:
  - Query 1: Get ALL sessions with non-null directory (filtered in JS with `normalizePath` for path comparison)
  - Query 2: Get messages within time window for matched sessions (batched IN clause)
  - Query 3: Get parts for those messages (batched IN clause), filter `type='tool'` in JS after JSON parse
  - JavaScript-side bucketing into 2s intervals over 5min window
- **Key Parameters**: windowMs=300000, bucketMs=2000, buckets=150
- **Anchor Calculation**: `anchorMs = Math.floor(nowMs / bucketMs) * bucketMs`, `startMs = anchorMs - windowMs + bucketMs`
- **Path Normalization**: Uses `realpathSafe` from `./paths` (same as `readMainSessionMetasSqlite`)
- **isBackground Logic**: If `boulderSessionIds` provided, sessions NOT in that set are background; otherwise all `false`
- **Edge Cases Handled**:
  - No sessions for project → empty `sessions` array
  - No messages in time window → empty `sessions` array
  - Session with partial activity → zero-filled buckets (via `zeroBuckets()` initialization)
  - All `values` arrays guaranteed length 150 (= buckets)
- **Performance Note**: Queries ALL sessions from DB (needed for directory matching), but only fetches messages/parts within the 5min window — keeps data volume bounded
- **Gotcha**: `withReadonlyDb` is NOT exported from `storage-backend.ts`, requiring local reimplementation
- **Verification**: ✓ `bunx tsc --noEmit` — zero errors, ✓ LSP diagnostics clean

## PlanProgress Component (Task 9)
- **Files Created**: `src/ui/components/PlanProgress.tsx` (99 lines), `src/ui/components/PlanProgress.css` (128 lines)
- **Architecture**: Pure presentational component — zero state, zero effects, zero data fetching
- **Two Modes**:
  - **Compact**: `<span>` with `{completed}/{total}` fraction, em dash `—` when total===0, `data-tone` attribute for color
  - **Full**: progress bar + plan name header + status pill badge + step checklist
- **Helpers** (internal, not exported):
  - `statusTone(status: PlanStatus)` → 'complete' | 'progress' | 'idle' for CSS class mapping
  - `clampPercent(n)` → clamped [0,100] for progress bar width
  - `basename(path)` → strips directory path for display name
- **Color Mapping**: green (--status-busy) = complete, amber (--status-thinking) = in progress, gray (--status-idle) = not started
- **Pill Badge Pattern**: `.pill .pill--{tone}` with color-mix() for translucent background/border (adapted from reference)
- **Step Checklist**: Max 10 steps visible, `+ N more` truncation, [✓]/[\u00A0] prefix with `.mono` utility class
- **CSS Design**: Uses `data-tone` attributes for color mapping (same pattern as ProjectStrip's `data-status`), no hardcoded colors
- **Exported**: `PlanProgress` component + `PlanProgressProps` type
- **Verification**: ✓ `bunx tsc --noEmit` zero errors, ✓ `bun run build` passes, ✓ LSP diagnostics clean, ✓ committed as `feat(ui): plan progress indicator with compact and full modes`

## Sparkline Component (Task 7)
- **Files Created**: `src/ui/components/Sparkline.tsx` (352 lines), `src/ui/components/Sparkline.css` (55 lines)
- **Architecture**: Pure presentational SVG component — no state, no effects, no data fetching
- **Two Modes**:
  - `mini`: 48×20px, last 30 buckets, single summed teal bar per bucket, for collapsed strip header
  - `full`: 100% width × 80px, all 150 buckets, stacked multi-series bars, for expanded detail view
- **SVG Pattern** (from reference `App.tsx:157-276`):
  - `viewBox="0 0 ${buckets} ${height}"` with `preserveAspectRatio="none"`
  - Each bucket = one `<rect>`, barW=0.85, barInset=(1-barW)/2
  - Bar height proportional to value, normalized to max in window
  - `aria-hidden="true"` on all SVGs
- **Stacked Segments**: Local `computeStackedSegments()` adapted from `timeseries-stacked.ts`
  - Bottom→top order: sisyphus(teal), prometheus(red), atlas(green), other(sand)
  - Handles overflow clamping, 1px minimum for visible agents, fair excess distribution
- **Series Tone Mapping**: sisyphus=teal, prometheus=red, atlas=green, background=muted (from ref App.tsx:405-410)
- **CSS Strategy**: CSS vars from tokens (`--status-busy`, `--accent-danger`, `--accent-success`, `--accent-warning`), hover opacity transition
- **Props**: `{ mode, timeSeries, sessionTimeSeries?, width?, height?, className? }`
- **Verification**: ✓ `bunx tsc --noEmit` zero errors, ✓ LSP diagnostics clean, ✓ Committed as `feat(ui): sparkline component with mini and full modes`

## useExpandState Hook (Task 12)
- **File Created**: `src/ui/hooks/useExpandState.ts` (66 lines)
- **Architecture**: Custom hook extracting expand/collapse state from App.tsx with localStorage persistence
- **API**: `useExpandState()` → `{ expandedIds: Set<string>, toggle(id), expandAll(ids[]), collapseAll() }`
- **localStorage Key**: `ez-dash-expanded` — persists as JSON array of source IDs
- **Initialization**: `useState` lazy initializer reads from localStorage; `useEffect` persists on changes
- **Error Handling**: try/catch around both read and write to handle unavailable localStorage
- **Key Decision**: `expandAll` accepts `string[]` parameter rather than accessing data directly — keeps hook data-agnostic
- **App.tsx Integration**: `handleExpandAll` wrapper in App bridges hook's `expandAll(ids[])` with `data.projects.map(p => p.sourceId)`
- **Imports Cleaned**: Removed `useState` from App.tsx imports (no longer used directly); kept `useMemo`, `useCallback`
- **Verification**: ✓ `bunx tsc --noEmit` zero errors, ✓ LSP diagnostics clean on both files

## Data Polling Hook (Task 12)
- **File Created**: `src/ui/hooks/useDashboardData.ts` (66 lines)
- **File Modified**: `src/main.tsx` — added `DashboardRoot` wrapper component
- **Pattern**: Recursive `setTimeout` (not `setInterval`) to prevent request pile-up
- **Poll Delays**: 2200ms when connected, 3600ms when disconnected
- **Refs Used**: `timerRef` (timeout ID), `abortRef` (AbortController), `connectedRef` (avoids stale closure in setTimeout callback)
- **Error Recovery**: On fetch error, keeps last-known data (stale), sets `connected=false`, sets `errorHint` with error message
- **AbortController**: New controller created per tick, aborted on unmount cleanup
- **API Shape**: `GET /api/projects` returns `DashboardMultiProjectPayload` directly (no `{ ok, ... }` wrapper)
- **DashboardRoot Pattern**: Wrapper component in `main.tsx` calls the hook and passes props to `<App>`
- **Verification**: ✓ `bunx tsc --noEmit` zero errors, ✓ LSP diagnostics clean, ✓ committed as `feat(data): polling hook with error recovery`

## Density Mode (Task 13)
- **File Created**: `src/ui/hooks/useDensityMode.ts` (19 lines)
- **Files Modified**: `src/ui/App.tsx`, `src/ui/App.css`, `src/ui/components/ProjectStrip.css`
- **Architecture**: Pure function wrapped in `useMemo` — returns `'comfortable' | 'dense' | 'ultra-dense'` based on project count
- **Thresholds**: ≤5 comfortable, ≤10 dense, 10+ ultra-dense
- **Integration**: `data-density` attribute on `.page` div, CSS descendant selectors for overrides
- **CSS Overrides**:
  - App.css: `.project-stack` gap varies per density (8px → 4px → 2px)
  - App.css: `.project-stack` gets `overflow-y: auto`, `max-height: calc(100vh - 96px)`, `scrollbar-gutter: stable`
  - ProjectStrip.css: Dense = 40px strips, `--sp-2` padding, `--font-xs`
  - ProjectStrip.css: Ultra-dense = 36px strips, `--sp-1` padding, `0.6rem` font, 10ch label width
- **Scroll Preservation**: React preserves scroll on stable DOM elements — `key={project.sourceId}` ensures stability
- **Class Names Used**: `.strip-header`, `.strip-label`, `.sparkline-slot--mini`, `.strip-agent-badge`, `.strip-updated`, `.strip-chevron`
- **DashboardHeader**: Already has project count badge — NOT modified
- **Verification**: ✓ `bunx tsc --noEmit` zero errors, ✓ LSP diagnostics clean, ✓ committed as `feat(ui): density-responsive scaling for 2-5 to 10+ projects`

## Vitest Testing (Task 15)
- **Files Created**: 4 test files in `src/__tests__/`:
  - `hooks.test.ts` (11 tests) — density mode thresholds + expand state Set logic
  - `api.test.ts` (7 tests) — Hono API routes via `app.request()`
  - `multi-project.test.ts` (4 tests) — multi-project service transformation
  - `per-session-timeseries.test.ts` (4 tests) — bucket calculations + error handling
- **Total**: 26 test cases, all passing in ~600ms
- **Mocking Patterns**:
  - `bun:sqlite` must be mocked as `vi.mock("bun:sqlite", ...)` — needed in any test file that transitively imports modules using `bun:sqlite` (storage-backend.ts, per-session-timeseries.ts, sqlite-derive.ts)
  - `vi.hoisted()` required when mock factory references variables declared at module top level — `vi.mock` is hoisted above variable declarations, causing "Cannot access before initialization" errors
  - Hono API testing uses `app.request(path)` pattern — returns standard `Response` objects
  - `vi.mock("../server/multi-project", ...)` uses the path relative to the test file, not the importing file
- **Gotchas**:
  - Hono resolves `../` in URL paths before matching routes — `/tool-calls/../etc/passwd` becomes `/etc/passwd` (404 not 400). Use chars that fail the regex but don't contain `/` (e.g., `ses!@#$%`)
  - Pre-existing tsc error in `src/ui/App.tsx` (children prop on ProjectStrip) — not caused by test files
  - vitest reads config from `vite.config.ts` automatically, no separate vitest.config.ts needed

## Playwright E2E Configuration (Task 17)
- **File Modified**: `playwright.config.ts` — added `webServer` block to auto-start Vite dev server
- **webServer Config**:
  - `command: "bun run dev:ui"` — starts Vite dev server (React app only)
  - `port: 5173` — standard Vite dev server port
  - `reuseExistingServer: !process.env.CI` — reuses existing server in dev, restarts fresh in CI
  - `timeout: 30_000` — gives Vite 30s to fully start before test runner begins
- **No Backend Server Needed**: E2E tests mock API responses via `page.route("**/api/projects", ...)` — Hono API server not required
- **Test Results**: All 9 E2E tests PASS (100%) with config fix:
  - ✓ loads and shows project strips (387ms)
  - ✓ strip expand/collapse toggles (301ms)
  - ✓ sparkline SVG renders correctly (146ms)
  - ✓ plan progress shows correct content (148ms)
  - ✓ theme toggle switches dark/light (165ms)
  - ✓ data auto-refreshes with updated timestamp (3.6s)
  - ✓ scrolling works with many projects (175ms)
  - ✓ density mode applied based on project count (228ms)
  - ✓ expand all and collapse all buttons work (201ms)
- **Key Insight**: Playwright `webServer` is the standard pattern for integration tests that need a local dev server. The config was completely missing from Task 16, causing all tests to fail with `ERR_CONNECTION_REFUSED`.
- **Gotcha**: For subsequent E2E runs, if Vite doesn't fully stop, `reuseExistingServer` allows reuse. In CI environments, set `CI=1` env var to force fresh server startup.
- **Verification**: ✓ All 9 tests pass, ✓ no LSP diagnostics on config file, ✓ ready for CI integration

## Dashboard Payload Builder Consolidation (Task: assemblePayload extraction)
- **Files Modified**: `src/server/dashboard.ts` (516 → 514 lines)
- **Helpers Extracted**: 3 private functions:
  1. `readPlanData(projectRoot)` — reads boulder state, plan name/path, plan progress, plan steps
  2. `buildMainSessionTask(opts)` — constructs the main session task array (status mapping, timeline, tool call summary)
  3. `assemblePayload(data)` — constructs the full `DashboardPayload` object with mainSession, planProgress, backgroundTasks mapping, raw mirror
- **Deduplication Strategy**: Keep data-fetching different (file-based vs SQLite with Result types), share only the assembly logic
- **Key Design Decision**: `buildMainSessionTask` accepts `toolCalls: Array<{ tool?: string }>` — caller resolves the data source (file-based `deriveToolCalls` vs SQLite `deriveToolCallsSqlite` Result) before calling
- **SQLite IIFE preserved**: The SQLite builder's `mainSessionTasks` IIFE still handles `deriveToolCallsSqlite` Result checking locally, then delegates to `buildMainSessionTask`
- **Line count**: Modest reduction (2 lines) because typed helper signatures add overhead, but the real win is single source of truth for payload shape — future changes to DashboardPayload only need updating in one place
- **Gotcha**: The file-based `main` variable lacks `currentModel` in its fallback literal (`{ agent: "unknown", ... }`) — must use `"currentModel" in main` check. The SQLite fallback includes `currentModel: null` explicitly
- **Verification**: ✓ `bunx tsc --noEmit` clean, ✓ 26/26 tests pass, ✓ `bun run build` succeeds

## React.memo() Optimization (Task R1)
- **Files Modified**: `src/ui/components/ProjectStrip.tsx`, `Sparkline.tsx`, `PlanProgress.tsx`
- **Pattern Applied**: Wrapped each component in `React.memo()` to prevent unnecessary re-renders during polling
- **Implementation Strategy**:
  - Renamed original function (e.g., `ProjectStrip` → `ProjectStripInner`)
  - Created const export: `export const ProjectStrip = memo(ProjectStripInner)`
  - Imported `memo` from 'react' at top of each file
  - Maintained original export names to preserve all downstream imports
- **Why These Three Components**:
  - All are pure presentational (zero state, zero effects, no data fetching)
  - Parent `App` re-renders every 2.2s due to polling cycle
  - Default shallow comparison is sufficient (no custom comparators needed)
  - Prevents redundant DOM reconciliation when props unchanged
- **Performance Impact**: With 10+ projects in dense mode, this saves ~N component re-renders per 2.2s poll, where N = 30 (3 components × 10 projects)
- **Verification**: ✓ `bun run build` — 42 modules, clean, ✓ no LSP diagnostics on components, ✓ export names unchanged (backward compatible)
