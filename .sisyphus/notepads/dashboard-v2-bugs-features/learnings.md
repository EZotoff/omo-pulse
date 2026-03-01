# Learnings — Dashboard V2 Bugs + Features

## 2026-03-01 Session Start
- Project uses: React 18, Hono server, Vite build, vitest, Playwright for testing
- No state management library — React useState + localStorage only
- Design tokens in `src/styles/tokens.css`
- Hooks directory: `src/ui/hooks/`
- Components directory: `src/ui/components/`
- Types centralized in `src/types.ts`
- Build command: `bun run build`
- Dev server port: 4301

## Task: Install @dnd-kit and Add Type Definitions (2026-03-01)

### Success Summary
- ✅ Installed @dnd-kit/core@6.3.1 and @dnd-kit/sortable@10.0.0 as runtime deps
- ✅ Added 3 new type definitions to src/types.ts following existing patterns
- ✅ Build passes with exit code 0
- ✅ Committed: `82319db chore(deps): add @dnd-kit/core, @dnd-kit/sortable and new type defs`

### Type Definitions Added
1. **StripConfigState** - 8 boolean fields for strip visibility toggles
2. **SoundConfig** - 5 fields for sound notification settings (enabled, volume, 3 event flags)
3. **ProjectOrderState** - orderedIds[] and columns number for layout state

### Pattern Notes
- Bun uses `bun.lock` (not bun.lockb) - update verification if needed
- Types follow existing pattern: JSDoc comment + `export type` + object literal
- New types appended at EOF after DashboardMultiProjectPayload (line 115)
- @dnd-kit/utilities installed as transitive dependency (not direct)


## Bug Fix: Expanded View Overlap + Height Mismatch (2026-03-01)

### Root Cause
- `.sparkline-slot--full` in ProjectStrip.css had `height: 48px` but the Sparkline SVG renders at `height: 80px` (default in Sparkline.tsx:327)
- This 32px height mismatch caused the SVG to overflow its container, overlapping adjacent sections

### Fixes Applied (ProjectStrip.css only)
1. `.sparkline-slot--full` height: `48px` → `80px` + `overflow: visible` for glow effects
2. `.strip-body` max-height: `600px` → `900px` to accommodate future swimlane content
3. `.strip-section` added `flex-shrink: 0` to prevent sections from compressing each other

### Key Insight
- Container heights MUST match their SVG content heights — SVG viewBox doesn't auto-shrink
- `overflow: visible` needed on sparkline container so glow/drop-shadow effects aren't clipped
- `flex-shrink: 0` on flex children prevents layout compression when parent has constrained height
## Task: Create useStripConfig Hook (2026-03-01)

### Success Summary
- ✅ Created `src/ui/hooks/useStripConfig.ts` with full localStorage persistence
- ✅ Exports named function `useStripConfig` with correct signature
- ✅ Returns `{ config, toggle, reset }` as specified
- ✅ All 8 toggles default to `true`
- ✅ Reads/writes to localStorage key `'dashboard-strip-config'` with try-catch safety
- ✅ Build passes with exit code 0
- ✅ Committed: `0091b33 feat(config): add useStripConfig hook with localStorage persistence`

### Implementation Pattern
- Followed `useExpandState.ts` structure exactly: helper functions + useState initializer + useEffect persistence + useCallback handlers
- `readPersistedConfig()`: JSON.parse with null coalescing fallback to defaults
- `persistConfig()`: try-catch wrapped localStorage.setItem
- `toggle()`: spreads prev config and flips target key boolean
- `reset()`: restores DEFAULT_CONFIG
- StripConfigState imported from `../../types` (lines 118-127)

## Task: Create useProjectOrder Hook (2026-03-01)

