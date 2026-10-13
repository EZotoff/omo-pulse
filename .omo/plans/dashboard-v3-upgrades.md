# Dashboard V3 Upgrades — 10 Feature Plan

## TL;DR

> **Quick Summary**: Implement 10 quality-of-life upgrades to the ez-omo-dash monitoring dashboard, including sound redesign, status dot fixes/enhancements, timestamp correction, project visibility toggles, drag-to-resize columns and pane heights, zoom controls, and settings panel reorganization.
> 
> **Deliverables**:
> - Redesigned sound notifications (sine-only, ADSR, musical frequencies)
> - Fixed stale project detection + enhanced status dot/border visibility
> - Corrected timestamps showing real activity time
> - Per-project visibility toggle in Settings
> - Drag-to-resize column widths with per-layout persistence
> - Drag-to-resize pane max-heights with release button
> - Dashboard-level zoom in/out via CSS custom properties
> - Settings panel reorganized into Collapsed View / Full View sections
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves (7 + 2 + 1 integration + 4 verification)
> **Critical Path**: Task 2 → Task 8 → Task 10 → F1-F4

---

## Context

### Original Request
User requested 10 specific dashboard upgrades covering sound, visuals, data accuracy, layout, and settings.

### Interview Summary
**Key Discussions**:
- Sound redesign: Port oh-my-opencode-dashboard patterns — all sine, musical freqs (C5/E5/G5), ADSR envelope, gain 0.06
- Status dot bug: `mainSession.status` doesn't detect staleness — need client-side derivation from `mainSession.lastUpdated`
- Status dot visibility: 4×4px too small, pulsing border + glow for attention states (idle, error)
- Timestamp: `lastUpdatedMs` = `Date.now()` per poll. Fix: use `mainSession.lastUpdated` (real activity ISO)
- Project visibility: Settings panel toggle, hidden = visually hidden only (still polled + notified)
- Column resize: Drag handles between grid columns, per-layout width persistence + reset button
- Pane height: Per-strip max-height with drag handle, overflow-y: auto when constrained
- Release button: TOP of pane (not bottom) to prevent unreachable button bug
- Zoom: CSS custom property multiplier (NOT transform:scale)
- Settings grouping: Display Options split into "Collapsed View" and "Full View"

**Research Findings**:
- Current sounds use mixed waveforms (sine/triangle/sawtooth), gain=(vol/100)*0.3. Reference uses only sine with ADSR and gain=0.06
- Grid layout: `.project-stack` with `grid-template-columns: repeat(var(--grid-cols, 1), 1fr)` — ready for variable widths
- @dnd-kit uses PointerSensor with 8px threshold — resize handles need separate event handling
- Strip expanded max-height: 900px hardcoded in CSS. Collapsed: 40px
- All hooks follow localStorage persistence pattern (read/persist/useState/useEffect)

### Metis Review
**Identified Gaps** (addressed):
- Stale threshold not defined → Default: 5 minutes (configurable via constant)
- Status dot target size not specified → Default: 8px (2× current)
- Zoom range/step not specified → Default: 50%-200%, 10% steps
- Zoom control placement not specified → DashboardHeader actions area
- Settings categorization undefined → Inferred from display context (collapsed header vs expanded body)
- `mainSession.lastUpdated` null handling → Show "—" (matches existing DashboardHeader pattern)
- `prefers-reduced-motion` not addressed → Include as guardrail for animations
- New project default visibility → Default: visible
- All projects hidden state → Show "All projects hidden" message
- Column resize min/max not defined → Min: 20%, Max: 80% per column

---

## Work Objectives

### Core Objective
Deliver 10 targeted dashboard improvements that fix data accuracy bugs (stale detection, timestamps), enhance visual feedback (status dot, border, sounds), and add layout control features (resize, zoom, visibility).

### Concrete Deliverables
- `src/ui/hooks/useSoundNotifications.ts` — Rewritten with sine-only ADSR sounds + question sound
- `src/ui/hooks/useProjectVisibility.ts` — New hook for project visibility state
- `src/ui/hooks/useColumnResize.ts` — New hook for per-layout column widths
- `src/ui/hooks/useProjectPaneHeights.ts` — New hook for per-strip max-height
- `src/ui/components/ProjectStrip.tsx` — Updated for stale detection, timestamp fix, border enhancement, height resize, release button
- `src/ui/components/ProjectStrip.css` — Updated for status dot sizing, border animations, height handles
- `src/ui/components/SettingsPanel.tsx` — Updated with visibility toggles + settings grouping
- `src/ui/components/DashboardHeader.tsx` — Updated with zoom controls + column width reset
- `src/ui/App.tsx` — Updated with visibility filtering, zoom/resize integration, question sound trigger
- `src/ui/App.css` — Updated for column resize handles, zoom CSS vars
- `src/styles/tokens.css` — Updated with zoom CSS custom property
- `src/types.ts` — Updated with new type definitions

### Definition of Done
- [ ] All 10 features functional and verified via Playwright
- [ ] No TypeScript errors (`bunx tsc --noEmit` passes)
- [ ] Build succeeds (`bun run build`)
- [ ] No regressions in existing functionality
- [ ] All evidence files present in `.sisyphus/evidence/`

### Must Have
- All 4 sound types (waiting, all, attention, question) using sine-only + ADSR
- Client-side stale detection with visual indicator
- Pulsing border + glow for attention states (idle, error, stale)
- Collapsed timestamp shows real activity time, not poll time
- Per-project visibility toggle (hidden projects still polled + notified)
- Drag-to-resize column widths with per-layout persistence
- Drag-to-resize pane max-heights with overflow scroll
- Release max-height button at TOP of pane
- Zoom via CSS custom properties (font-size, spacing multiplier)
- Settings "Display Options" split into "Collapsed View" and "Full View"

### Must NOT Have (Guardrails)
- **Sound**: No new sound types beyond the 4 mappings. No configurable frequencies. No preview/playback UI changes. Hardcode ADSR values from reference.
- **Status dot**: No new status colors. No server-side changes. Derive staleness CLIENT-SIDE only.
- **Border**: No user-configurable animation timing. Must respect `prefers-reduced-motion`. Active states (busy/thinking/tool) stay subtle.
- **Timestamp**: No relative-time-ago display changes in expanded view. No tooltip additions.
- **Visibility**: No bulk "hide all"/"show all" buttons. No keyboard shortcuts for visibility. Hidden projects MUST still poll and fire notifications.
- **Column resize**: No snap-to-grid. No auto-fit. No column width presets. Must NOT break @dnd-kit project reordering.
- **Pane height**: No auto-collapse on drag-to-minimum. No minimize button.
- **Release button**: MUST be at TOP of pane. Never at bottom.
- **Zoom**: No transform:scale. No per-project zoom. No zoom animation transitions.
- **Settings**: No new settings added. No collapsible sections. Only reorganize existing Display Options.
- **General**: No `as any`, no `@ts-ignore`, no empty catch blocks, no console.log in production. No over-abstraction. No excessive comments.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: NO — User explicitly chose no unit tests
- **Framework**: bun test (available but not used for this plan)

### QA Policy
Every task MUST include agent-executed QA scenarios using Playwright.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **Sound**: Verify via DOM inspection (oscillator creation, AudioContext state)
- **Persistence**: Verify localStorage values via page.evaluate()

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 7 independent tasks):
├── Task 1: Sound notifications redesign [unspecified-high]
├── Task 2: Client-side stale detection [quick]
├── Task 3: Timestamp fix — activity time in collapsed [quick]
├── Task 4: Per-project visibility toggle [unspecified-high]
├── Task 5: Dashboard zoom controls [quick]
├── Task 6: Draggable column width resize [deep]
└── Task 7: Draggable pane max-height + release button [deep]

Wave 2 (After Wave 1 — 2 dependent tasks):
├── Task 8: Enhanced status indicators — border + dot (depends: 2) [visual-engineering]
└── Task 9: Settings panel reorganization (depends: 4) [quick]

Wave 3 (After Wave 2 — integration verification):
└── Task 10: Integration build & TypeScript verification (depends: 1-9) [deep + playwright]

Wave FINAL (After ALL tasks — 4 parallel verification):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high + playwright]
└── F4: Scope fidelity check [deep]

