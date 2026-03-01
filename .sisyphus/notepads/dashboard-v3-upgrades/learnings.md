# Dashboard V3 Upgrades - learnings

## Sound Notification Rewrite (2026-03-01)

- Adding new SessionStatus values ("question") requires updating STATUS_PRIORITY Record<SessionStatus, number> in App.tsx since Record enforces exhaustive keys
- The server-side `mapStatusPillToSessionStatus` in multi-project.ts returns "unknown" for unrecognized pills, so adding "question" to the union type doesn't break the server mapper but the server won't produce "question" status until the mapper is updated separately
- ADSR envelope helper `applyADSR(gain, now, peak, a, d, s, r)` is reusable across all sound functions — clean pattern for Web Audio API
- Master gain formula `(volume/100) * 0.06` is 5x quieter than the old 0.3 — important to match spec exactly
- The `configRef` pattern in useSoundNotifications prevents stale closures in useCallback — AudioContext callbacks need current config values
- SettingsPanel has 3 places needing union type updates when adding sound events: SOUND_EVENTS array type, onTestSound prop type, handleSoundEventToggle param type
- Sound function names were renamed (playSessionIdle→playWaiting, playPlanComplete→playAllClear, playSessionError→playAttention) — need to update all destructuring sites and callback mappings in App.tsx

## Task: Fix Timestamp Display in ProjectStrip

### Changes Made
1. **Line 66 (collapsed header)**: Replaced `formatRelativeTime(lastUpdatedMs)` with logic that:
   - Parses `mainSession.lastUpdated` (ISO string from server) to milliseconds
   - Displays real activity time instead of client poll timestamp
   - Shows "—" (em dash) when `mainSession.lastUpdated` is falsy

2. **After line 112 (expanded body)**: Added new "Last Polled" section showing:
   - Original `lastUpdatedMs` value (client-side poll timestamp)
   - Inserted AFTER Main Session section, BEFORE Background Tasks section
   - Uses same em dash pattern for null handling

### Key Pattern
- Null time handling pattern from DashboardHeader.tsx line 32: Use "—" (U+2014 em dash)
- ISO string parsing: `new Date(mainSession.lastUpdated).getTime()` converts to ms
- `formatRelativeTime()` signature unchanged: takes `number` (ms), returns relative string

### Verification
- `bunx tsc --noEmit` passed clean
- `formatRelativeTime` only used in ProjectStrip.tsx (no other references)
- isStale computation already using `mainSession.lastUpdated` correctly


## Per-Project Visibility Toggle (2026-03-01)

### Pattern
- `useProjectVisibility.ts` follows exact same localStorage persistence pattern as `useProjectOrder.ts`: STORAGE_KEY, readPersistedState() with try/catch, persistState() with try/catch, lazy useState init, useEffect persist
- Default visibility is `true` — `visibility[sourceId] !== false` means projects not in config are visible
- State type is `Record<string, boolean>` (aliased as `VisibilityConfig` in types.ts)

### Integration
- `displayProjects` in App.tsx filters AFTER DnD ordering — visibility is the last transform in the chain
- Sound effect code (`data.projects`) must NOT use filtered list — hidden projects still trigger sounds
- `prevDataRef.current` also uses unfiltered `data` — sound transitions need ALL projects
- SettingsPanel receives `data?.projects ?? []` (unfiltered) so hidden projects still appear in visibility toggles
- Three-way ternary in JSX: `data === null` → loading, `projectCount === 0 && data.projects.length === 0` → no projects, `projectCount === 0` → all hidden, else → DnD grid

### Gotcha
- When adding a new ternary branch to JSX, make sure the previous branch closes with `) : (` before the new one starts — easy to get JSX structure wrong with multi-branch ternaries
- The `map` variable from the old displayProjects memo was defined outside — when rewriting, must include it inside the memo


## Dashboard Zoom Controls (2026-03-01)

### Pattern
- CSS transform zoom via `--zoom` custom property on `:root`, read by `.container` as `transform: scale(var(--zoom))`
- Width compensation: `width: calc(100% / var(--zoom))` prevents horizontal overflow when scaled
- `transform-origin: top center` keeps header alignment stable
- Zoom state inline in App.tsx (not a separate hook) — simple enough to not warrant extraction
- localStorage persistence follows same pattern as other features: lazy useState init reads, useEffect writes
- `document.documentElement.style.setProperty('--zoom', ...)` in the same useEffect as localStorage write
- Float drift prevention: `Math.round((z + 0.1) * 10) / 10` avoids 0.7000000001
- DashboardHeader zoom props are all optional (zoom?, onZoomIn?, onZoomOut?, onZoomReset?) so the component remains backward-compatible
- Zoom buttons use `.header-btn` class for visual consistency, with minus/plus symbols and ⟳ for reset
- Disabled state on zoom-out at 0.5 and zoom-in at 2.0 prevents out-of-range clicks


## Per-Pane Draggable Height with Release (2026-03-01)

### Pattern
- `useProjectPaneHeights.ts` follows same canonical localStorage pattern: STORAGE_KEY, readPersistedState(), persistState(), lazy useState init, useEffect persist
- State type: `Record<string, number | null>` — key is sourceId, number is px height, null means "released" (no max-height)
- Default height: 400px, minimum: 150px, clamped via `Math.max(150, px)`
- `isReleased` checks `=== null` (not undefined — undefined means "use default")
- `getHeight` returns `heights[sourceId] ?? 400` — null coalesces to default since `null ?? x` returns x