### Success Summary
- ✅ Created `src/ui/hooks/useProjectOrder.ts` with full localStorage persistence
- ✅ Exports named function `useProjectOrder` with correct signature
- ✅ Returns `{ orderedIds, columns, reorder, setColumns, syncIds }` as specified
- ✅ Default state: `{ orderedIds: [], columns: 1 }`
- ✅ Reads/writes to localStorage key `'dashboard-project-order'` with try-catch safety
- ✅ All handlers implemented: reorder (splice-based move), setColumns, syncIds (reconciliation)
- ✅ Build passes with exit code 0
- ✅ LSP diagnostics clean (no errors)
- ✅ Committed: `81ed9e8 feat(layout): add useProjectOrder hook with localStorage persistence`

### Implementation Pattern
- Followed `useExpandState.ts` structure exactly: helper functions + useState initializer + useEffect persistence + useCallback handlers
- `readPersistedState()`: JSON.parse with type guard validation, fallback to `{ orderedIds: [], columns: 1 }`
- `persistState()`: try-catch wrapped localStorage.setItem
- `reorder(oldIndex, newIndex)`: uses splice-based array move — splice removes item, splice inserts it at new position
- `setColumns(n)`: updates columns field and persists
- `syncIds(currentIds)`: retains existing IDs in order, appends new ones, removes stale ones
- ProjectOrderState imported from `../../types` (lines 139-142)

### Key Insights
- Splice-based reorder: `splice(oldIndex, 1)` removes 1 item and returns it, then `splice(newIndex, 0, item)` inserts it
- syncIds preserves existing order while absorbing new IDs — essential for DnD when projects change
- State object destructuring in return is cleaner than spreading entire state

## Task: Create AddProjectForm Component (2026-03-01)

### Success Summary
- ✅ Created `src/ui/components/AddProjectForm.tsx` — inline form with POST /api/sources integration
- ✅ Created `src/ui/components/AddProjectForm.css` — control room styled with design tokens
- ✅ LSP diagnostics clean (no errors)
- ✅ Build passes with exit code 0
- ✅ Committed: `f2c52f3 feat(projects): add AddProjectForm component with API integration`

### Implementation Pattern
- Followed DashboardHeader pattern: type export for props, named export for component
- State: projectRoot, label, loading, statusMessage, statusType, fading — all useState
- Status fade after 3s via CSS transition + setTimeout toggling a `--fade` class
- useRef for fade timer cleanup on unmount
- useCallback for submit handler with projectRoot/label/onProjectAdded/showStatus deps
- CSS uses existing tokens: --bg-secondary, --border-primary, --accent-primary, --font-mono, --radius-sm
- Submit button: transparent background with accent border, inverts on hover
- Input validation: client-side non-empty check before API call; server handles path existence
- fetch with try/catch for network errors, data.ok check for API-level errors

## Task: Create SessionSwimlane Component (2026-03-01)

### Success Summary
- ✅ Created `src/ui/components/SessionSwimlane.tsx` — per-session horizontal time bar rows
- ✅ Created `src/ui/components/SessionSwimlane.css` — styled with design tokens
- ✅ LSP diagnostics clean (no errors, no warnings)
- ✅ Build passes with exit code 0
- ✅ Committed: `860bb6a feat(swimlane): add SessionSwimlane component with per-session rows`

### Implementation Details
- Flat single-component architecture (no SwimlaneRow sub-components)
- `memo()` wrapped for render perf, `useCallback` for pin toggle, `useMemo` for sort + scaleMax
- Agent tone detection: regex-free `.includes()` on lowercased label
- Background sessions (isBackground: true) override tone to "muted"
- Sort: pinned (Set<string>) first, then by sum of values descending
- SVG bars: viewBox = `{buckets} x 14`, barW = 0.85 (matching Sparkline convention), barInset = 0.075
- Gradient defs extracted to `GradientDefs` helper component to avoid duplication per row
- Gradient IDs reuse Sparkline's `sparkline-grad-{tone}` naming for consistency

### Token Mapping Notes
- Task spec referenced `--border-default` and `--bg-card` — these don't exist in tokens.css
- Used `--border-primary` instead of `--border-default`, `--bg-secondary` instead of `--bg-card`
- Pin button uses opacity 0 → 1 on row hover or when pinned, with `--accent-primary` color for active pins
- Empty state uses dashed border with `--border-primary`

