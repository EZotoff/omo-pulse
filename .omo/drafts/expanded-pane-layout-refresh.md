# Draft: Expanded Pane Layout Refresh

## Requirements (confirmed)
- [project name/path]: "I would like to see the name and path of the project at the top of the expanded pane view (Right above Activity)."
- [activity duplication]: "Activity and Session activity seem to be duplicating stuff. Should we remove the redundant one? Feels like session activity has the aggregated bars along with the potential for per-session visualisation."
- [session colors]: "We should be coloring the different bars of the different sessions in different colors though."
- [token usage placement]: "And let's move Token Usage to the right side at the top, next to (after, to the right) of the activity thing. Probably the in/out/total should be vertically stacked then."

## Technical Decisions
- [intent tier]: Standard UI/layout plan affecting expanded-pane composition, visualization semantics, and CSS layout.
- [planning approach]: Ground decisions in existing component structure, test coverage, and current visualization responsibilities before locking implementation steps.
- [expanded-pane-assembly]: `ProjectStrip.tsx` composes the expanded body from `StripSessions` (Activity, Session Activity, plan sections) followed by `StripMetrics` (main session, background tasks, Token Usage).
- [current-name-path-state]: `project.label` appears only in the strip header; `project.projectRoot` exists in data but is not currently rendered in the expanded body.
- [token-usage-state]: Token Usage currently lives in `StripMetrics`, so moving it beside Activity requires a layout restructure inside the expanded pane, not just CSS reordering.
- [session-color-strategy]: Use stable unique colors per session rather than the current agent-family color grouping.
- [test-strategy]: Use tests-after plus agent-executed QA.

## Research Findings
- [ui-structure]: `src/ui/components/ProjectStrip.tsx` owns the expanded pane; `StripSessions` contains Activity + Session Activity, and `StripMetrics` contains Token Usage.
- [activity-vs-session-activity]: Current sections are complementary rather than literally duplicated: `Sparkline.tsx` shows aggregate agent activity, while `SessionSwimlane.tsx` shows per-session activity rows.
- [session-colors]: `SessionSwimlane.tsx` already colors bars via `detectTone()`, but colors are grouped by agent-family labels (`sisyphus`, `prometheus`, `atlas`, fallback) rather than uniquely per session.
- [tests]: Vitest and Playwright are present. Expanded/collapsed pane behavior has coverage, but token-usage placement and per-pane height behavior do not have direct UI tests.
- [relevant-files]: `src/ui/components/ProjectStrip.tsx`, `ProjectStrip.css`, `SessionSwimlane.tsx`, `SessionSwimlane.css`, `Sparkline.tsx`, `src/ui/App.tsx`, `src/styles/tokens.css`.

## Open Questions
- [aggregate-activity-decision]: User clarified that the single per-session chart is sufficient conceptually, but the plan still needs an explicit keep-vs-remove decision for the aggregate Activity section.

## Scope Boundaries
- INCLUDE: expanded-pane header content, activity/session activity section structure, per-session bar coloring, token usage relocation/layout in expanded view.
- EXCLUDE: collapsed-pane redesign, backend data-shape changes unless required by current UI limitations, unrelated dashboard layout changes.