Critical Path: Task 2 → Task 8 → Task 10 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 1)

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 (Sound redesign) | — | — | 1 |
| 2 (Stale detection) | — | 8 | 1 |
| 3 (Timestamp fix) | — | — | 1 |
| 4 (Visibility toggle) | — | 9 | 1 |
| 5 (Zoom controls) | — | — | 1 |
| 6 (Column resize) | — | — | 1 |
| 7 (Pane heights + release) | — | — | 1 |
| 8 (Status indicators) | 2 | 10 | 2 |
| 9 (Settings grouping) | 4 | 10 | 2 |
| 10 (Integration verify) | 1-9 | F1-F4 | 3 |
| F1-F4 | 10 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **7 tasks** — T1 → `unspecified-high`, T2 → `quick`, T3 → `quick`, T4 → `unspecified-high`, T5 → `visual-engineering`, T6 → `deep`, T7 → `deep`
- **Wave 2**: **2 tasks** — T8 → `visual-engineering`, T9 → `quick`
- **Wave 3**: **1 task** — T10 → `deep` + `playwright` skill
- **Wave FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation tasks below. EVERY task has: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Sound Notifications Redesign

  **What to do**:
  - Rewrite all 3 existing sound functions in `useSoundNotifications.ts` to use sine-only waveforms with ADSR envelope
  - Replace `playSessionIdle` (currently 300Hz sine, 200ms) with **waiting** pattern: 784Hz→659Hz descending, sine, ADSR (attack: 0.01s, release: 0.08s), ~70-100ms per tone
  - Replace `playPlanComplete` (currently 400Hz→600Hz triangle) with **all** pattern: 523Hz→659Hz→784Hz (C5→E5→G5) ascending sequence, sine, ADSR, ~100ms per tone with 30ms gaps
  - Replace `playSessionError` (currently 500Hz sawtooth, two pulses) with **attention** pattern: sine, urgent feel, ADSR, short tones
  - Add NEW `playQuestion` function: 988Hz→740Hz→880Hz (B5→F#5→A5) 3-tone sequence, sine, ADSR, for user-input-needed events
  - Change gain from `(cfg.volume / 100) * 0.3` to `(cfg.volume / 100) * 0.06` (matches reference's soft gain)
  - Add ADSR envelope to all tones: `gainNode.gain.setValueAtTime(0, now); gainNode.gain.linearRampToValueAtTime(gain, now + 0.01); gainNode.gain.linearRampToValueAtTime(gain * 0.7, now + dur/4); gainNode.gain.linearRampToValueAtTime(0, now + dur)`
  - Update `SoundConfig` type in `src/types.ts` to add `onQuestion: boolean` field
  - Update `DEFAULT_CONFIG` to include `onQuestion: true`
  - Update `readPersistedConfig` to handle `onQuestion` field
  - Add `playQuestion` to the hook's return value
  - Update `SOUND_EVENTS` array in `src/ui/components/SettingsPanel.tsx` to include question event with Test button
  - Update sound transition logic in `src/ui/App.tsx` to detect question/needs-input state and trigger `playQuestion` (when mainSession status indicates user input needed, or a background task has status containing 'question'/'waiting')

  **Must NOT do**:
  - Do not change the sound config UI structure (toggle layout, volume slider)
  - Do not add configurable frequency controls
  - Do not add sound preview/playback beyond existing Test buttons
  - Do not use any waveform other than sine
  - Do not change localStorage key or config persistence pattern

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Audio API work with precise frequency/envelope calculations. Not visual, not trivial.
  - **Skills**: []
    - No special skills needed — pure TypeScript/Web Audio API work
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed during implementation (QA scenarios use it but agent will have it for verification)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6, 7)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/ui/hooks/useSoundNotifications.ts` — ENTIRE FILE is the rewrite target. Study the AudioContext pattern (lazy creation line 76, configRef pattern lines 52-57). Keep this structure, only change sound generation functions.
  - `src/ui/App.tsx:77-117` — Sound transition logic. This is where `playQuestion` trigger needs to be added alongside existing idle/error/complete triggers.

  **API/Type References** (contracts to implement against):
  - `src/types.ts:130-136` — `SoundConfig` type. Add `onQuestion: boolean` field here.
  - `src/types.ts:16` — `SessionStatus` type. Use for detecting question-worthy states.

  **External References**:
  - oh-my-opencode-dashboard reference patterns: waiting=784→659Hz, task=659→880Hz, question=988→740→880Hz, all=523→659→784Hz. All sine, gain 0.06, ADSR (attack: 0.01s or dur/4, release: 0.08s or dur/2), tones 70-140ms.

  **WHY Each Reference Matters**:
  - useSoundNotifications.ts: The ONLY file being rewritten. Must preserve hook structure (configRef, lazy AudioContext, persist pattern) while replacing sound generation.
  - App.tsx transitions: Shows exactly where/how sounds are triggered. `playQuestion` needs to follow the same prev/current comparison pattern.
  - types.ts SoundConfig: Adding onQuestion field ensures the new sound has a per-event toggle like all others.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sound generation uses sine-only with ADSR
    Tool: Playwright
    Preconditions: App loaded at http://localhost:5173, sound enabled in settings
    Steps:
      1. Open browser console, execute: `window.__audioCtx = new AudioContext()`
      2. Navigate to settings panel via `.header-btn[aria-label="Open settings"]`
      3. Click Test button for Session Idle: `.settings-sound-event:nth-child(1) .settings-sound-event__test`
      4. Click Test button for Plan Complete: `.settings-sound-event:nth-child(2) .settings-sound-event__test`
      5. Click Test button for Session Error: `.settings-sound-event:nth-child(3) .settings-sound-event__test`
      6. Click Test button for Question: `.settings-sound-event:nth-child(4) .settings-sound-event__test`
      7. Verify all 4 test buttons exist and are clickable
      8. Screenshot the settings panel showing all 4 sound events
    Expected Result: All 4 Test buttons present and functional. No JavaScript errors in console.
    Failure Indicators: Missing 4th sound event row, console errors about AudioContext or oscillator
    Evidence: .sisyphus/evidence/task-1-sound-test-buttons.png

  Scenario: Sound config persists with question toggle
    Tool: Playwright
    Preconditions: App loaded, localStorage cleared
    Steps:
      1. Navigate to settings, toggle question sound off
      2. Reload page
      3. Check localStorage via page.evaluate: `JSON.parse(localStorage.getItem('dashboard-sound-config'))`
      4. Assert: result has `onQuestion: false` field
    Expected Result: localStorage contains all 5 sound event toggles including onQuestion
    Failure Indicators: Missing onQuestion field, localStorage parse error
    Evidence: .sisyphus/evidence/task-1-sound-config-persistence.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-sound-test-buttons.png — Screenshot of settings with 4 sound events
  - [ ] task-1-sound-config-persistence.txt — localStorage dump showing onQuestion field

  **Commit**: YES
  - Message: `feat(sound): redesign notifications with sine ADSR patterns`
  - Files: `src/ui/hooks/useSoundNotifications.ts`, `src/types.ts`, `src/ui/components/SettingsPanel.tsx`, `src/ui/App.tsx`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 2. Client-Side Stale Detection

  **What to do**:
  - Add stale detection logic that derives "stale" status from `mainSession.lastUpdated` (ISO string of real activity time)
  - Define `STALE_THRESHOLD_MS = 5 * 60 * 1000` (5 minutes) as a named constant in a shared location (top of ProjectStrip.tsx or a new constants file)
  - In `ProjectStrip.tsx`, compute `isStale` by comparing `new Date(mainSession.lastUpdated).getTime()` to `Date.now()`. If delta > threshold AND status is not an active state (busy/thinking/running_tool), mark as stale
  - Add `data-stale="true"` attribute to `.strip-status-dot` when stale
  - Add `data-stale="true"` attribute to `.project-strip` container when stale (for border styling in Task 8)
  - Add CSS for stale status dot: `.strip-status-dot[data-stale="true"]` — override color to `var(--status-unknown)` or a distinct stale color
  - Handle edge case: if `mainSession.lastUpdated` is empty/null/undefined, treat as stale
  - Handle edge case: if project has `status === 'unknown'`, don't double-apply stale (already has unknown styling)

  **Must NOT do**:
  - Do not modify server-side code (`src/server/multi-project.ts`)
  - Do not add new status types to SessionStatus union — stale is a derived client-side concern
  - Do not change status CSS variable colors
  - Do not make the stale threshold configurable via UI (hardcode constant)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small focused change — add a computation + data attributes + minimal CSS. 1-2 files.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for implementation phase

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6, 7)
  - **Blocks**: Task 8 (border visibility depends on stale data attributes)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:47-54` — `ProjectStripInner` function where `mainSession` is destructured. Add `isStale` derivation here.
  - `src/ui/components/ProjectStrip.tsx:54` — Status dot rendering: `<span className="strip-status-dot" data-status={mainSession.status}>`. Add `data-stale` attribute here.

  **API/Type References**:
  - `src/types.ts:82-108` — `ProjectSnapshot` type. `mainSession.lastUpdated` is a string (ISO format). `mainSession.status` is `SessionStatus`.
  - `src/types.ts:16` — `SessionStatus` = `"busy" | "idle" | "thinking" | "running_tool" | "unknown"`. Active states: busy, thinking, running_tool.

  **CSS References**:
  - `src/ui/components/ProjectStrip.css:38-50` — Current status dot styling with data-status selectors. Add `[data-stale="true"]` override after these rules.

  **WHY Each Reference Matters**:
  - ProjectStrip.tsx line 47-54: Exact location where stale computation must be inserted (after destructuring, before render)
  - ProjectStrip.tsx line 54: Exact element that needs the data-stale attribute added
  - types.ts: Confirms mainSession.lastUpdated is string type (needs Date parsing), and status values for active-state check

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stale project shows stale indicator
    Tool: Playwright
    Preconditions: App loaded at http://localhost:5173 with at least one project that has no recent activity (lastUpdated > 5 minutes ago)
    Steps:
      1. Navigate to dashboard
      2. Locate a project strip that hasn't been active recently
      3. Inspect the status dot element: `.strip-status-dot`
      4. Assert: element has attribute `data-stale="true"`
      5. Assert: `.project-strip` container also has `data-stale="true"`
      6. Verify computed color of the stale dot differs from active project dots
      7. Screenshot a stale project alongside an active project
    Expected Result: Stale projects have data-stale="true" on both dot and strip container. Visual color difference visible.
    Failure Indicators: data-stale attribute missing, stale project looks identical to active project
    Evidence: .sisyphus/evidence/task-2-stale-detection.png

  Scenario: Active projects are NOT marked stale
    Tool: Playwright
    Preconditions: App loaded with at least one actively running project (status busy/thinking/running_tool)
    Steps:
      1. Locate a project with status "busy" or "thinking"
      2. Assert: `.strip-status-dot` does NOT have `data-stale="true"`
      3. Assert: `.project-strip` does NOT have `data-stale="true"`
    Expected Result: Active projects never show stale indicator regardless of lastUpdated time
    Failure Indicators: Active project incorrectly marked as stale
    Evidence: .sisyphus/evidence/task-2-active-not-stale.png
  ```

  **Evidence to Capture:**
  - [ ] task-2-stale-detection.png — Stale vs active project comparison
  - [ ] task-2-active-not-stale.png — Active project without stale indicator

  **Commit**: YES
  - Message: `fix(status): add client-side stale detection`
  - Files: `src/ui/components/ProjectStrip.tsx`, `src/ui/components/ProjectStrip.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 3. Timestamp Fix — Show Real Activity Time in Collapsed View

  **What to do**:
  - In `ProjectStrip.tsx` line 59, change `{formatRelativeTime(lastUpdatedMs)}` to use `mainSession.lastUpdated` (ISO string from server) instead of `lastUpdatedMs` (poll timestamp from `Date.now()`)
  - Compute the activity timestamp: `const activityMs = mainSession.lastUpdated ? new Date(mainSession.lastUpdated).getTime() : null`
  - Display: if `activityMs` is valid, show `formatRelativeTime(activityMs)`. If null/invalid, show `"—"` (em dash, matching DashboardHeader pattern)
  - Keep `lastUpdatedMs` in the expanded view — it's the "last polled" time, which is valid info for the expanded pane. Add it to the expanded body's existing detail rows (e.g., "Last polled: {formatRelativeTime(lastUpdatedMs)}")
  - Ensure the `formatRelativeTime` function can handle the activity timestamp correctly (it already accepts ms timestamps, so just pass the parsed value)

  **Must NOT do**:
  - Do not change the relative-time-ago display format or thresholds
  - Do not add tooltips to timestamps
  - Do not change the expanded view's existing timestamp logic (only ADD the last-polled row)
  - Do not modify `lastUpdatedMs` computation in the server

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small surgical change — swap one data source in collapsed view, add one row in expanded. 1 file.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed during implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6, 7)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:59` — Current timestamp display: `{formatRelativeTime(lastUpdatedMs)}`. This is the exact line to change for collapsed view.
  - `src/ui/components/ProjectStrip.tsx:9-20` — `formatRelativeTime(ms)` function. Accepts ms timestamp, returns relative string. No changes needed, just pass the right input.
  - `src/ui/components/ProjectStrip.tsx:64-105` — Expanded body section. Add "Last polled" row here alongside existing detail rows.
  - `src/ui/components/DashboardHeader.tsx:31-40` — `formatUpdateTime(ms)` shows the pattern for handling null timestamps (returns "—").

  **API/Type References**:
  - `src/types.ts:82-108` — `ProjectSnapshot.mainSession.lastUpdated` is a string (ISO format). `ProjectSnapshot.lastUpdatedMs` is a number (Date.now() poll time).

  **WHY Each Reference Matters**:
  - Line 59: Exact single-line change target for collapsed timestamp
  - Lines 64-105: Where to add "Last polled" row in expanded view
  - DashboardHeader: Pattern for null-safe timestamp display with em dash

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Collapsed view shows real activity time
    Tool: Playwright
    Preconditions: App loaded at http://localhost:5173 with at least one connected project that has recent activity
    Steps:
      1. Navigate to dashboard
      2. Locate a collapsed project strip (not expanded)
      3. Read the timestamp text from `.strip-header .strip-last-updated` (or the time element in the collapsed header)
      4. Also read `mainSession.lastUpdated` from the page state via page.evaluate
      5. Compute expected relative time from lastUpdated ISO string
      6. Assert: displayed time roughly matches expected relative time (not "0s ago" or "1s ago" which would indicate poll time)
      7. Screenshot collapsed strip showing the time
    Expected Result: Timestamp shows time since last real activity (e.g., "3m ago"), not time since last poll (e.g., "1s ago")
    Failure Indicators: Timestamp always shows very recent times (0-5s) regardless of actual activity age
    Evidence: .sisyphus/evidence/task-3-collapsed-timestamp.png

  Scenario: Expanded view shows "Last polled" time
    Tool: Playwright
    Preconditions: App loaded with at least one project
    Steps:
      1. Click a project strip to expand it
      2. Look for a "Last polled" label in the expanded body
      3. Assert: "Last polled" row exists and shows a relative time
      4. Screenshot the expanded view showing both activity time (header) and last polled time (body)
    Expected Result: Expanded view includes "Last polled: Xs ago" alongside other details
    Failure Indicators: No "Last polled" row visible, or row shows incorrect data
    Evidence: .sisyphus/evidence/task-3-expanded-last-polled.png

  Scenario: Null lastUpdated shows em dash
    Tool: Playwright
    Preconditions: App loaded. If possible, test with a project that has null/empty mainSession.lastUpdated
    Steps:
      1. If no null-lastUpdated project exists, use page.evaluate to inject a mock project with lastUpdated: null
      2. Assert: timestamp display shows "—" (em dash) not "NaN" or "Invalid Date"
    Expected Result: Graceful fallback to "—" for missing timestamps
    Failure Indicators: "NaN", "Invalid Date", blank space, or crash
    Evidence: .sisyphus/evidence/task-3-null-timestamp.png
  ```

  **Evidence to Capture:**
  - [ ] task-3-collapsed-timestamp.png — Collapsed view showing real activity time
  - [ ] task-3-expanded-last-polled.png — Expanded view with "Last polled" row
  - [ ] task-3-null-timestamp.png — Graceful null handling

  **Commit**: YES
  - Message: `fix(timestamp): show real activity time in collapsed view`
  - Files: `src/ui/components/ProjectStrip.tsx`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 4. Per-Project Visibility Toggle

  **What to do**:
  - Create `src/ui/hooks/useProjectVisibility.ts` — new hook managing per-project visibility state
    - State shape: `Record<string, boolean>` mapping `sourceId` → `visible` (default: `true` for new projects)
    - Persist to `localStorage` key `"dashboard-project-visibility"`
    - Follow exact same pattern as `useProjectOrder.ts`: read from localStorage on mount, persist on change via useEffect
    - Export: `{ visibility, setVisibility, isVisible(sourceId): boolean, toggleVisibility(sourceId): void }`
  - Add `VisibilityConfig` type to `src/types.ts`: `Record<string, boolean>`
  - In `src/ui/App.tsx`:
    - Import and call `useProjectVisibility()` hook
    - Filter `displayProjects` array: `displayProjects.filter(p => isVisible(p.sourceId))` — applied AFTER DnD ordering
    - Pass visibility state + toggleVisibility to SettingsPanel
    - Important: hidden projects MUST still be included in the `prevSnapRef` for sound notifications. The filter is ONLY for rendering.
  - In `src/ui/components/SettingsPanel.tsx`:
    - Add new props: `projects: ProjectSnapshot[]`, `visibility: Record<string, boolean>`, `onToggleVisibility: (sourceId: string) => void`
    - Add "Project Visibility" section BEFORE Display Options section
    - Render each project as a toggle row: project label + on/off toggle switch
    - Show project status dot next to label for context
  - Handle edge case: if ALL projects hidden, show a "All projects hidden" message in the main grid area (not an empty space)

  **Must NOT do**:
  - Do not add bulk "hide all"/"show all" buttons
  - Do not add keyboard shortcuts for visibility
  - Do not stop polling hidden projects — they MUST still poll and trigger sound notifications
  - Do not remove hidden projects from DnD ordering state

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New hook creation, multi-file integration (hook + types + App + Settings). Not trivial.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Toggle UI is simple, follows existing SettingsPanel patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6, 7)
  - **Blocks**: Task 10 (Settings grouping depends on visibility section being present)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/hooks/useProjectOrder.ts` — CANONICAL hook pattern for this project: localStorage read, useState, useEffect persist, export object. Follow this EXACTLY for useProjectVisibility.
  - `src/ui/components/SettingsPanel.tsx:118-134` — Display Options section layout. Add "Project Visibility" section BEFORE this using same `<h3>` + toggle-list pattern.
  - `src/ui/components/SettingsPanel.tsx:19-28` — DISPLAY_TOGGLES array pattern. Visibility toggles are dynamic (per-project) not static, but the toggle UI pattern is the same.
  - `src/ui/App.tsx:133-139` — `displayProjects` memo. This is where visibility filtering inserts (after DnD ordering).
  - `src/ui/App.tsx:77-117` — Sound notification effect. This iterates ALL projects, NOT displayProjects. Hidden projects MUST still trigger sounds here.

  **API/Type References**:
  - `src/types.ts:82-108` — `ProjectSnapshot.sourceId` is the unique identifier to key visibility by.
  - `src/types.ts:82` — `ProjectSnapshot.label` for display in Settings toggle rows.

  **WHY Each Reference Matters**:
  - useProjectOrder.ts: Exact template to copy for hook structure (prevents reinventing patterns)
  - SettingsPanel lines 118-134: Insertion point for new section and UI pattern to follow
  - App.tsx line 133-139: Exact location where visibility filter must be added
  - App.tsx lines 77-117: CRITICAL — sound effect must NOT use the filtered list or hidden projects won't trigger sounds

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Toggle project visibility in Settings
    Tool: Playwright
    Preconditions: App loaded at http://localhost:5173 with 2+ projects
    Steps:
      1. Note the project count on dashboard
      2. Open settings panel via `.header-btn[aria-label="Open settings"]`
      3. Locate "Project Visibility" section
      4. Find the toggle for the first project
      5. Click the toggle to hide the project
      6. Close settings panel
      7. Assert: dashboard shows one fewer project strip
      8. Assert: hidden project's strip is NOT in the DOM / `.project-stack`
      9. Screenshot dashboard with one project hidden
    Expected Result: Hidden project disappears from grid. Other projects remain.
    Failure Indicators: Project still visible after toggle off, or all projects disappear
    Evidence: .sisyphus/evidence/task-4-visibility-toggle.png

  Scenario: Visibility persists after reload
    Tool: Playwright
    Preconditions: One project already hidden via settings
    Steps:
      1. Reload page
      2. Assert: previously hidden project is still hidden
      3. Check localStorage via page.evaluate: `JSON.parse(localStorage.getItem('dashboard-project-visibility'))`
      4. Assert: result contains the hidden project's sourceId with value `false`
    Expected Result: Visibility state survives page reload
    Failure Indicators: Hidden project reappears after reload, localStorage key missing
    Evidence: .sisyphus/evidence/task-4-visibility-persistence.txt

  Scenario: Hidden projects still trigger sound notifications
    Tool: Playwright
    Preconditions: App loaded, a project is hidden, sound enabled
    Steps:
      1. Hide a project in settings
      2. Use page.evaluate to verify the project is still in the polling data (check prevSnapRef or data state)
      3. Assert: the project's data is still being tracked for sound transitions
      4. Verify the sound effect's project loop includes ALL projects, not just visible ones
    Expected Result: Sound notification logic processes all projects regardless of visibility
    Failure Indicators: Hidden project excluded from sound transition checks
    Evidence: .sisyphus/evidence/task-4-hidden-still-sounds.txt

  Scenario: All projects hidden shows message
    Tool: Playwright
    Preconditions: App loaded with projects
    Steps:
      1. Open settings, hide ALL projects one by one
      2. Close settings
      3. Assert: main grid area shows "All projects hidden" message (not just empty space)
      4. Screenshot the empty state
    Expected Result: Helpful message displayed when all projects are hidden
    Failure Indicators: Blank/empty grid with no feedback
    Evidence: .sisyphus/evidence/task-4-all-hidden-message.png
  ```

  **Evidence to Capture:**
  - [ ] task-4-visibility-toggle.png — Dashboard with one project hidden
  - [ ] task-4-visibility-persistence.txt — localStorage dump
  - [ ] task-4-hidden-still-sounds.txt — Verification that hidden projects still trigger sounds
  - [ ] task-4-all-hidden-message.png — Empty state message

  **Commit**: YES
  - Message: `feat(visibility): add per-project visibility toggle`
  - Files: `src/ui/hooks/useProjectVisibility.ts`, `src/types.ts`, `src/ui/App.tsx`, `src/ui/components/SettingsPanel.tsx`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 5. Dashboard Zoom Controls

  **What to do**:
  - Add a `--zoom` CSS custom property to the `:root` in `tokens.css` with default value `1`
  - Add zoom in/out buttons to `DashboardHeader.tsx` in the `.dashboard-header__actions` div (line ~77)
    - Zoom in: increase by 0.1 (max 2.0)
    - Zoom out: decrease by 0.1 (min 0.5)
    - Reset button: return to 1.0
    - Display current zoom level as percentage label between buttons (e.g. "100%")
    - Use `−` (minus) and `+` symbols in buttons following the existing `.header-btn` style
  - Apply zoom via `transform: scale(var(--zoom))` and `transform-origin: top center` on `.container` in `App.css`
    - IMPORTANT: Also set `width: calc(100% / var(--zoom))` on `.container` to prevent horizontal overflow when zoomed in
  - Persist zoom level to `localStorage` key `"dashboard-zoom"` — read on mount, write on change
    - Direct inline useState + useEffect in `App.tsx` (no separate hook needed — it's 4 lines)
    - Pass `zoom`, `onZoomIn`, `onZoomOut`, `onZoomReset` to DashboardHeader
  - Add `zoom`, `onZoomIn`, `onZoomOut`, `onZoomReset` to `DashboardHeaderProps`

  **Must NOT do**:
  - Do not use `font-size` based zoom — use CSS `transform: scale()` only
  - Do not use a slider for zoom — buttons only
  - Do not create a separate hook file — inline in App.tsx
  - Do not add keyboard shortcuts for zoom

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small CSS + 2 component prop additions. Follows existing header-btn pattern exactly.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Zoom is a straightforward CSS transform, not a design challenge

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6, 7)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/components/DashboardHeader.tsx:84-94` — Column selector button pattern. Zoom buttons should use identical `.header-btn` class and sit next to column buttons.
  - `src/ui/App.css:115-127` — `.project-stack` grid and `.container` styles. Apply `transform: scale(var(--zoom))` on `.container`.
  - `src/ui/App.tsx:62-68` — Hook calls area. Add zoom state inline here.
  - `src/ui/App.tsx:164-199` — DashboardHeader render. Pass zoom props here.

  **API/Type References**:
  - `src/ui/components/DashboardHeader.tsx:5-14` — `DashboardHeaderProps`. Add `zoom`, `onZoomIn`, `onZoomOut`, `onZoomReset`.
  - `src/styles/tokens.css` — Add `--zoom: 1` to `:root`.

  **WHY Each Reference Matters**:
  - DashboardHeader lines 84-94: Exact UI pattern to replicate for zoom buttons
  - App.css container: Where transform must be applied (NOT on project-stack, to avoid breaking grid)
  - App.tsx hooks area: Inline zoom state goes here, following project's pattern of no unnecessary abstractions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Zoom in increases scale
    Tool: Playwright
    Preconditions: App loaded at http://localhost:5173
    Steps:
      1. Note initial zoom label shows "100%"
      2. Click the zoom in button ("+")
      3. Assert: zoom label now shows "110%"
      4. Assert: `.container` has CSS `transform: scale(1.1)` (via computed style)
      5. Click zoom in 4 more times
      6. Assert: zoom label shows "150%"
      7. Screenshot at 150% zoom
    Expected Result: Dashboard scales up smoothly, no horizontal scrollbar appears
    Failure Indicators: Horizontal overflow, layout breaks, text becomes unreadable
    Evidence: .sisyphus/evidence/task-5-zoom-in.png

  Scenario: Zoom out decreases scale
    Tool: Playwright
    Preconditions: App loaded at default zoom
    Steps:
      1. Click zoom out button ("−") 5 times
      2. Assert: zoom label shows "50%"
      3. Click zoom out once more
      4. Assert: zoom label STILL shows "50%" (minimum enforced)
      5. Screenshot at 50% zoom
    Expected Result: Dashboard scales down, minimum zoom enforced at 50%
    Failure Indicators: Zoom goes below 50%, or layout breaks at small scales
    Evidence: .sisyphus/evidence/task-5-zoom-out.png

  Scenario: Reset button returns to 100%
    Tool: Playwright
    Preconditions: App zoomed to 150%
    Steps:
      1. Click zoom reset button
      2. Assert: zoom label shows "100%"
      3. Assert: `.container` computed transform is `scale(1)` or `none`
    Expected Result: Zoom resets cleanly to 100%
    Failure Indicators: Zoom doesn't reset, visual artifacts remain
    Evidence: .sisyphus/evidence/task-5-zoom-reset.png

  Scenario: Zoom persists after reload
    Tool: Playwright
    Preconditions: App zoomed to 130%
    Steps:
      1. Reload page
      2. Assert: zoom label shows "130%"
      3. Assert: localStorage has key `dashboard-zoom` with value `1.3`
    Expected Result: Zoom level survives page reload
    Failure Indicators: Zoom resets to 100% on reload
    Evidence: .sisyphus/evidence/task-5-zoom-persistence.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-zoom-in.png — Dashboard at 150% zoom
  - [ ] task-5-zoom-out.png — Dashboard at 50% zoom
  - [ ] task-5-zoom-reset.png — Dashboard after zoom reset
  - [ ] task-5-zoom-persistence.txt — localStorage verification

  **Commit**: YES
  - Message: `feat(zoom): add dashboard zoom in/out/reset controls`
  - Files: `src/styles/tokens.css`, `src/ui/components/DashboardHeader.tsx`, `src/ui/App.tsx`, `src/ui/App.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 6. Draggable Column Width Resize

  **What to do**:
  - In multi-column layouts (2 or 3 columns), allow the user to drag column boundaries to resize the relative width of each column
  - Implementation approach: Replace `repeat(var(--grid-cols), 1fr)` with explicit `grid-template-columns` using `fr` values that can be adjusted
    - State shape: `number[]` — array of fractional widths (e.g. `[1, 1]` for equal 2-col, `[1, 1, 1]` for equal 3-col)
    - Default: all columns equal (`1fr` each)
    - When user drags a column divider, adjust the `fr` values proportionally
  - Create a `ColumnResizeHandle` component rendered between grid columns:
    - Thin vertical bar (4px wide, full height of `.project-stack`) with hover highlight
    - Mouse-down → track mouse movement → convert pixel delta to fr adjustment → update state
    - Cursor: `col-resize` on hover
    - Visual: `border-primary` color, `border-secondary` on hover
  - Approach for grid integration:
    - The `.project-stack` grid already handles item placement. To insert resize handles BETWEEN columns:
    - Use CSS `column-gap` space for the handle (increase gap to 12px in multi-col mode)
    - Position handles as absolutely-positioned overlays on the gap areas
    - Alternative: Render handles as explicit grid items with `grid-row: 1 / -1` spanning all rows, at column boundary positions
  - Persist column widths to `localStorage` key `"dashboard-column-widths"` keyed by column count (e.g. `{"2": [1.5, 0.5], "3": [1, 1, 1]}`)
  - Reset to equal widths when column count changes (unless persisted widths exist for that count)
  - In 1-column mode: no resize handles (single column always fills width)

  **Must NOT do**:
  - Do not add a separate resize library — implement with mouse events directly
  - Do not break the existing DnD functionality — resize handles must not conflict with drag-to-reorder
  - Do not add minimum column width less than 200px — prevent columns from becoming unusably small
  - Do not add resize for 1-column layout

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful mouse event handling, CSS grid manipulation, DnD conflict avoidance, and multi-column state management. Non-trivial interaction design.
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: The resize handle interaction needs careful UX (cursor states, visual feedback, smooth dragging). Design skill helps get the interaction feel right.
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed during implementation (QA is separate)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5, 7)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/App.css:115-127` — `.project-stack` grid definition with `grid-template-columns: repeat(var(--grid-cols, 1), 1fr)`. This line needs to change to support explicit fr values.
  - `src/ui/App.tsx:198` — `style={{ "--grid-cols": columns }}`. Change to pass explicit grid-template-columns string when custom widths are set.
  - `src/ui/App.tsx:145-162` — DnD sensors and handlers. Column resize must NOT conflict — use different event targets (resize handles vs strip items).
  - `src/ui/hooks/useProjectOrder.ts` — localStorage persistence pattern. Follow same read/write approach for column widths.

  **API/Type References**:
  - `src/types.ts:139-142` — `ProjectOrderState` already has `columns`. Extend or create sibling type for column widths.

  **External References**:
  - CSS Grid `grid-template-columns` accepts mixed `fr` units: `1.5fr 0.5fr` is valid.

  **WHY Each Reference Matters**:
  - App.css line 115-127: Current grid-template-columns definition — this is the exact CSS to modify
  - App.tsx line 198: Where style prop passes grid config — needs to pass custom widths
  - DnD sensors: MUST understand DnD's pointer handling to prevent conflicts with resize dragging

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Drag to resize columns in 2-col layout
    Tool: Playwright
    Preconditions: App loaded, 2-column layout selected, 4+ projects visible
    Steps:
      1. Switch to 2-column layout via header button
      2. Locate the resize handle between the two columns (thin vertical bar in the gap)
      3. Mouse down on the resize handle
      4. Drag 100px to the right
      5. Mouse up
      6. Assert: left column is visibly wider than right column
      7. Read computed `grid-template-columns` from `.project-stack`
      8. Assert: the first fr value is larger than the second (e.g., "1.3fr 0.7fr" not "1fr 1fr")
      9. Screenshot the unequal columns
    Expected Result: Columns resize smoothly during drag, proportions persist after mouse up
    Failure Indicators: Columns don't resize, layout breaks, items overlap
    Evidence: .sisyphus/evidence/task-6-column-resize-2col.png

  Scenario: Column widths persist after reload
    Tool: Playwright
    Preconditions: Columns resized to unequal widths in 2-col mode
    Steps:
      1. Reload page
      2. Assert: columns retain unequal widths
      3. Check localStorage `dashboard-column-widths` contains entry for "2"
      4. Assert: stored values match displayed proportions
    Expected Result: Custom column widths survive reload
    Failure Indicators: Columns reset to equal on reload
    Evidence: .sisyphus/evidence/task-6-column-persist.txt

  Scenario: DnD still works with resize handles present
    Tool: Playwright
    Preconditions: 2-column layout with resize handles visible
    Steps:
      1. Drag a project strip from position 1 to position 3
      2. Assert: project reorders correctly (check order of `.project-strip` elements)
      3. Assert: resize handles remain functional after DnD
    Expected Result: DnD reordering and column resize coexist without conflict
    Failure Indicators: DnD triggers resize, resize triggers DnD, either feature broken
    Evidence: .sisyphus/evidence/task-6-dnd-coexist.png

  Scenario: Minimum column width enforced
    Tool: Playwright
    Preconditions: 2-column layout
    Steps:
      1. Drag resize handle far to the right (try to make right column very narrow)
      2. Assert: right column width >= 200px (or ~200px)
      3. Assert: drag stops having effect once minimum is reached
    Expected Result: Minimum column width prevents unusably narrow columns
    Failure Indicators: Column shrinks to 0px or content overflows
    Evidence: .sisyphus/evidence/task-6-min-width.png

  Scenario: 1-column layout has no resize handle
    Tool: Playwright
    Preconditions: 1-column layout selected
    Steps:
      1. Switch to 1-column layout
      2. Assert: no resize handle elements in DOM
    Expected Result: No resize UI in single-column mode
    Failure Indicators: Resize handle visible in 1-col, or orphaned DOM elements
    Evidence: .sisyphus/evidence/task-6-no-resize-1col.png
  ```

  **Evidence to Capture:**
  - [ ] task-6-column-resize-2col.png — Unequal column widths after resize
  - [ ] task-6-column-persist.txt — localStorage verification
  - [ ] task-6-dnd-coexist.png — DnD working alongside resize
  - [ ] task-6-min-width.png — Minimum width enforcement
  - [ ] task-6-no-resize-1col.png — No resize in 1-col mode

  **Commit**: YES
  - Message: `feat(resize): add draggable column width resize for multi-column layouts`
  - Files: `src/ui/App.tsx`, `src/ui/App.css`, `src/ui/components/ColumnResizeHandle.tsx` (new), `src/ui/components/ColumnResizeHandle.css` (new)
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 7. Draggable Pane Max-Height with Scrollable Content

  **What to do**:
  - In multi-column layouts, project strips are stacked vertically in each column. Currently the `.project-stack` has a fixed `max-height: calc(100vh - 96px)` with `overflow-y: auto`.
  - Replace the single `.project-stack` max-height with per-row max-height controls:
    - In multi-column mode, each "row" of project strips (strips at the same vertical position across columns) shares a max-height
    - Add a horizontal resize handle at the bottom of each row that can be dragged vertically to change the row's max-height
    - Content within the pane scrolls when it exceeds the max-height
  - Simpler approach: Apply max-height per individual `.project-strip[data-expanded="true"]` (expanded panes only):
    - Each expanded pane gets a configurable max-height (default: `400px`)
    - Resize handle at the bottom edge of each expanded pane (thin horizontal bar, 4px tall, `cursor: row-resize`)
    - Drag down increases max-height, drag up decreases it
    - Pane content becomes scrollable via `overflow-y: auto` on `.strip-body` when content exceeds max-height
    - MINIMUM max-height: 150px (prevent collapse below usable size)
  - Add a "Release" button (uncap max-height) at the TOP of each expanded pane:
    - Position: absolute, top-right of the expanded pane (inside `.strip-header`, right side)
    - Icon: expand/fullscreen icon or up-down arrow symbol (⇕ or ⤢)
    - Click toggles between constrained max-height and `max-height: none` (auto height)
    - CRITICAL: Button is at TOP because if content is very long, a bottom button would be unreachable
    - When released (no max-height), the resize handle disappears or becomes inactive
    - Button shows different icon/state for constrained vs released
  - Persist max-heights to `localStorage` key `"dashboard-pane-heights"` as `Record<string, number | null>` (sourceId → px height, null = released)
  - Create `useProjectPaneHeights.ts` hook following same pattern as `useProjectOrder.ts`:
    - Export: `{ heights, setHeight(sourceId, px), releaseHeight(sourceId), isReleased(sourceId), getHeight(sourceId) }`

  **Must NOT do**:
  - Do not add animation library for height transitions — use CSS `transition: max-height var(--transition-normal)`
  - Do not break collapsed pane layout — max-height and resize only apply to expanded panes
  - Do not allow max-height below 150px
  - Do not place release button at bottom of pane

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex interaction: per-pane resize handles + mouse tracking + release toggle + scroll management + persistence. Multiple files.
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: The resize interaction and release button UX needs careful design for feel and discoverability.
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed during implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5, 6)
  - **Blocks**: None directly (Task 9 is folded into this task)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:51` — Root div `.project-strip[data-expanded]`. The max-height constraint applies when `data-expanded="true"`.
  - `src/ui/components/ProjectStrip.tsx:64-105` — `.strip-body` expanded content area. This is what scrolls when max-height is exceeded.
  - `src/ui/components/ProjectStrip.tsx:53` — `.strip-header` click handler area. Release button goes inside here, positioned right.
  - `src/ui/hooks/useProjectOrder.ts` — Canonical hook pattern for localStorage persistence. Copy for useProjectPaneHeights.
  - `src/ui/components/ProjectStrip.css` — Existing strip styles. Add max-height, overflow-y, and resize handle styles here.

  **API/Type References**:
  - `src/types.ts:82-108` — `ProjectSnapshot.sourceId` for keying heights per project.

  **WHY Each Reference Matters**:
  - ProjectStrip.tsx line 51: Where data-expanded gates the max-height behavior
  - Lines 64-105: The scrollable container when max-height is active
  - Line 53: Where the release button inserts (top of pane, in header)
  - useProjectOrder.ts: Identical persistence pattern to follow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Drag to resize expanded pane height
    Tool: Playwright
    Preconditions: App loaded, a project strip expanded with enough content to scroll
    Steps:
      1. Expand a project strip by clicking its header
      2. Locate the resize handle at the bottom of the expanded pane (thin horizontal bar)
      3. Mouse down on the resize handle
      4. Drag downward by 100px
      5. Mouse up
      6. Assert: pane is taller than default 400px
      7. Assert: computed max-height matches new value
      8. Screenshot the resized pane
    Expected Result: Pane height increases smoothly during drag, content area expands
    Failure Indicators: Pane doesn't resize, handle not visible, content overlaps
    Evidence: .sisyphus/evidence/task-7-pane-resize.png

  Scenario: Scrollable content when height exceeded
    Tool: Playwright
    Preconditions: Expanded pane with constrained max-height and lots of content
    Steps:
      1. Set pane max-height small (e.g., drag resize handle up to near minimum)
      2. Assert: `.strip-body` has `overflow-y: auto` or `scroll`
      3. Assert: scrollbar appears when content exceeds max-height
      4. Scroll down within the pane
      5. Assert: content scrolls, pane boundary is respected
    Expected Result: Content scrolls within the constrained pane
    Failure Indicators: Content overflows pane boundary, no scrollbar
    Evidence: .sisyphus/evidence/task-7-scrollable.png

  Scenario: Release button uncaps max-height
    Tool: Playwright
    Preconditions: Expanded pane with constrained max-height
    Steps:
      1. Locate the release button at top-right of the expanded pane header
      2. Click the release button
      3. Assert: pane expands to fit all content (no max-height constraint)
      4. Assert: resize handle disappears or is inactive
      5. Assert: release button icon/state changes to indicate "released"
      6. Click release button again
      7. Assert: max-height constraint re-applied, pane shrinks back
    Expected Result: Toggle between constrained and released height
    Failure Indicators: Button doesn't toggle, pane doesn't expand/contract
    Evidence: .sisyphus/evidence/task-7-release-button.png

  Scenario: Release button is accessible at TOP (not pushed down)
    Tool: Playwright
    Preconditions: Expanded pane with very long content and constrained max-height
    Steps:
      1. Assert: release button is visible WITHOUT scrolling (it's in the header, at the top)
      2. Assert: button's offsetTop is within the pane's header area (first ~40px)
    Expected Result: Release button always accessible regardless of content length
    Failure Indicators: Button is at the bottom, pushed off-screen by content
    Evidence: .sisyphus/evidence/task-7-button-position.png

  Scenario: Heights persist after reload
    Tool: Playwright
    Preconditions: A pane resized to custom height, another pane released
    Steps:
      1. Reload page
      2. Expand the previously resized pane
      3. Assert: custom height is restored
      4. Expand the previously released pane
      5. Assert: pane is still in released state
      6. Check localStorage `dashboard-pane-heights`
    Expected Result: All pane height states survive reload
    Failure Indicators: Heights reset to defaults, released state lost
    Evidence: .sisyphus/evidence/task-7-height-persist.txt

  Scenario: Minimum height enforced
    Tool: Playwright
    Preconditions: Expanded pane
    Steps:
      1. Drag resize handle upward aggressively (try to shrink below 150px)
      2. Assert: pane height does not go below 150px
    Expected Result: Minimum height prevents collapse
    Failure Indicators: Pane becomes unusably small or disappears
    Evidence: .sisyphus/evidence/task-7-min-height.png
  ```

  **Evidence to Capture:**
  - [ ] task-7-pane-resize.png — Expanded pane with custom height
  - [ ] task-7-scrollable.png — Content scrolling within constrained pane
  - [ ] task-7-release-button.png — Release button toggle states
  - [ ] task-7-button-position.png — Button position at top of pane
  - [ ] task-7-height-persist.txt — localStorage verification
  - [ ] task-7-min-height.png — Minimum height enforcement

  **Commit**: YES
  - Message: `feat(resize): add draggable pane height with release button`
  - Files: `src/ui/hooks/useProjectPaneHeights.ts` (new), `src/ui/components/ProjectStrip.tsx`, `src/ui/components/ProjectStrip.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 8. Enhanced Status Indicators — Border Color & Animation Aligned with Status Dot

  **What to do**:
  - Currently each `.project-strip` has a plain border. Enhance so that the strip's BORDER matches the status dot, making status immediately visible at a glance.
  - Task 2 already provides `data-stale="true"` on `.project-strip` and `.strip-status-dot`. Task 8 CONSUMES these attributes for border/dot styling only — do NOT re-implement stale detection logic.
  - Update `.project-strip` border based on status (in ProjectStrip.css):
    - `busy` / `running_tool`: `var(--status-busy)` (#00d4aa) border, subtle pulse animation (opacity 0.6→1, 2s ease-in-out infinite)
    - `thinking`: `var(--status-thinking)` (#ffa502) border, slow pulse (3s)
    - `idle` (NOT stale): `var(--status-idle)` (#666680) border, no animation
    - `idle` + stale: dim border (`var(--border-primary)` #2a2a3e), dot turns very dim/grey
    - `error` / question states: `var(--status-danger)` (#ff6b6b) border, attention-grabbing pulse (1s, brighter, maybe slight box-shadow glow)
    - `unknown`: `var(--status-unknown)` (#444460) border, no animation
  - Status dot size increase: from current ~6px to 10px (collapsed) / 12px (expanded) for better visibility
  - Add CSS `@keyframes status-pulse` with configurable speed via CSS custom property `--pulse-speed`
  - Map `data-status` attribute to border-color and `--pulse-speed` using CSS attribute selectors (`.project-strip[data-status="busy"]`)
  - Add `data-status` attribute to `.project-strip` root div (currently only on `.strip-status-dot`)
  - Error/question states must "pop" — use `box-shadow: 0 0 8px rgba(status-color, 0.3)` in addition to border color
  - Add `@media (prefers-reduced-motion: reduce)` that sets `animation: none !important` on all pulsing selectors — mandatory accessibility guardrail

  **Must NOT do**:
  - Do not add framer-motion or any animation library — CSS @keyframes only
  - Do not change the semantic meaning of statuses
  - Do not add border animation to collapsed strips (too visually noisy) — collapsed strips get static border color only. Animation (pulse) only on expanded strips and the status dot.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is primarily visual/CSS work — animations, colors, transitions, visual hierarchy. Needs design sensibility.
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Status visibility is a UX-critical feature. Need design eye for the right pulse speeds, glow intensities, and color contrasts.
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed during implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (after Task 2 completes — stale detection depends on Task 2's status logic)
  - **Blocks**: None
  - **Blocked By**: Task 2 (Stale Session Detection)

  **References**:

  **Pattern References**:
  - `src/ui/components/ProjectStrip.tsx:54` — Status dot: `<span className="strip-status-dot" data-status={mainSession.status}>`. Add `data-stale` attribute here.
  - `src/ui/components/ProjectStrip.tsx:51` — Root `.project-strip` div. Add `data-status={mainSession.status}` and `data-stale` here.
  - `src/ui/components/ProjectStrip.css` — Existing status dot styles. Enhance with size increase and animation.
  - `src/styles/tokens.css` — Status colors already defined: busy=#00d4aa, idle=#666680, thinking=#ffa502, tool=#4ecdc4, unknown=#444460. Use these as border colors.

  **API/Type References**:
  - `src/types.ts:16` — `SessionStatus` type: 'busy'|'idle'|'thinking'|'running_tool'|'unknown'
  - `src/types.ts:82-108` — `ProjectSnapshot.mainSession.lastUpdated` for stale calculation.

  **WHY Each Reference Matters**:
  - ProjectStrip.tsx lines 51,54: Exact elements to add data attributes to
  - tokens.css: Status colors already exist — map them to border-color
  - types.ts SessionStatus: All possible status values that need visual treatment

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Busy project has green pulsing border
    Tool: Playwright
    Preconditions: App loaded with a project whose mainSession.status is "busy"
    Steps:
      1. Find a project strip with data-status="busy"
      2. Assert: border-color is #00d4aa (var(--status-busy))
      3. Assert: element has CSS animation containing "pulse" (check computed animation-name)
      4. Screenshot the busy project showing green border
    Expected Result: Green border with smooth pulse animation
    Failure Indicators: Default border color, no animation, wrong color
    Evidence: .sisyphus/evidence/task-8-busy-border.png

  Scenario: Stale idle project has dimmed border
    Tool: Playwright
    Preconditions: A project with lastUpdated > 5 minutes ago and status = idle
    Steps:
      1. Find a project strip with data-stale="true"
      2. Assert: border-color is dim (#2a2a3e or similar), NOT idle color (#666680)
      3. Assert: status dot is dimmer/greyer than non-stale idle
      4. Assert: no pulse animation on stale strips
      5. Screenshot comparison of stale vs non-stale idle
    Expected Result: Stale projects are visually de-emphasized
    Failure Indicators: Stale looks the same as active idle
    Evidence: .sisyphus/evidence/task-8-stale-dim.png

  Scenario: Error state has attention-grabbing glow
    Tool: Playwright
    Preconditions: A project in error state (or inject via page.evaluate)
    Steps:
      1. If no error project exists, use page.evaluate to set a project's status to error
      2. Find the error project strip
      3. Assert: border-color is #ff6b6b (danger)
      4. Assert: box-shadow contains rgba glow
      5. Assert: pulse animation is fast (~1s)
      6. Screenshot the error state showing glow
    Expected Result: Error state immediately catches eye with red border + glow + fast pulse
    Failure Indicators: Error looks like other states, no glow, no animation
    Evidence: .sisyphus/evidence/task-8-error-glow.png

  Scenario: Status dot is larger and more visible
    Tool: Playwright
    Preconditions: App loaded with projects in various states
    Steps:
      1. Measure status dot size on a collapsed strip
      2. Assert: dot is approximately 10px (was ~6px)
      3. Expand a strip
      4. Measure status dot size on expanded strip
      5. Assert: dot is approximately 12px
    Expected Result: Status dots are noticeably larger than before
    Failure Indicators: Dots are still tiny (~6px), or oversized (>16px)
    Evidence: .sisyphus/evidence/task-8-dot-size.png
  ```

  **Evidence to Capture:**
  - [ ] task-8-busy-border.png — Busy project with green pulsing border
  - [ ] task-8-stale-dim.png — Stale vs non-stale idle comparison
  - [ ] task-8-error-glow.png — Error state with red glow
  - [ ] task-8-dot-size.png — Status dot size comparison

  **Commit**: YES
  - Message: `feat(status): enhance borders and dots to match status with animation`
  - Files: `src/ui/components/ProjectStrip.tsx`, `src/ui/components/ProjectStrip.css`, `src/styles/tokens.css`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 9. Settings Panel Reorganization — Collapsed vs Full View Groups

  **What to do**:
  - Currently `SettingsPanel.tsx` has a single "Display Options" section with ALL 8 toggles (showMiniSparkline, showPlanProgress, showAgentBadge, showLastUpdated, showStatusDot, showTokenUsage, showBackgroundTasks, showGitWorktrees).
  - Split into TWO subsections under Display Options:
    - **"Collapsed View"** — controls visible in collapsed strip header:
      - showStatusDot (status indicator dot)
      - showMiniSparkline (inline sparkline)
      - showPlanProgress (plan progress bar)
      - showAgentBadge (agent name badge)
      - showLastUpdated (timestamp)
    - **"Expanded View"** — controls visible only when strip is expanded:
      - showTokenUsage (token usage breakdown)
      - showBackgroundTasks (background tasks section)
      - showGitWorktrees (git worktree list)
  - Implementation:
    - Keep `DISPLAY_TOGGLES` array but split into `COLLAPSED_TOGGLES` and `EXPANDED_TOGGLES` (or use a `group` property)
    - Render two `<h4>` sub-headings under the existing `<h3>Display Options</h3>`
    - Each sub-group renders its toggles using the same toggle UI pattern (reuse existing)
    - Maintain the same `stripConfig` / `onToggleStrip` interface — no type changes needed
  - Ensure the "Project Visibility" section from Task 4 is ABOVE Display Options
  - Final settings order: Project Visibility → Display Options (Collapsed View / Expanded View) → Sound Notifications

  **Must NOT do**:
  - Do not change StripConfigState type — only change how toggles are presented in the UI
  - Do not add collapsible/accordion sections to the settings panel
  - Do not change toggle key names or defaults
  - Do not add per-project display settings (global settings only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure UI reorganization of existing components. Single file, no logic changes. Split an array into two, add two sub-headings.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: This is just splitting a list, no design work needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4)
  - **Blocks**: None
  - **Blocked By**: Task 4 (Project Visibility — must exist before reorganizing sections)

  **References**:

  **Pattern References**:
  - `src/ui/components/SettingsPanel.tsx:19-28` — Current `DISPLAY_TOGGLES` array. Split this into `COLLAPSED_TOGGLES` (first 5) and `EXPANDED_TOGGLES` (last 3).
  - `src/ui/components/SettingsPanel.tsx:118-134` — Current "Display Options" section with single `<h3>` and flat toggle list. Restructure to have two `<h4>` sub-groups.
  - `src/ui/components/SettingsPanel.tsx:136-193` — "Sound Notifications" section. This should remain AFTER the display options. Reference for section styling consistency.

  **API/Type References**:
  - `src/types.ts:118-127` — `StripConfigState` type with 8 boolean fields. DO NOT CHANGE THIS TYPE.

  **WHY Each Reference Matters**:
  - Lines 19-28: The array to split — must know exact field grouping
  - Lines 118-134: The DOM structure to modify — add `<h4>` subdivisions
  - Lines 136-193: Reference for consistent section styling (margins, padding)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings shows two Display Options sub-groups
    Tool: Playwright
    Preconditions: App loaded at http://localhost:5173
    Steps:
      1. Open settings panel via `.header-btn[aria-label="Open settings"]`
      2. Find the "Display Options" heading
      3. Assert: there are two sub-headings under it: "Collapsed View" and "Expanded View" (or similar)
      4. Under "Collapsed View": Assert 5 toggles are present (Status Dot, Mini Sparkline, Plan Progress, Agent Badge, Last Updated)
      5. Under "Expanded View": Assert 3 toggles are present (Token Usage, Background Tasks, Git Worktrees)
      6. Screenshot the organized settings panel
    Expected Result: Display Options is split into two clear groups
    Failure Indicators: Single flat list, wrong grouping, missing toggles
    Evidence: .sisyphus/evidence/task-9-settings-groups.png

  Scenario: Settings section order is correct
    Tool: Playwright
    Preconditions: App loaded, settings open
    Steps:
      1. Get all `<h3>` headings in the settings panel (in DOM order)
      2. Assert order is: "Project Visibility" (from Task 4), "Display Options", "Sound Notifications"
      3. Assert: "Display Options" contains `<h4>` "Collapsed View" and `<h4>` "Expanded View" sub-headings in that order
    Expected Result: Sections appear in correct hierarchy and order
    Failure Indicators: Wrong order, missing sections, Display Options not subdivided
    Evidence: .sisyphus/evidence/task-9-section-order.png

  Scenario: Toggles still function correctly after reorganization
    Tool: Playwright
    Preconditions: Settings open
    Steps:
      1. Toggle "Status Dot" off under Collapsed View
      2. Close settings, verify status dots are hidden on collapsed strips
      3. Open settings, toggle "Background Tasks" off under Expanded View
      4. Expand a strip, verify background tasks section is hidden
      5. Toggle both back on, verify they reappear
    Expected Result: Toggle functionality preserved after reorganization
    Failure Indicators: Toggles don't work, wrong toggle controls wrong feature
    Evidence: .sisyphus/evidence/task-9-toggle-function.png
  ```

  **Evidence to Capture:**
  - [ ] task-9-settings-groups.png — Settings panel with two sub-groups
  - [ ] task-9-section-order.png — Correct section ordering
  - [ ] task-9-toggle-function.png — Toggles still work correctly

  **Commit**: YES
  - Message: `refactor(settings): split display options into collapsed and expanded groups`
  - Files: `src/ui/components/SettingsPanel.tsx`
  - Pre-commit: `bunx tsc --noEmit`

---

- [ ] 10. Integration Build & TypeScript Verification

  **What to do**:
  - After all implementation tasks (1-9) are complete, run a full verification pass:
    1. Run `bunx tsc --noEmit` — verify zero TypeScript errors across entire project
    2. Run `bun run build` (or whatever the build command is) — verify production build succeeds
    3. Start the dev server and verify the app loads without console errors
    4. Verify all localStorage keys are being set correctly by doing a complete walkthrough:
       - `dashboard-project-visibility` (Task 4)
       - `dashboard-zoom` (Task 5)
       - `dashboard-column-widths` (Task 6)
       - `dashboard-pane-heights` (Task 7)
       - Existing keys: `dashboard-grid-order`, `dashboard-strip-config`, `dashboard-sound-config`
    5. Test a full page reload to verify all persisted state restores correctly
  - Fix any TypeScript errors or build issues that surface from combining tasks 1-9

  **Must NOT do**:
  - Do not refactor working code "while you're at it"
  - Do not add new features beyond fixing integration issues
  - Do not change APIs or interfaces — only fix compile/runtime errors

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full project verification requires running multiple tools, diagnosing cross-task issues, and fixing integration bugs. May need to understand the full dependency chain.
  - **Skills**: [`playwright`]
    - `playwright`: For verifying the app loads and functions correctly in a real browser.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — this is verification, not design

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after ALL tasks 1-9)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 1-9 (all must complete)

  **References**:

  **Pattern References**:
  - `package.json` — Build scripts and dependencies. Check `scripts.build`, `scripts.dev` commands.
  - `tsconfig.json` — TypeScript config to verify compiler settings.

  **API/Type References**:
  - `src/types.ts` — All types. Any cross-task type conflicts will show here first.

  **WHY Each Reference Matters**:
  - package.json: Exact build/dev commands to run
  - tsconfig.json: Compiler options that may cause errors if strict mode catches new issues
  - types.ts: Central type file where multi-task changes may conflict

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles with zero errors
    Tool: Bash
    Steps:
      1. Run `bunx tsc --noEmit`
      2. Assert: exit code 0, no error output
    Expected Result: Clean compilation
    Failure Indicators: Any TypeScript errors
    Evidence: .sisyphus/evidence/task-10-tsc.txt

  Scenario: Production build succeeds
    Tool: Bash
    Steps:
      1. Run `bun run build`
      2. Assert: exit code 0, build output created
    Expected Result: Successful production build
    Failure Indicators: Build errors, missing modules
    Evidence: .sisyphus/evidence/task-10-build.txt

  Scenario: App loads with zero console errors
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:5173
      2. Collect all console.error calls
      3. Wait 10 seconds for all data to load
      4. Assert: zero console.error messages
      5. Screenshot the loaded dashboard
    Expected Result: Clean load with no errors
    Failure Indicators: Console errors, white screen, missing components
    Evidence: .sisyphus/evidence/task-10-clean-load.png

  Scenario: All localStorage keys persist correctly
    Tool: Playwright
    Preconditions: App loaded, interact with each new feature at least once
    Steps:
      1. Hide a project (visibility)
      2. Change zoom level
      3. Resize a column width
      4. Resize a pane height
      5. Toggle a display option
      6. Dump all dashboard-* localStorage keys via page.evaluate
      7. Reload page
      8. Dump localStorage keys again
      9. Assert: all keys present before and after reload with same values
    Expected Result: All 7+ localStorage keys persist across reload
    Failure Indicators: Missing keys, different values after reload, JSON parse errors
    Evidence: .sisyphus/evidence/task-10-localstorage.txt
  ```

  **Evidence to Capture:**
  - [ ] task-10-tsc.txt — TypeScript compilation output
  - [ ] task-10-build.txt — Production build output
  - [ ] task-10-clean-load.png — Dashboard loaded with no errors
  - [ ] task-10-localstorage.txt — localStorage key dump

  **Commit**: YES (only if fixes were needed)
  - Message: `fix(integration): resolve cross-task type and build issues`
  - Files: any files modified to fix issues
  - Pre-commit: `bunx tsc --noEmit`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, inspect DOM via Playwright). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bunx tsc --noEmit` + `bun run build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | TypeCheck [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Start from clean state (clear localStorage). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: sounds fire with correct border animations, zoom doesn't break resize handles, visibility toggle persists across page reload. Test edge cases: all projects hidden, extreme zoom (50% and 200%), rapid resize. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files beyond shared types. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message | Key Files |
|------|---------------|-----------|
| 1 | `feat(sound): redesign notifications with sine ADSR patterns` | useSoundNotifications.ts, types.ts |
| 2 | `fix(status): add client-side stale detection` | ProjectStrip.tsx, types.ts |
| 3 | `fix(timestamp): show real activity time in collapsed view` | ProjectStrip.tsx |
| 4 | `feat(visibility): add per-project visibility toggle` | useProjectVisibility.ts, SettingsPanel.tsx, App.tsx, types.ts |
| 5 | `feat(zoom): add dashboard-level zoom controls` | DashboardHeader.tsx, tokens.css, App.tsx (inline zoom state) |
| 6 | `feat(resize): add drag-to-resize column widths` | useColumnResize.ts, App.tsx, App.css |
| 7 | `feat(resize): add drag-to-resize pane max-heights` | useProjectPaneHeights.ts, ProjectStrip.tsx, ProjectStrip.css |
| 8 | `feat(status): enhance dot and border visibility` | ProjectStrip.css, ProjectStrip.tsx |
| 9 | `refactor(settings): group display options by view type` | SettingsPanel.tsx |
| 10 | `chore(verify): integration build and cross-feature QA` | (no source changes — evidence only) |

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit           # Expected: no errors
bun run build               # Expected: successful build
```

### Final Checklist
- [ ] All 10 "Must Have" features present and functional
- [ ] All "Must NOT Have" patterns absent from codebase
- [ ] TypeScript compiles without errors
- [ ] Build succeeds
- [ ] All Playwright QA scenarios pass with evidence captured
- [ ] localStorage persistence works for: sound config, visibility, column widths, pane heights, zoom level
- [ ] `prefers-reduced-motion` disables animations
- [ ] @dnd-kit reordering still works alongside resize handles