### Drag Implementation
- Mouse drag uses refs (draggingRef, startYRef, startHeightRef) not React state — avoids re-renders during drag
- `onMouseDown` on resize handle captures start Y and current element height via getBoundingClientRect
- `mousemove` on document applies height directly to DOM via ref (`bodyRef.current.style.maxHeight`)
- `mouseup` on document calls `setHeight()` to persist final value and update React state
- `document.body.style.cursor = "row-resize"` during drag for consistent cursor across page
- `document.body.style.userSelect = "none"` prevents text selection during drag

### CSS Integration
- Removed old `max-height: 900px` CSS rule for `[data-expanded="true"]` — inline styles from React now manage height
- Collapsed state: no inline style → CSS `max-height: 0` → hidden (unchanged)
- `.strip-body--constrained` class added when expanded + not released → `overflow-y: auto` with thin scrollbar
- Scrollbar styled with `scrollbar-width: thin` (Firefox) and `::-webkit-scrollbar` (Chrome/Safari)
- Resize handle: 4px tall, transparent bg, border-primary on hover, `cursor: row-resize`
- Release button positioned in header before chevron, only rendered when expanded

### Gotcha
- The expand/collapse CSS transition (`transition: max-height var(--transition-normal)`) still works because going from `max-height: 0` (collapsed) to inline `maxHeight: 400px` (expanded) triggers the CSS transition
- Button in header needs `e.stopPropagation()` to prevent triggering the header's onClick (which toggles expand)


## Status Indicator Enhancement (2026-03-01)

### Pattern
- `data-status={mainSession.status}` on root `.project-strip` div enables pure CSS border color + animation based on session status
- CSS specificity cascade: status border rules → stale overrides (with `!important`) → animation overrides
- Collapsed strips get STATIC border color only (no animation) — animation selectors require `[data-expanded="true"]`
- Status dots pulse always (even collapsed) since they're small and non-distracting
- Stale overrides use `animation: none !important` to disable pulse on both strip and dot
- `@media (prefers-reduced-motion: reduce)` kills all animations globally for a11y

### CSS Architecture
- `@keyframes status-pulse` uses opacity 0.6→1→0.6 — subtle, not jarring
- Error/question status uses faster pulse (1s) + box-shadow glow for urgency
- Thinking uses slower pulse (3s) for contemplative feel
- Busy/running_tool uses 2s (default)
- `--status-danger: #ff6b6b` (dark) / `#d44040` (light) added to tokens.css alongside `--pulse-speed: 2s`

### Dot Sizes
- Default: 10px (up from 4px) — much more visible
- Expanded: 12px — slightly larger to match expanded strip's visual weight

### Gotcha
- The stale overrides for `.strip-status-dot` use both the selector `.project-strip[data-stale="true"] .strip-status-dot` (opacity: 0.4) AND `.strip-status-dot[data-stale="true"]` (color/box-shadow) — both needed because the dot has its own data-stale attribute
- `--status-danger` was missing from tokens.css — had to add to both `:root` and `[data-theme="light"]`
- ProjectStrip.css grew from 369 to 452 lines with all status indicator enhancements


## Draggable Column Width Resize (2026-03-01)

### Pattern
- Column widths stored as `Record<string, number[]>` keyed by column count string ("2", "3"), value is array of fr values
- localStorage key: `dashboard-column-widths`, follows same canonical persistence pattern
- Default widths: `Array(columns).fill(1)` — equal distribution
- `currentWidths` derived via useMemo from `columnWidths[String(columns)]`
- Inline `gridTemplateColumns` overrides the CSS `grid-template-columns: repeat(var(--grid-cols), 1fr)` fallback

### Resize Implementation
- ColumnResizeHandle is absolutely positioned inside `.project-stack` (which has `position: relative`)
- Handle position calculated as percentage: `(precedingFr / totalFr) * 100` with `left` style + `transform: translateX(-50%)` for centering
- Mouse drag follows same refs-not-state pattern: draggingRef, startXRef, containerWidthRef
- Container width measured via `closest('.project-stack').getBoundingClientRect().width`
- Delta converted from pixels to fraction of container width, then scaled to fr units: `deltaFraction * totalFr`
- Min fr value: `200 / (window.innerWidth / columns)` — ensures no column goes below 200px
- Clamping is bidirectional: if left column goes below min, steal from right and vice versa
- Float drift prevention: `Math.round(x * 100) / 100` on both adjusted widths

### Integration
- Resize handles rendered inside the grid (inside SortableContext) but absolutely positioned so they don't affect grid flow
- Only rendered when `columns > 1` — no resize in single-column mode
- `e.stopPropagation()` on mousedown prevents DnD PointerSensor (8px activation distance) from capturing the drag
- `document.body.style.cursor = 'col-resize'` and `userSelect = 'none'` during drag
- CSS `.column-resize-handle--dragging` class toggled via classList (not React state) during drag for highlight

### CSS
- `.project-stack` got `position: relative` added for absolute handle positioning
- Handle: 4px wide, z-index 6 (above DnD transform z-index 5), transparent bg, border-primary on hover, accent-primary when dragging