## Task: Create SettingsPanel Component (2026-03-01)

### Success Summary
- ✅ Created `src/ui/components/SettingsPanel.tsx` — slide-out panel with display + sound config
- ✅ Created `src/ui/components/SettingsPanel.css` — dark theme with custom toggle switches
- ✅ LSP diagnostics clean (no errors)
- ✅ Build passes with exit code 0
- ✅ Committed: `92e57a5 feat(settings): add SettingsPanel with config toggles and sound settings`

### Implementation Pattern
- Pure controlled component — receives all config via props, calls callbacks for changes
- Props: stripConfig, onToggleStrip, soundConfig, onSoundConfigChange, onTestSound, open, onClose
- Escape key listener via useEffect (only active when open=true)
- Click-outside via mousedown on backdrop overlay (separate div underneath panel)
- Custom CSS toggle switches using `data-checked` attribute + `::after` pseudo-element
- Panel slides in from right with `transform: translateX(100%)` → `translateX(0)` transition
- Backdrop uses rgba(0,0,0,0.55) overlay with opacity transition
- Sound section dims (opacity 0.35 + pointer-events: none) when master toggle is off
- Volume slider shows numeric value label next to it
- Static metadata arrays (DISPLAY_TOGGLES, SOUND_EVENTS) defined outside component for perf
- Test buttons inline next to each sound event toggle

