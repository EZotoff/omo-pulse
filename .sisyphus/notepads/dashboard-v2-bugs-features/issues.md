# Issues — Dashboard V2 Bugs + Features

## [2026-03-01T14:06] Task: T20 — Full Integration QA

### Test Results Summary: 9/10 PASS, 1 CONDITIONAL

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | Dashboard loads | ✅ PASS | t20-01-dashboard-loads.png |
| 2 | Sparkline colors | ✅ PASS | t20-02-sparkline-colors.png |
| 3 | Background activity | ✅ PASS | (verified via DOM: 42 muted bars) |
| 4 | Expanded view | ✅ PASS | t20-04-expanded-view.png |
| 5 | Time bar styling | ✅ PASS | t20-05-time-bar-styling.png |
| 6 | Settings panel | ✅ PASS | t20-06-settings-panel.png |
| 7 | Add project form | ⚠️ CONDITIONAL | t20-07-add-project-form.png |
| 8 | Multi-column layout | ✅ PASS | t20-08-multi-column-{2,3}col.png |
| 9 | DnD reorder | ✅ PASS | t20-09-dnd-{during-drag,after-drop}.png |
| 10 | Session swimlane | ✅ PASS | t20-10-session-swimlane.png |

### Findings:

1. **Dev port mismatch**: Vite serves on port 5173 (default), not 4301 as stated in task context. No custom port configured in vite.config.ts.

2. **Scenario 7 (Add Project Form)**: The AddProjectForm component exists (src/ui/components/AddProjectForm.tsx) but is only rendered in the empty state (0 projects) inside `<div className="dashboard-empty">`, NOT inside the settings panel. With 8 active projects, the form is not accessible. The form has a project root path input (not URL), label input, and submit button.

3. **Sparkline agent tones**: Code defines 4 tones: teal (sisyphus), red (prometheus), green (atlas), sand (other). All current data uses atlas executor so only green bars visible. System is per-agent but testing with diverse agents needed to visually confirm multi-color.

4. **DnD mechanics**: PointerSensor with 8px activation confirmed working. Mouse down → move > 8px → drop triggers dnd-kit reorder. DOM order changes immediately.

5. **Glow effects**: Present via CSS `filter: drop-shadow(rgba(78,205,196,0.6) 0px 0px 4px)` but subtle at small bar sizes. 110 SVG linearGradient definitions used for fills.

## [2026-03-01] F4: Scope Fidelity Report

### Constraints

