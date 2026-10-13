# Draft: Project Management UI Improvements

## Requirements (confirmed)
- Add project form needs to be accessible at all times (currently only shows when zero projects exist)
- Project Visibility should be extracted from SettingsPanel into its own separate panel/window
- Visibility panel should use a multi-column grid layout to accommodate growth
- Visibility panel should be accessible from the settings panel

## Technical Decisions
- **Add Project placement**: Both — "+" button in DashboardHeader for quick adds, plus full form inside the visibility panel
- **Visibility panel style**: Almost-full-screen modal/overlay (not sidebar drawer). User noted the current sidebar is running out of space for settings too, and the backdrop blocks main screen anyway
- **DnD reorder**: Both — reorder in visibility panel AND on main dashboard (dual control)
- **Grid columns**: Auto-responsive (CSS grid auto-fill/auto-fit)
- **SettingsPanel conversion**: Also convert to almost-full-screen overlay (both panels get new treatment)
- **Visibility panel trigger**: Both — dedicated icon in DashboardHeader + link/button inside SettingsPanel
- **Project card richness**: Medium — status dot, label, path, last active time, session count, current agent, visibility toggle
- **Search/filter**: Search box at the top of visibility panel (text search only, no status filters yet)

## Research Findings
- **AddProjectForm** currently only renders in App's empty state (no projects). Needs to be accessible always.
- **SettingsPanel** has project visibility toggles inline — status dot + label + toggle per project. This will be extracted.
- **useProjectVisibility** hook: `{ visibility, setVisibility, isVisible, toggleVisibility }` — persists to localStorage.
- **useProjectOrder** hook: `{ orderedIds, columns, reorder, setColumns, syncIds }` — DnD-powered ordering.
- **CSS grid usage** is minimal — only background tasks table. Main layout is flexbox. New grid needed.
- **Design tokens** available: spacing (sp-1 to sp-8), radii (sm/md), transitions (fast/normal), full color palette.
- **Panel pattern**: Fixed-position drawer, z-index 900-901, slide from right, backdrop overlay, Escape to close.
- **API contract**: POST /api/sources { projectRoot (required, abs path), label? } → { ok, sourceId }.

## Open Questions
- None remaining — all key decisions made

## Scope Boundaries
- INCLUDE: Add project UI (header + panel), visibility panel extraction with grid layout, search, DnD reorder in panel, SettingsPanel full-screen conversion, project cards with medium richness
- EXCLUDE: Status-based filtering, sort options, rich mini-strip cards, changes to ProjectStrip itself, new API endpoints
