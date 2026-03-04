# src/ui/hooks — Custom React Hooks

> Parent: [../../AGENTS.md](../../AGENTS.md) — do not duplicate root-level conventions.

## Purpose

All dashboard state hooks live here. Every hook persists to `localStorage` using a read→parse→validate→fallback pattern. No external state management — pure `useState`/`useRef`/`useCallback`.

## Hook Inventory

| Hook                     | Storage Key                       | Returns                          | Notes                                    |
|--------------------------|-----------------------------------|----------------------------------|------------------------------------------|
| `useDashboardData`       | —                                 | `data`, `connected`, polling     | Fetch loop with `AbortController`        |
| `useExpandState`         | `ez-dash-expanded`                | `expandedIds` Set, toggle/bulk   | Which project strips are open            |
| `useStripConfig`         | `dashboard-strip-config`          | `config`, toggle, reset          | Column visibility toggles               |
| `useProjectOrder`        | `dashboard-project-order`         | `orderedIds`, `columns`, reorder | DnD grid layout + column count           |
| `useProjectVisibility`   | `dashboard-project-visibility`    | `visibility`, isVisible, toggle  | Show/hide projects (default: visible)    |
| `useProjectPaneHeights`  | `dashboard-pane-heights`          | heights, set/release/get         | Per-pane max-height, min 150px           |
| `useDensityMode`         | —                                 | `DensityMode`                    | Auto: ≤5 comfortable, ≤10 dense, else ultra |
| `useSoundNotifications`  | `dashboard-sound-config`          | config, 4 play functions         | Web Audio API, ADSR envelopes            |

## Patterns

### localStorage Persistence
Every persisted hook follows identical structure:
1. `readPersistedX()` — parse JSON, validate shape, return default on failure
2. `persistX()` — `setItem` in try/catch (private browsing safe)
3. `useEffect` syncs state → storage on every change

### Polling (`useDashboardData`)
- `setTimeout`-based loop (not `setInterval`) — schedules next tick after response
- Connected: 2200ms interval. Disconnected: 3600ms backoff
- `AbortController` cancels in-flight requests on unmount
- Keeps stale data on error (never sets `data` to `null`)

### Sound System (`useSoundNotifications`)
- Lazy `AudioContext` creation via `getAudioContext()`
- `configRef` mirror keeps `useCallback` closures current without re-creation
- 4 sounds: waiting (portamento glide), allClear (3-note staccato), attention (2 pulses), question (descending)
- All use `applyADSR()` envelope helper for gain shaping
- Peak volume = `(volume / 100) * 0.06` — intentionally quiet
- AudioContext closed on unmount to release resources

## Gotchas

- `useDashboardData` uses `connectedRef` alongside `connected` state — the ref is read inside `tick()` to avoid stale closures
- `useProjectOrder.syncIds()` preserves existing order while appending new IDs — order-sensitive
- `useProjectPaneHeights` stores `null` for "released" (no max-height) vs `undefined` for "never set" — both resolve to `DEFAULT_HEIGHT` (400px)
- `useDensityMode` is the only hook with no localStorage — pure derived state from project count