| # | Constraint | Result | Notes |
|---|-----------|--------|-------|
| 1 | No extra @dnd-kit packages | **PASS** | Only `@dnd-kit/core` (^6.3.1) and `@dnd-kit/sortable` (^10.0.0) in package.json. No `@dnd-kit/utilities`, `@dnd-kit/modifiers`, etc. |
| 2 | No state management library | **PASS** | No zustand, redux, jotai, recoil, mobx, valtio found in package.json or src/ imports. |
| 3 | No CSS-in-JS library | **PASS** | No styled-components, emotion, @emotion, stitches, vanilla-extract found in package.json or src/ imports. |
| 4 | No animation library | **PASS** | No framer-motion, react-spring, gsap, anime.js found in package.json or src/ imports. |
| 5 | No sound library | **PASS** | No howler, tone.js, pizzicato found. Sound implemented via Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`) in `useSoundNotifications.ts`. |
| 6 | No deep component hierarchies | **PASS** | `SessionSwimlane.tsx` is a single flat component (162 lines). No SwimlaneContainer/SwimlaneRow/SwimlaneBar sub-component nesting. Internal rendering via `GradientDefs` helper function (not exported component). |
| 7 | No bar interaction handlers | **PASS** | Sparkline.tsx: zero onClick/onMouseOver/onMouseEnter/tooltip on bars. SessionSwimlane.tsx: only onClick on pin button (line 122), no bar interaction handlers. No onMouseOver/onMouseEnter/tooltip found in either. |
| 8 | No framer-motion | **PASS** | Zero framer-motion imports anywhere in codebase. |
| 9 | No separate SVG defs file | **PASS** | No gradient/defs shared file exists. `GradientDefs` is local function in SessionSwimlane.tsx (line 36). Sparkline.tsx has inline `<defs>` blocks in both renderMini (line 293) and renderFull (line 403). |
| 10 | No generic Settings Service | **PASS** | No `SettingsService`, `ConfigService`, `StorageService` patterns found in src/. |
| 11 | State uses useState + localStorage | **PASS** | All three hooks verified: `useStripConfig.ts` — useState + localStorage directly (readPersistedConfig/persistConfig helpers, no abstraction). `useProjectOrder.ts` — useState + localStorage directly (readPersistedState/persistState helpers). `useSoundNotifications.ts` — useState + localStorage directly (readPersistedConfig/persistConfig helpers). |

### Scope Creep Check

**New files created by V2 (since commit 82319db):**
- `src/ui/hooks/useStripConfig.ts` ✓ Expected
- `src/ui/hooks/useProjectOrder.ts` ✓ Expected
- `src/ui/hooks/useSoundNotifications.ts` ✓ Expected
- `src/ui/components/AddProjectForm.tsx` ✓ Expected
- `src/ui/components/AddProjectForm.css` — CSS for AddProjectForm (reasonable companion)
- `src/ui/components/SessionSwimlane.tsx` ✓ Expected
- `src/ui/components/SessionSwimlane.css` — CSS for SessionSwimlane (reasonable companion)
- `src/ui/components/SettingsPanel.tsx` ✓ Expected
- `src/ui/components/SettingsPanel.css` — CSS for SettingsPanel (reasonable companion)

**Modified files (V2):**
- `src/ui/App.tsx` ✓ Expected
- `src/ui/App.css` ✓ Expected
- `src/ui/components/ProjectStrip.tsx` ✓ Expected
- `src/ui/components/ProjectStrip.css` — styling updates for ProjectStrip (reasonable)
- `src/ui/components/Sparkline.tsx` ✓ Expected
- `src/ui/components/Sparkline.css` — styling updates for Sparkline (reasonable)
- `src/ui/components/DashboardHeader.tsx` — modified (column selector, settings button)
- `src/server/api.ts` — modified (POST /api/sources for AddProjectForm)
- `src/server/multi-project.ts` — modified (per-session timeseries wiring)
- `src/ingest/sources-registry.ts` — modified (write functions restored)

**Unexpected additions:** None
**Test files created by V2:** None (existing test files from V1 commit 553cdb5)
**New directories:** None unexpected

### Overall Verdict: **ALL CONSTRAINTS PASS — SCOPE CLEAN**

No unauthorized dependencies, no forbidden patterns, no scope creep detected.
The 3 companion CSS files (AddProjectForm.css, SessionSwimlane.css, SettingsPanel.css) are standard co-located stylesheets for new components — not scope creep.
Server-side modifications (api.ts, multi-project.ts, sources-registry.ts) are necessary supporting changes for the AddProjectForm and SessionSwimlane features specified in the plan.

## [2026-03-01T12:00:00Z] F1: Plan Compliance Audit

T1: Install @dnd-kit Dependencies + New Type Definitions
STATUS: PASS
EVIDENCE: `package.json`: "@dnd-kit/core" and "@dnd-kit/sortable" exist; `src/types.ts`: `StripConfigState`, `SoundConfig`, `ProjectOrderState` defined.
NOTES: Dependencies and types implemented exactly as planned.

T2: Restore Sources Registry Write Functions + POST API Endpoint
STATUS: PASS
EVIDENCE: `src/ingest/sources-registry.ts`: `writeRegistry` and `addOrUpdateSource` exist; `src/server/api.ts`: `api.post("/sources", ...)` implemented.
NOTES: Endpoint handles POST correctly with error validation.

T3: Wire derivePerSessionTimeSeries in Multi-Project Service
STATUS: PASS
EVIDENCE: `src/server/multi-project.ts`: calls `derivePerSessionTimeSeries({ sqlitePath, projectRoot, nowMs })` inside the sqlite block.
NOTES: Fallback logic remains as intended.

T4: SVG Gradient/Glow Definitions + Bar Styling CSS Overhaul
STATUS: PASS
EVIDENCE: `src/ui/components/Sparkline.tsx`: `<defs>` contains 5 `<linearGradient>`s (teal, red, green, sand, muted).
NOTES: Fully compliant.

T5: Fix Mini Sparkline Per-Agent Coloring (Bug 1)
STATUS: PASS
EVIDENCE: `src/ui/components/Sparkline.tsx`: `renderMini` iterates buckets to determine `dominantTone = "teal" | "red" | "green"`.
NOTES: Correctly overriding standard teal mapping per-agent.

T6: Add Background Activity Muted Bars (Bug 2)
STATUS: PASS
EVIDENCE: `src/ui/components/Sparkline.tsx`: renders `<rect className="sparkline-bar sparkline-bar--muted" />` for `bgBarH > 0` before agents' rects.
NOTES: Applied in both renderMini and renderFull appropriately.

T7: Fix Expanded View Element Overlap and Positioning (Bug 3)
STATUS: PASS
EVIDENCE: `src/ui/components/ProjectStrip.css`: `.sparkline-slot--full` has `height: 80px`, `.strip-body` has `max-height: 900px`, `.strip-section` has `flex-shrink: 0`.
NOTES: Layout mismatches fixed as required.

T8: Apply Gradient/Glow/Rounded Bar Styling (Bug 4)
STATUS: PASS
EVIDENCE: `src/ui/components/Sparkline.tsx`: uses `fill="url(#sparkline-grad-{tone})"` and `rx={1}`, and renders `.sparkline-glow` after. `Sparkline.css`: uses `filter: drop-shadow(...)`.
NOTES: Visuals match the referenced implementation.

T9: useStripConfig Hook + localStorage Persistence
STATUS: PASS
EVIDENCE: `src/ui/hooks/useStripConfig.ts`: implements `useState` initialized from `localStorage.getItem("dashboard-strip-config")`, returns `toggle` and `reset`.
NOTES: None.

T10: useProjectOrder Hook + localStorage Persistence
STATUS: PASS
EVIDENCE: `src/ui/hooks/useProjectOrder.ts`: implements `reorder` with array splice, `syncIds`, and saves to `"dashboard-project-order"`.
NOTES: None.

T11: useSoundNotifications Hook (Web Audio API)
STATUS: PASS
EVIDENCE: `src/ui/hooks/useSoundNotifications.ts`: lazily initializes `new AudioContext()`, implements `playSessionIdle`, `playPlanComplete`, and `playSessionError`.
NOTES: No external audio libraries found. Web Audio API used directly.

T12: SessionSwimlane Component
STATUS: PASS
EVIDENCE: `src/ui/components/SessionSwimlane.tsx` and `.css` exist, renders session rows mapped to time series data and maintains `pinned` state.
NOTES: Flat hierarchy matches specifications.

T13: AddProjectForm Component
STATUS: PASS
EVIDENCE: `src/ui/components/AddProjectForm.tsx`: renders form, POSTs to `/api/sources`.
NOTES: Handles validation and response messaging correctly.

T14: SettingsPanel Component
STATUS: PASS
EVIDENCE: `src/ui/components/SettingsPanel.tsx`: renders toggles mapped to `StripConfigState` and sound settings mapped to `SoundConfig`.
NOTES: Includes functional test buttons and volume slider.

T15: DnD Multi-Column Grid Layout in App.tsx
STATUS: PASS
EVIDENCE: `src/ui/App.tsx`: `.project-stack` wrapped in `<DndContext>` and `<SortableContext>`. `App.css`: `.project-stack` uses `display: grid`.
NOTES: Successfully integrates DndKit hooks.

T16: Wire Config Toggles into ProjectStrip
STATUS: PASS
EVIDENCE: `src/ui/components/ProjectStrip.tsx`: conditional rendering wrapping UI sections with `stripConfig?.showX !== false`.
NOTES: Successfully wired with backward compatibility.

T17: Wire SessionSwimlane into Expanded ProjectStrip
STATUS: PASS
EVIDENCE: `src/ui/components/ProjectStrip.tsx`: adds `<div className="swimlane-slot">{children?.sessionSwimlane}</div>`. App.tsx passes the prop.
NOTES: Placed appropriately in the expanded view layout.

T18: Wire Sound Notification Triggers into Polling Loop
STATUS: PASS
EVIDENCE: `src/ui/App.tsx`: polls data and diffs `mainSession.status` and `planProgress.status` against `prevProject`, triggering `playSessionIdle()`, etc.
NOTES: Correctly handles firstLoad guard to avoid initial spam.

T19: Visual Polish Pass — Consistency, Density Modes, Edge Cases
STATUS: PASS
EVIDENCE: `src/ui/App.css` handles `[style*="transform"]` for DnD visual feedback; `App.tsx` has `cursor: grab` indicators; `AddProjectForm.css` handles `:focus`.
NOTES: Minor styling adjustments correctly implemented.

## [2026-03-01] F2: Code Quality Review

### Critical Issues (must fix)

1. **Duplicate SVG gradient IDs across components** — `Sparkline.tsx` defines identical `<defs>` blocks in both `renderMini()` and `renderFull()` (IDs: `sparkline-grad-teal`, `-red`, `-green`, `-sand`, `-muted`). Additionally, `SessionSwimlane.tsx` has its own `GradientDefs` component defining the same IDs. When all three are in the DOM simultaneously (collapsed strip + expanded strip + swimlane), there are 3 copies of each gradient ID. This is invalid HTML — `id` attributes must be unique. Browsers typically use the first match, so it works accidentally, but if mini sparkline is removed from DOM, gradient references in full sparkline could break.
   - Files: `src/ui/components/Sparkline.tsx` (lines 293-313, 403-423), `src/ui/components/SessionSwimlane.tsx` (lines 36-61)
   - Fix: Extract shared gradient defs to a single component or use unique prefixed IDs per instance.

2. **`sessionTimeSeries` prop accepted but never used in Sparkline** — `SparklineProps` interface declares `sessionTimeSeries?: SessionTimeSeriesPayload` (line 29) but `SparklineInner` destructures only `mode, timeSeries, width, height, className` and ignores it. Dead prop — callers pass it unnecessarily from App.tsx (lines 287, 293).
   - File: `src/ui/components/Sparkline.tsx` line 197-203
   - Fix: Remove from SparklineProps and stop passing it from App.tsx.

### Warnings (should fix)

3. **`onClose` inline arrow causes Escape key effect churn** — `SettingsPanel` receives `onClose={() => setSettingsOpen(false)}` (App.tsx line 229). This creates a new function reference every render. Inside SettingsPanel, the Escape key `useEffect` depends on `[open, onClose]` (line 65), so the keydown listener is torn down and re-registered on every App render cycle.
   - Fix: Wrap `onClose` handler in `useCallback` in App.tsx: `const handleSettingsClose = useCallback(() => setSettingsOpen(false), [])`.

4. **No AbortController on AddProjectForm fetch** — The `handleSubmit` fetch (line 48) has no abort mechanism. If the component unmounts during the request, `setLoading(false)`, `showStatus()`, etc. attempt state updates on an unmounted component. React 18 doesn't warn for this, but it's a best practice issue and potential future bug.
   - File: `src/ui/components/AddProjectForm.tsx` lines 47-67
   - Fix: Add AbortController with cleanup in the callback or switch to useEffect-based fetching.

5. **AudioContext never closed in useSoundNotifications** — `audioCtxRef.current` is lazily created (line 66) but never `close()`'d. Web Audio spec recommends closing contexts when no longer needed. This is a minor resource leak — each page load retains the AudioContext until GC.
   - File: `src/ui/hooks/useSoundNotifications.ts`
   - Fix: Add cleanup effect: `useEffect(() => () => { audioCtxRef.current?.close() }, [])`.

6. **No error handling for `new AudioContext()`** — Constructor can throw in restricted environments (some mobile browsers, iframe sandboxing, or when system audio is unavailable). Currently would crash the callback.
   - File: `src/ui/hooks/useSoundNotifications.ts` line 66
   - Fix: Wrap in try-catch, return null on failure.

7. **Non-type imports for type-only symbols** — `useStripConfig.ts` line 2: `import { StripConfigState }` and `useProjectOrder.ts` line 2: `import { ProjectOrderState }` should use `import type { ... }` to avoid runtime module evaluation for type-only imports.
   - Fix: Change to `import type { StripConfigState }` and `import type { ProjectOrderState }`.

8. **Keyboard accessibility: no `:focus-visible` on interactive elements** — Several interactive elements lack visible focus indicators:
   - `.strip-header` (has `tabIndex={0}` but no focus style) — `ProjectStrip.css`
   - `.header-btn` — `App.css`
   - `.add-project-submit` — `AddProjectForm.css`
   - `.swimlane-pin` — `SessionSwimlane.css`
   - Fix: Add `:focus-visible` rules with outline or box-shadow indicators.

9. **Pin button invisible to keyboard users** — `.swimlane-pin` has `opacity: 0` by default, only shown on `.swimlane-row:hover`. Keyboard-focused pin buttons are invisible since there's no `:focus-visible` or `:focus-within` rule on the row.
   - File: `SessionSwimlane.css`
   - Fix: Add `.swimlane-pin:focus-visible { opacity: 1; }` and `.swimlane-row:focus-within .swimlane-pin { opacity: 1; }`.

10. **Status message persists in DOM after fade** — AddProjectForm's status message fades to `opacity: 0` via CSS class but is never removed from DOM (`statusMessage` state is never reset to `""`). Screen readers may still announce invisible content via `role="status"`.
    - File: `src/ui/components/AddProjectForm.tsx` lines 33, 99-106
    - Fix: Add a second timeout to clear `statusMessage` after the fade completes.

11. **Magic `max-height: 900px` for strip expansion** — ProjectStrip's expanded body uses `max-height: 900px` for CSS transition. Projects with many background tasks could exceed this, causing content clipping. The transition timing is also based on this fixed value, making short content animate slowly.
    - File: `ProjectStrip.css` line 122
    - Fix: Consider using a JS-calculated max-height or `grid-template-rows: 0fr → 1fr` approach.

12. **`useProjectOrder.syncIds` has O(n*m) complexity** — Uses `Array.includes()` for both filter operations (lines 71, 73). For large project lists, this is quadratic.
    - File: `src/ui/hooks/useProjectOrder.ts` lines 71-74
    - Fix: Use `Set` for lookup: `const currentSet = new Set(currentIds)`.

### Minor (nice to fix)

13. **Duplicate `AgentTone` type** — Defined independently in both `Sparkline.tsx` (line 11) and `SessionSwimlane.tsx` (line 7) as `"teal" | "red" | "green" | "sand"`. Should be extracted to shared types.

14. **`sumValues` in SessionSwimlane lacks NaN/undefined safety** — Unlike Sparkline's `toSafe()` helper, `sumValues` directly sums array values without checking for `NaN`/`undefined`. If data contains invalid values, the sum becomes `NaN` and no bars render.
    - File: `src/ui/components/SessionSwimlane.tsx` lines 20-24

15. **`formatTokenCount` not exported** — `formatRelativeTime` is exported (reusable/testable) but `formatTokenCount` in the same file is not. Minor inconsistency.
    - File: `src/ui/components/ProjectStrip.tsx` line 23

16. **No responsive breakpoints** — Zero `@media` queries across all CSS files. The column selector provides manual layout control, but there's no automatic responsive behavior for mobile/tablet viewports. The 320px settings panel has `max-width: 90vw` (good), but other components don't adapt.

17. **Magic number in `max-height: calc(100vh - 96px)`** — Hardcoded pixel value for project-stack height. If header height changes, this calculation breaks silently.
    - File: `src/ui/App.css` line 115

18. **Initial localStorage write on mount** — Both `useStripConfig` and `useProjectOrder` persist config via `useEffect([config])` which fires on mount, writing the just-read value back to localStorage. Harmless but wasteful.

19. **`[style*="transform"]` CSS selector** — Used for DnD drag feedback (App.css line 130). Fragile — any inline `transform` (not just DnD) would match. Documented as inherited wisdom, but worth noting.

20. **Type assertion without full validation in useProjectOrder** — `parsed as ProjectOrderState` (line 20) after checking `orderedIds` is an array and `columns` is a number. Doesn't verify array elements are strings. Corrupted localStorage could inject non-string values.
    - File: `src/ui/hooks/useProjectOrder.ts` line 20

21. **Catch blocks lose error details** — AddProjectForm catch block (line 63) and hook catch blocks don't capture the error object. Error details are lost, making debugging harder in production.

22. **Gradient defs duplication between Sparkline and SessionSwimlane** — `GradientDefs` component in SessionSwimlane.tsx duplicates Sparkline's gradients. Should share a single gradient definition component.

### Anti-Pattern Scan Results
- `as any`: 0 in V2 UI files (1 in `ingest/background-tasks.ts` comment — not V2)
- `@ts-ignore` / `@ts-expect-error`: 0
- `TODO` / `FIXME` / `HACK` / `XXX`: 0
- `console.log`: 0 in V2 UI files (2 in server files — not V2)
- Empty catch blocks: 0
- `eslint-disable`: 0

### LSP Diagnostics
All 9 key files: **0 errors, 0 warnings** ✓

### Summary
- **Files reviewed**: 15 (9 TSX/TS + 6 CSS)
- **Critical**: 2 (duplicate SVG gradient IDs, dead prop)
- **Warnings**: 10 (effect churn, missing abort, AudioContext leak, accessibility gaps, type imports)
- **Minor**: 10 (DRY violations, missing safety checks, no responsive breakpoints, magic numbers)
- **Anti-patterns found**: 0 in V2 UI code
- **TypeScript errors**: 0

## [2026-03-01T14:20] F3: Manual QA Results — Playwright Browser Testing

**URL**: http://localhost:4301
**Console**: Clean (0 errors, 0 warnings)
**Evidence**: `.sisyphus/evidence/f3-*.png`

### Summary

| # | Scenario | Status | Evidence | Notes |
|---|----------|--------|----------|-------|
| 1 | Dashboard loads | ✅ PASS | f3-1-dashboard-loads.png | 8 project strips visible, header with title + count |
| 2 | Settings panel | ✅ PASS | f3-2-settings-panel.png | Gear click → panel slides out with Display Options + Sound Notifications |
| 3 | Config toggles | ✅ PASS | f3-3-config-toggles.png | Toggle Status Dot off → 0 dots; toggle on → 8 dots. Elements hide/show correctly |
| 4 | Add project form | ✅ PASS (conditional) | N/A | Form only renders in empty state (0 projects). With 8 projects, correctly hidden. Code verified: form has path input, label input, submit button |
| 5 | Multi-column layout | ✅ PASS | f3-5a-2col-layout.png, f3-5b-3col-layout.png | --grid-cols correctly set to 1/2/3. Visual layout matches |
| 6 | Expanded sparkline | ✅ PASS | f3-6-expanded-sparkline.png | Full-width sparkline with green (Atlas) + muted (background) bars. 161 total bars |
| 7 | Session swimlane | ✅ PASS | f3-7-session-swimlane.png | Swimlane rows visible with per-session labels and activity bars |
| 8 | DnD reorder | ⚠️ INCONCLUSIVE | f3-8-dnd-reorder.png | DnD infrastructure verified: dnd-kit attrs present, SortableContext wrapping 8 strips, PointerSensor 8px distance. playwright-cli `drag` command had parameter parsing issues preventing actual drag simulation |
| 9 | localStorage persistence | ✅ PASS | f3-9-localstorage-persist.png | Set 2col → reload → still 2col. localStorage key `dashboard-project-order` has `columns:2` |
| 10 | Per-agent colors | ✅ PASS | f3-10-per-agent-colors.png | DOM evidence: swimlane uses teal + sand fills; sparkline uses green + muted. Not all bars same color |

### Overall: 9/10 PASS, 1 INCONCLUSIVE (DnD drag simulation limitation)

### Issues Found
- **[Low] DnD not testable via playwright-cli**: The `drag` command has parameter parsing issues (`startElement/endElement` expected but not received). DnD code review confirms correct implementation.
- **[Info] Mini sparklines show only muted bars**: With current data state, mini sparklines (last 30 buckets) only have background-total data showing as muted gray. Full sparklines correctly show per-agent colors.
- **[Info] AddProjectForm only visible when 0 projects**: By design, the form shows in the empty dashboard state. Not accessible when projects exist (no add button in header/settings).

