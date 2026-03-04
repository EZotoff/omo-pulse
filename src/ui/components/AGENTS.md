# src/ui/components/ — React Components

Dashboard UI components with co-located CSS.

## Overview

8 TSX components + 7 CSS files. Each component has a matching `.css` file imported at the top. No CSS modules, no CSS-in-JS — plain CSS with custom properties from `src/styles/tokens.css`.

## Key Files

| File | Complexity | Role |
|------|-----------|------|
| `ProjectStrip.tsx` | HIGH | Main per-project row: status pill, agent, model, tool, tokens, plan, expand/collapse |
| `Sparkline.tsx` | HIGH | Canvas-based time-series chart with mini/full modes, hover tooltips |
| `SettingsPanel.tsx` | HIGH | Drawer with sound config, strip toggles, project visibility, layout settings |
| `SessionSwimlane.tsx` | MED | Stacked-bar chart showing per-session activity timeline with color legend |
| `PlanProgress.tsx` | MED | Plan step list with completion status, compact/full modes |
| `DashboardHeader.tsx` | MED | Top bar: connection status, project count, column/zoom controls |
| `AddProjectForm.tsx` | LOW | POST `/api/sources` form for registering new projects |
| `ColumnResizeHandle.tsx` | LOW | Draggable column width adjuster |

## Patterns

- **Props as `type`**: Always `type XProps = { ... }`, never `interface`
- **`memo()`**: Used on `ProjectStrip` for performance (many instances)
- **Render slots**: `ProjectStrip` accepts children as named slots (`miniSparkline`, `fullSparkline`, etc.) — wired in `App.tsx`
- **Density modes**: Components read `data-density` attribute (`comfortable | compact | ultra-compact`) from parent `.page` div
- **Status-aware styling**: CSS uses `[data-status="busy"]` etc. for colored borders (cyan=active, orange=attention, gray=idle)
- **DnD integration**: `@dnd-kit/sortable` wraps each `ProjectStrip` in `App.tsx` — components themselves are DnD-unaware

## Anti-Patterns

- NEVER use CSS modules or CSS-in-JS — plain co-located `.css` files only
- NEVER use `interface` for props — use `type`
- NEVER add global styles here — use `src/styles/tokens.css` for custom properties
- NEVER import from `src/types.ts` for UI-only types — use `src/ui/types.ts`
