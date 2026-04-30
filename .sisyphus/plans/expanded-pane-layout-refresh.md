# Plan: Expanded Pane Layout Refresh

## Summary

Restructure the expanded project pane to: (1) add project name/path header, (2) remove aggregate Activity sparkline and use only per-session SessionSwimlane, (3) assign unique stable colors per session, (4) move Token Usage to the top-right beside the activity chart with vertically stacked in/out/total.

## User Requirements

1. Show project name and path at top of expanded pane, above Activity
2. Remove redundant aggregate Activity section — keep only the per-session chart
3. Color session bars with unique per-session colors (not agent-family grouping)
4. Move Token Usage to top-right, next to activity chart, with in/out/total vertically stacked

## Files to Modify

| File | Changes |
|------|---------|
| `src/ui/components/ProjectStrip.tsx` | Restructure `StripSessions` body layout, add project header, extract Token Usage into top row, remove aggregate Activity section |
| `src/ui/components/ProjectStrip.css` | Add top-row flex layout, project header styles, token usage vertical layout, new density overrides |
| `src/ui/components/SessionSwimlane.tsx` | Replace `detectTone()` with per-session unique color assignment |
| `src/ui/components/SessionSwimlane.css` | Add CSS custom properties for dynamic session colors |
| `src/ui/types.ts` | Expand `AgentTone` type or add new session-color type to support unique palette |

## Implementation Steps

### Step 1: Per-Session Unique Color Assignment

**Goal**: Replace agent-family tone grouping with stable unique colors per session.

**Changes in `SessionSwimlane.tsx`**:
- Replace `detectTone()` (line 8) with a new function that assigns stable unique colors based on session index or session ID hash
- Define a palette of 8-10 distinct colors that cycle when exceeded
- Update `GradientDefs` to include the expanded palette (new gradient IDs)
- Update `sessionTones` memo (line 80) to use the new color assignment
- Update legend dot class to use the new color system

**Changes in `SessionSwimlane.css`**:
- Add CSS custom properties for the per-session color palette dots

**Changes in `src/ui/types.ts`**:
- If `AgentTone` is too restrictive, extend the tone type or create a `SessionTone` union that includes the expanded palette

**Constraints**:
- Background sessions should still use the `"muted"` tone
- Colors must be stable across re-renders (deterministic from session ID)
- Must be visually distinct — no two adjacent sessions should look the same

### Step 2: Restructure Expanded Pane Layout

**Goal**: Replace the current `StripSessions` → `StripMetrics` vertical stack with a new layout: project header row, then a top activity+tokens row, then remaining sections.

**Changes in `ProjectStrip.tsx`**:

1. **Add project name/path header** above everything in `strip-body-inner`:
   - Render `project.label` as primary text, `project.projectRoot` as muted secondary path
   - New CSS class `.strip-project-header` with `.strip-project-name` and `.strip-project-path` children

2. **Remove the aggregate Activity section**:
   - Delete lines 331-334 in `StripSessions` (the "Activity" section with `fullSparkline` slot)
   - The `fullSparkline` slot in props becomes unused — remove from `ProjectStripProps.children` type (line 105) and from `ProjectStripWithChildren` in `App.tsx` (lines 596-600)

3. **Create a top activity+tokens row**:
   - New wrapper div `.strip-top-row` with `display: flex` containing:
     - Left: the SessionSwimlane (renamed from "Session Activity" to just "Activity")
     - Right: Token Usage with vertically stacked in/out/total
   - Extract Token Usage out of `StripMetrics` into this new top row
   - Token Usage: change `.strip-tokens` from horizontal flex to vertical flex, stacking in/out/total

4. **Update `StripMetrics`**: Remove the Token Usage section (lines 296-314) since it moved to the top row

**Changes in `ProjectStrip.css`**:

1. Add `.strip-project-header`, `.strip-project-name`, `.strip-project-path` styles
2. Add `.strip-top-row` flex layout (row direction, gap)
3. Add `.strip-top-row-activity` (flex: 1) for the swimlane
4. Add `.strip-top-row-tokens` (flex-shrink: 0) for token usage
5. Update `.strip-tokens` to `flex-direction: column`
6. Add density overrides for compact/ultra-compact modes
7. Remove `.sparkline-slot--full` styles (no longer used)

**Changes in `App.tsx`**:
- Remove the `fullSparkline` slot from `ProjectStripWithChildren` (lines 596-600)

### Step 3: Polish & Verify

**Goal**: Ensure density modes, existing tests, and visual consistency.

- Verify compact and ultra-compact density modes render correctly with new layout
- Run `lsp_diagnostics` on all changed files
- Run `bun run test` to ensure existing tests pass
- Visual QA: expanded pane should show project name/path at top, activity chart with unique session colors on the left, token usage vertically stacked on the right

### Step 4: Tests After

**Goal**: Add targeted tests for the new layout.

- Update existing `project-strip-status.test.tsx` if needed for new expanded pane structure
- Add Playwright e2e assertion for project name/path in expanded pane
- Add Playwright e2e assertion for token usage placement in top row

## Dependencies

- Steps 1 and 2 are independent — can be done in parallel
- Step 3 depends on both 1 and 2
- Step 4 depends on Step 3

## Risk Areas

- **Color palette contrast**: Per-session colors must be distinguishable on dark backgrounds — test with 3+ concurrent sessions
- **Density modes**: Compact/ultra-compact may need adjustments for the new top-row layout
- **Existing tests**: Removing `fullSparkline` slot may break tests that assert on its presence