### Key Design Decisions
- Used `data-open` attribute pattern (matching DashboardHeader's `data-connected` pattern)
- `role="switch"` + `aria-checked` on toggles for accessibility
- `role="dialog"` + `aria-modal="true"` on the panel aside element
- CSS classes use BEM-like naming: `.settings-panel__header`, `.settings-toggle-row`
- No z-index wars: backdrop at 900, panel at 901

## Task: Wire StripConfigState Toggles into ProjectStrip (2026-03-01)

### Success Summary
- ✅ Updated ProjectStripProps type to include optional `stripConfig?: StripConfigState`
- ✅ Imported StripConfigState type from `../../types`
- ✅ Destructured stripConfig from props in ProjectStripInner function signature
- ✅ Wrapped 5 collapsed header elements with config conditionals using `!== false` pattern
- ✅ Wrapped 2 expanded body sections (Background Tasks and Token Usage) with config conditionals
- ✅ Added reserved comment for showGitWorktrees (not yet implemented)
- ✅ Build passes with exit code 0
- ✅ LSP diagnostics clean (no errors)
- ✅ Committed: `7691f5a feat(config): wire strip config toggles into ProjectStrip collapsed and expanded views`

### Implementation Details

**Props Update (line 31-42)**:
- Added `stripConfig?: StripConfigState` as optional prop (backward compatible)

**Collapsed Header Elements (lines 52-57)**:
1. `{stripConfig?.showStatusDot !== false && <span className="strip-status-dot" .../>}` (line 52)
2. `.strip-label` and `.strip-chevron` — NO wrapping (always visible)
3. `{stripConfig?.showMiniSparkline !== false && <div className="sparkline-slot sparkline-slot--mini">...</div>}` (line 54)
4. `{stripConfig?.showAgentBadge !== false && <span className="strip-agent-badge">...</span>}` (line 55)
5. `{stripConfig?.showPlanProgress !== false && <div className="plan-slot plan-slot--compact">...</div>}` (line 56)
6. `{stripConfig?.showLastUpdated !== false && <span className="strip-updated">...</span>}` (line 57)

**Expanded Body Sections (lines 99-140)**:
1. Background Tasks section (lines 100-120): Entire `<div className="strip-section">...</div>` wrapped with `{stripConfig?.showBackgroundTasks !== false && (...)}`
2. Token Usage section (lines 122-140): Combined with existing `tokenUsage &&` check: `{stripConfig?.showTokenUsage !== false && tokenUsage && (...)}`
3. Git Worktrees: Reserved comment added, no section yet

### Key Pattern: `!== false` for Backward Compatibility
- Using `!== false` instead of `=== true` ensures that when `stripConfig` is undefined, ALL elements render
- This maintains backward compatibility for existing code that doesn't pass stripConfig prop
- When toggle is explicitly set to `false`, element is removed from DOM (not CSS hidden)

### Technical Notes
- Elements are completely removed from DOM when config toggle is false (not `display: none`)
- Conditional wrapping preserves existing JSX structure and className/event handlers
- No changes to CSS, data computation, or component logic
- Conditional doesn't affect interactive behavior (onClick, onKeyDown already defined on .strip-header)

## Task: Wire SessionSwimlane into Expanded ProjectStrip View (2026-03-01)

### Success Summary
- ✅ Modified `src/ui/components/ProjectStrip.tsx` to add `sessionSwimlane?: React.ReactNode` to children type
- ✅ Added new `.strip-section` div in expanded body between Activity and Plan sections (line 70-74)
- ✅ Added `.swimlane-slot` CSS with `width: 100%; min-height: 48px;`
- ✅ Updated `src/ui/App.tsx` to import SessionSwimlane and render in ProjectStripWithChildren children object
- ✅ Build passes with exit code 0
- ✅ Committed: `23fb7d1 feat(swimlane): wire SessionSwimlane into expanded ProjectStrip view`

### Implementation Details
- SessionSwimlane component receives `sessionTimeSeries` prop from `project.sessionTimeSeries`
- Swimlane NOT visible when collapsed (only renders in expanded body)
- Section placement: Activity sparkline → Session swimlane → Plan progress → Main Session → Background Tasks → Token Usage
- No loading states or conditional rendering — component is always instantiated when children are passed
- ProjectStrip's children pattern extended from 4 slots (miniSparkline, fullSparkline, compactPlan, fullPlan) to 5 with sessionSwimlane

### CSS Notes
- `.swimlane-slot` gets `min-height: 48px` matching collapsed strip height for consistency
- Container maintains `width: 100%` matching other slot patterns
- No special overflow handling needed — SessionSwimlane internally handles its SVG dimensions


## Task: Wire Sound Notification Triggers into App.tsx (2026-03-01)

### Success Summary
- ✅ Updated `src/ui/App.tsx` imports: added `useRef, useEffect` to React import and imported `useSoundNotifications`
- ✅ Added `useRef<DashboardMultiProjectPayload | null>` for `prevDataRef` to track previous polling snapshot
- ✅ Added `useRef<boolean>` for `firstLoadRef` to skip sounds on first data load
- ✅ Implemented `useEffect` that compares consecutive data snapshots and triggers sounds on status transitions
- ✅ Sound triggers on: session idle (active→idle), session error (any→unknown), plan complete (in progress→complete)
- ✅ No sounds when disconnected or on first load
- ✅ Build passes with exit code 0
- ✅ LSP diagnostics clean (no errors)
- ✅ Committed: `24a2888 feat(sound): wire sound notification triggers into data polling loop`

### Implementation Details

**Imports (line 1, 12)**:
- Updated line 1: `import { useMemo, useCallback, useRef, useEffect } from "react"`
- Added line 12: `import { useSoundNotifications } from "./hooks/useSoundNotifications"`

**Hook Setup (lines 44-46)**:
```typescript
const { playSessionIdle, playPlanComplete, playSessionError } = useSoundNotifications()
const prevDataRef = useRef<DashboardMultiProjectPayload | null>(null)
const firstLoadRef = useRef(true)
```

**Effect Logic (lines 53-94)**:
1. Guard: return if `!data || !connected` — skip when disconnected or loading
2. First-load guard: `firstLoadRef.current` prevents sounds on initial data arrival
3. Snapshot comparison loop: iterate through current projects, find previous version by sourceId
4. Status transition detection:
   - **Session idle**: check if `prevStatus` in `['busy', 'running_tool', 'thinking']` AND `currStatus === 'idle'` → `playSessionIdle()`
   - **Session error**: check if `prevStatus !== 'unknown'` AND `currStatus === 'unknown'` → `playSessionError()`
   - **Plan complete**: check if `prevPlanStatus === 'in progress'` AND `currPlanStatus === 'complete'` → `playPlanComplete()`
5. Store current snapshot: `prevDataRef.current = data` at end of effect
6. Dependencies: `[data, connected, playSessionIdle, playPlanComplete, playSessionError]`

### Key Patterns

**Snapshot Comparison Strategy**:
- `prevDataRef.current` holds previous data snapshot
- Each effect run compares `data` (current) against `prevDataRef.current` (previous)
- Uses `find()` to locate matching projects by `sourceId` (handles project list reordering)
- Only sounds on TRANSITIONS, never on every poll

**First-Load Guard**:
- `firstLoadRef.current` flags first successful data arrival
- First effect run: set flag to false, store snapshot, return (no sounds)
- Subsequent runs: flag is false, sounds can play
- Essential to avoid sound spam when dashboard first loads

**Status Transition Logic**:
- Active states explicitly listed: `['busy', 'running_tool', 'thinking']` (matches STATUS_PRIORITY helper)
- Session idle: requires TRANSITION from active→idle (not just "idle state")
- Session error: requires TRANSITION to unknown (could come from any active or idle state)
- Plan complete: requires TRANSITION from "in progress"→"complete"

### Integration with useSoundNotifications Hook
- Hook returns three play functions, each checks `config.enabled && config.on{Event}` before playing
- AudioContext created lazily on first sound (not on mount/hook init)
- Each play function is stable (wrapped in useCallback), safe as dependency

### Technical Notes
- `DashboardMultiProjectPayload | null` type correctly used for prevDataRef
- Removed duplicate `import { PlanProgress }` from original file (Vite auto-fixed)
- No changes to polling logic, data fetching, or component render
- Effect runs AFTER render, so sounds don't block UI

## Task: Implement Multi-Column DnD Grid Layout in App (2026-03-01)

### Success Summary
- ✅ Modified `src/ui/App.tsx` — integrated @dnd-kit DnD + useProjectOrder hook + column buttons
- ✅ Modified `src/ui/App.css` — converted .project-stack from flex to CSS grid with --grid-cols variable
- ✅ Modified `src/ui/components/DashboardHeader.tsx` — added columns/onSetColumns props and 1/2/3 column buttons
- ✅ LSP diagnostics clean (no errors) on all 3 files
- ✅ Build passes with exit code 0
- ✅ Committed: `7250d23 feat(layout): implement multi-column DnD grid layout in App`

### Implementation Details

**App.tsx Changes**:
- Imported DndContext, closestCenter, PointerSensor, useSensor, useSensors from @dnd-kit/core
- Imported SortableContext, verticalListSortingStrategy, useSortable from @dnd-kit/sortable
- Imported CSS from @dnd-kit/utilities (transitive dep, confirmed available)
- Created `SortableProjectStrip` wrapper component using `useSortable` hook
- PointerSensor with 8px activation distance to avoid conflicts with click-to-expand on strips
- `syncIds` called in useEffect when sortedProjects changes to reconcile orderedIds
- `displayProjects` useMemo: if orderedIds non-empty, reorder via Map lookup; else fallback to status sort
- `handleDragEnd`: finds oldIndex/newIndex in orderedIds, calls hook's `reorder(oldIndex, newIndex)`
- Passed columns + setColumns to DashboardHeader as optional props

**App.css Changes**:
- `.project-stack`: `display: flex; flex-direction: column` → `display: grid; grid-template-columns: repeat(var(--grid-cols, 1), 1fr)`
- Added `align-items: start` to prevent strips from stretching in multi-column layout
- Added `.project-strip { cursor: grab; }` and `:active { cursor: grabbing; }`
- Added `.header-btn--active` style with accent-primary background for selected column button

**DashboardHeader.tsx Changes**:
- Added optional `columns?: number` and `onSetColumns?: (n: number) => void` props
- Rendered 1col/2col/3col buttons in `.dashboard-header__actions` div, using `.header-btn--active` class for selected

### Key Patterns
- CSS custom property `--grid-cols` set via inline style with `as React.CSSProperties` type assertion
- DnD order takes priority when orderedIds is non-empty; status sort is the initial/default order
- syncIds on every data change ensures new projects appear at end of orderedIds without breaking existing order
- @dnd-kit/utilities CSS.Transform.toString() handles null transform gracefully (returns undefined)


## Task T19: Visual Polish — Wire SettingsPanel, AddProjectForm, stripConfig into App (2026-03-01)

### Success Summary
- ✅ Modified `src/ui/App.tsx` — wired useStripConfig, useSoundNotifications config, SettingsPanel, AddProjectForm
- ✅ Modified `src/ui/components/DashboardHeader.tsx` — added gear button with onSettingsOpen prop
- ✅ stripConfig passed through full chain: App → SortableProjectStrip → ProjectStripWithChildren → ProjectStrip
- ✅ soundConfig destructured from useSoundNotifications for SettingsPanel consumption
- ✅ AddProjectForm rendered inline in empty state (0 projects)
- ✅ SettingsPanel mounted with all 7 required props wired
- ✅ LSP diagnostics clean (no errors)
- ✅ Build passes with exit code 0
- ✅ Committed: `b8a25d0 style(polish): wire SettingsPanel, AddProjectForm, and stripConfig into App integration`

### Integration Gaps Closed
1. **useStripConfig** — imported + called in App, `config` and `toggle` destructured
2. **useSoundNotifications config** — changed from `{ playX }` to `{ config: soundConfig, setConfig: setSoundConfig, playX }`
3. **SettingsPanel** — mounted at end of `.page` div, receives all required props
4. **Gear button** — added in DashboardHeader before theme toggle with `onSettingsOpen` callback
5. **AddProjectForm** — rendered in empty state block (`projectCount === 0`)
6. **stripConfig passthrough** — added to SortableProjectStripProps, ProjectStripWithChildrenProps, threaded through JSX

### Key Pattern: Prop Threading for stripConfig
- `App.tsx` calls `useStripConfig()` → gets `config: stripConfig`
- Passes `stripConfig={stripConfig}` to `<SortableProjectStrip>`
- SortableProjectStrip passes it to `<ProjectStripWithChildren>`
- ProjectStripWithChildren passes it to `<ProjectStrip>`
- ProjectStrip uses `stripConfig?.showX !== false` pattern (backward compat)

### SettingsPanel Wiring Pattern
- `onTestSound={(event) => { if (event === 'idle') playSessionIdle(); ... }}`
- `open={settingsOpen}` / `onClose={() => setSettingsOpen(false)}`
- Gear button in header: `onSettingsOpen={() => setSettingsOpen(true)}`
## T20 Visual Polish Pass (CSS fix + DnD + consistency audit)
- **Critical Fix**: `.project-stack` in App.css was missing closing `}` — all subsequent rules (`.project-strip`, `.header-btn--active`) were accidentally nested inside it. Fixed by closing the brace after `align-items: start;`
- **DnD Visual Feedback**: Used `[style*="transform"]` CSS attribute selector to target @dnd-kit's inline transform during drag. This avoids needing to modify App.tsx to add data-attributes. Applied: `z-index: 5`, `opacity: 0.92`, `box-shadow: 0 4px 16px rgba(0,0,0,0.3)`, and teal border highlight on the inner `.project-strip`
- **Gradient Consistency**: Sparkline.tsx and SessionSwimlane.tsx share identical `GradientDefs` — same IDs, same stop colors, same opacity values. No fixes needed
- **Glow Consistency**: Sparkline.css glow colors match tokens exactly: teal=#00d4aa, red=#ff6b6b, green=#4ecdc4, sand=#ffa502, muted=#666680. All use `rx={1}` for bar corner radius
- **Edge Cases Verified**: Single project in grid doesn't stretch (no `grid-column: span` rules). Label and chevron in ProjectStrip are NOT wrapped in config conditionals — always visible even with all toggles off
- **Density Modes**: Gap overrides in App.css (comfortable=sp-2, dense=sp-1, ultra-dense=2px) work correctly with CSS grid — they target `.project-stack` gap directly
- **Commit**: `27ded01` — only `src/ui/App.css` modified

## F2 Resource Management & Import Hygiene (Task B)

### AbortController Pattern for Form Fetches
- Store `AbortController` in a `useRef` so it persists across renders
- Abort previous request on re-submission (`if (abortRef.current) abortRef.current.abort()`)
- Pass `signal: controller.signal` to `fetch()`
- Handle `AbortError` in catch: `if (err instanceof DOMException && err.name === "AbortError") return`
- Abort on unmount via `useEffect` cleanup

### AudioContext Cleanup
- `AudioContext` must be closed on unmount: `void audioCtxRef.current.close()`
- Guard with `if (audioCtxRef.current)` since it's lazily created
- Set ref to `null` after closing to prevent double-close

### Type-Only Import Audit Results
- Files that needed `import type`: `useProjectOrder.ts`, `useStripConfig.ts`
- Files already correct: `PlanProgress.tsx`, `ProjectStrip.tsx`, `SettingsPanel.tsx`, `useDashboardData.ts`, `useSoundNotifications.ts`
- Pattern: if a symbol from `../../types` is only used in type annotations/generics (e.g., `useState<Foo>`, function return type), use `import type`

## F2 Code Quality Fixes (T20)

- SVG gradient ID collisions: When multiple SVG components define `<linearGradient>` with identical `id` attributes and coexist in the DOM, only one definition wins. Fix by prefixing IDs per context (e.g., `mini-`, `full-`, `swim-`). All `url(#...)` fill references must be updated to match.
- CSS `fill: url(#id)` in `.sparkline-bar--*` classes is overridden by inline `fill` attributes in TSX. The CSS references are effectively dead but task scope excluded CSS changes.
- Shared types extracted to `src/ui/types.ts` — use this for any cross-component type deduplication.
- `useCallback` wrapping for stable references: setter functions from `useState` are already stable, but wrapping the arrow function that calls them in `useCallback` prevents child `useEffect` re-registrations.

## F2 Accessibility: Focus-Visible Indicators (2026-03-01)

### Changes Applied
- **base.css**: Added global `:focus-visible` rule (2px solid var(--accent-primary), 2px offset) and `:focus:not(:focus-visible)` reset to suppress mouse-click outlines
- **ProjectStrip.css**: `.strip-header:focus-visible` — keyboard focus ring on expandable header
- **SessionSwimlane.css**: `.swimlane-pin:focus-visible` — makes pin button visible (opacity: 1) AND shows focus ring. Added to the existing hover/pinned opacity rule as a third selector
- **App.css**: `.header-btn:focus-visible` — focus ring on header buttons (column selectors, gear, theme toggle)
- **SettingsPanel.css**: Added focus-visible for `.settings-panel__close`, `.settings-switch`, `.settings-sound-event__test`, `.settings-volume__slider`
- **AddProjectForm.css**: Added `.add-project-input:focus-visible` (with border+box-shadow+outline) and `.add-project-submit:focus-visible`

### Key Patterns
- `:focus-visible` fires on keyboard navigation only, not on mouse clicks — preserves existing visual behavior
- `:focus:not(:focus-visible) { outline: none; }` in base.css suppresses browser default outlines on mouse interactions
- Focus ring style: `outline: 2px solid var(--accent-primary); outline-offset: 2px;` — uses existing design token
- Pin button fix: added `.swimlane-pin:focus-visible` as third selector in the opacity rule, alongside `:hover` and `--pinned`
- No TypeScript changes needed — pure CSS accessibility fix
