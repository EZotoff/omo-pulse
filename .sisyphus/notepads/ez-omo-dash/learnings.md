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
