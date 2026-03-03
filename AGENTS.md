# AGENTS.md — omo-pulse

> AI coding agent context file. Read this before making any changes.

## Project Overview

omo-pulse is a real-time dashboard for monitoring OpenCode AI coding sessions. It watches multiple projects simultaneously, showing session activity, agent status, tool usage, plan progress, and token consumption. Designed as a persistent service (systemd-compatible), not tied to any single OpenCode session.

## Quick Start

```bash
bun install          # Install dependencies
bun run dev          # Start dev server (UI: 4300, API: 4301)
bun run build        # Production build (vite build)
bun run start        # Production server (serves built UI + API on 4300)
bun run test         # Run test suite (vitest)
```

## Tech Stack

| Layer       | Technology                                    |
|-------------|-----------------------------------------------|
| Runtime     | Bun >= 1.1.0                                  |
| Language    | TypeScript (strict mode, ES2022 target)       |
| UI          | React 18, Vite 5, CSS (plain, no modules)     |
| Server      | Hono                                          |
| Database    | SQLite via `bun:sqlite` (readonly reads)      |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable             |
| Testing     | Vitest (unit), Playwright (e2e)               |
| Build       | Vite                                          |

## Directory Structure

```
src/
  main.tsx                → React entry point
  types.ts                → Shared TypeScript types (all layers import from here)
  app-version.d.ts        → Global __APP_VERSION__ type declaration
  ui/
    App.tsx               → Root React component
    App.css               → Root styles
    types.ts              → UI-specific types
    components/
      ProjectStrip.tsx    → Per-project status strip (main UI element)
      SessionSwimlane.tsx → Session timeline visualization
      Sparkline.tsx       → Sparkline chart component
      PlanProgress.tsx    → Plan step progress display
      DashboardHeader.tsx → Top header bar
      SettingsPanel.tsx   → Settings drawer
      AddProjectForm.tsx  → Add new project form
      ColumnResizeHandle.tsx → Resizable column handle
      *.css               → Co-located CSS for each component
    hooks/
      useDashboardData.ts → Polling hook for /api/projects
      useExpandState.ts   → Expand/collapse state per project
      useStripConfig.ts   → Strip display configuration
      useProjectOrder.ts  → Drag-and-drop project ordering
      useProjectVisibility.ts → Show/hide projects
      useProjectPaneHeights.ts → Resizable pane heights
      useDensityMode.ts   → Compact/comfortable display mode
      useSoundNotifications.ts → Audio notifications
    utils/
      avatar.ts           → Project avatar/initials helper
  server/
    api.ts                → Hono API routes (factory: createApi)
    dev.ts                → Development server entry
    start.ts              → Production server entry
    multi-project.ts      → Multi-project aggregation service
    dashboard.ts          → Dashboard data assembly
  ingest/
    storage-backend.ts    → SQLite + file-based storage abstraction
    session.ts            → Session metadata reading
    sqlite-derive.ts      → SQLite-derived data queries
    tool-calls.ts         → Tool call extraction from messages
    timeseries.ts         → Time series aggregation
    per-session-timeseries.ts → Per-session time series breakdown
    token-usage.ts        → Token usage tracking
    token-usage-core.ts   → Core token counting logic
    boulder.ts            → Boulder/loop detection
    background-tasks.ts   → Background task tracking
    sources-registry.ts   → Project source registration
    model.ts              → Model name parsing
    paths.ts              → Path resolution and validation
  styles/
    index.css             → Style entry point
    base.css              → Base/reset styles
    tokens.css            → CSS custom properties (design tokens)
  __tests__/              → Vitest unit tests (5 test files)
scripts/
  install-service.sh      → Install systemd user service
  uninstall-service.sh    → Remove systemd user service
systemd/                  → Systemd service template
tests/
  e2e/
    dashboard.spec.ts     → Playwright e2e tests
docs/                     → Screenshots, documentation
```

## Code Conventions

### TypeScript
- Strict mode enabled (`"strict": true`)
- Target ES2022 with Bundler module resolution
- Path alias: `~/*` maps to `./src/*`
- Types in `bun-types` (no `@types/node`)
- Shared types live in `src/types.ts` — import from there, not from individual modules
- Discriminated unions for variant types (e.g., `StorageBackend` with `kind` field)
- Result types: `{ ok: true; value/rows } | { ok: false; reason }` pattern

### React
- Functional components only, with hooks
- `memo()` for performance-critical components
- Props defined as explicit `type` (not `interface`)
- Co-located CSS files (plain CSS, not CSS modules or CSS-in-JS)
- Custom hooks in `src/ui/hooks/` with explicit return type annotations
- No external state management — useState/useRef/useCallback patterns

### Server (Hono)
- Factory pattern: `createApi(opts)` returns a `Hono` instance
- Middleware for no-cache headers and JSON content type
- Error handler returns `{ ok: false, error: string }` with status code
- Routes prefixed with `/api` via Vite proxy in dev

### Database
- SQLite accessed via `bun:sqlite` with `{ readonly: true }` for reads
- `withReadonlyDb()` wrapper handles open/close/error classification
- Never write to OpenCode's SQLite — read-only observer
- File-based fallback for legacy OpenCode versions

### Styling
- CSS custom properties defined in `src/styles/tokens.css`
- Dark mode support via CSS
- No Tailwind, no CSS modules, no CSS-in-JS

## Environment Variables

| Variable           | Default | Description                      |
|--------------------|---------|----------------------------------|
| `EZ_DASH_UI_PORT`  | 4300    | Vite dev server / production port |
| `EZ_DASH_API_PORT` | 4301    | API server port (dev only)       |

## API Routes

All routes are under `/api` prefix (via Vite proxy in dev, direct in production):

- `GET /api/health` — Health check with version
- `GET /api/sources` — List registered project sources
- `POST /api/sources` — Register new project source
- `GET /api/projects` — All projects with full snapshots (main polling endpoint)
- `GET /api/projects/:sourceId` — Single project detail
- `GET /api/tool-calls/:sessionId` — Tool call history for a session
- `GET /api/service/status` — Systemd service status
- `POST /api/service/enable` — Enable systemd auto-start
- `POST /api/service/disable` — Disable systemd auto-start

## Testing

- **Framework**: Vitest for unit tests, Playwright for e2e
- **Run**: `bun run test` (runs vitest, excludes e2e)
- **Unit tests**: `src/__tests__/*.test.ts` (5 files, ~26 tests)
- **E2e tests**: `tests/e2e/dashboard.spec.ts`
- **Config**: `vite.config.ts` (test block excludes `tests/e2e/**`)
- **All tests must pass before committing**
- **Note**: `bun:sqlite` requires no special vitest config — it works natively with Bun runtime

## Commit Protocol

- **Format**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- **Scope**: Optional, use module name (e.g., `feat(ingest):`, `fix(ui):`)
- **Always use `bun`** — never `npm` or `yarn`

## Boundaries — Do NOT

- **Do not modify `vite.config.ts`** without explicit request
- **Do not add new dependencies** without approval
- **Do not change the SQLite schema** — this project only reads OpenCode's database
- **Do not modify the build pipeline** (vite config, tsconfig paths)
- **Do not use `npm`** — always use `bun`
- **Do not write to OpenCode's SQLite** — read-only observer pattern
- **Do not reference ESLint, Prettier, or other linting tools** — none are configured
- **Do not create CSS modules or CSS-in-JS** — use plain co-located CSS files
- **Do not introduce external state management** (Redux, Zustand, etc.)
