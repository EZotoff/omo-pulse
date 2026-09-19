# Handoff: focus-next endpoint + remote list key controls (omo-pulse)
- emitted: 2026-09-19 00:55 CEST | source session: opencode (ez-omo-dash, central dev session) | source head: 7917695 on feat/project-list-mode, dirty (~18 files: concurrent agent WIP in src/server/dev.ts, src/ui/hooks/*, per-session-timeseries work — NOT yours, do not touch or commit)
- supersedes: none

## Mission
Add fast no-voice navigation to the Focus Remote: a "next" button/command + API endpoint
that focuses the top attention item in the terminal viewer, plus keyboard controls over
the attention list that prefigure tapxr 4-way navigation in the future AR interface.
Done-condition: `POST /api/focus/next` switches the omo-focus viewer to the top-ranked
attention session; the remote UI (`/?view=remote`) has a Next button and a working
keyboard map (j/k or arrows to move, Enter/Space to focus, digits 1-9 for direct
selection); vitest + build green; feature verified live against `127.0.0.1:4300`.

## Entry artifacts (read these first)
1. `docs/ROADMAP.md` — what shipped today (focus flow, attention ranking) and what this
   feature is for (fast navigation, pre-voice, pre-tapxr).
2. `src/ingest/attention.ts` — attention ranking (question > error > awaiting-input >
   plan_complete > working); `buildAttentionPayload` returns projects pre-sorted by
   urgency; `next` per project; `queue` = items behind next.
3. `src/server/api.ts` (GET /attention, POST /focus/:sourceId/:sessionId) and
   `src/server/focus.ts` — the exact pattern to extend for the new endpoint.
4. `src/ui/components/FocusRemote.tsx` + `src/ui/hooks/useAttention.ts` — remote UI where
   the Next button and keymap live; hover-prewarm wiring already present.
5. `scripts/focus-session.sh` + `scripts/focus-viewer.sh` — the terminal side (single-
   attach FIFO viewer; do NOT touch; tab-viewer parked, see gotchas).
6. `~/ez-omo-config/docs/portable-supervisor-contract.md` — context only; this feature is
   omo-pulse-local, no contract change needed.

## State
- Done (commits on feat/project-list-mode, all local — nothing pushed):
  - a271cb5 attention ranking module + tests; b5a8340 types dedup into src/types.ts
  - 3280c17 GET /api/attention + POST /api/focus; 6d3999a FocusRemote UI + hook
  - 1de45db focus-remote launcher (Chrome app window); df7dd70 strip header width fix
  - 44e299c+76620d6 proven single-attach viewer restored; tab-viewer WIP preserved at
    `git show 8dd2fb4:scripts/focus-viewer-tabs.wip.sh` (blocked, see gotchas)
  - b34e1ce expanded view retired; 7917695 roadmap: voice integration is next milestone
- In flight: nothing. This handoff starts the next unit.
- Known gotchas / landmines:
  - **Deploy discipline**: port 4300 runs an INSTALLED copy at `~/.local/share/omo-pulse`.
    After changes: `bun run build`, then `rsync -a --delete src/ ~/.local/share/omo-pulse/src/`,
    same for `dist/` and `scripts/`, then `systemctl --user restart ez-omo-dash.service`,
    then curl `/api/health`.
  - **Concurrent WIP in tree**: tsc has ~9 pre-existing errors in dashboard.ts /
    useDashboardData / useProjectOrder / project-strip-history.test (projectListMode
    agent's work) — not yours; don't fix, don't commit their files.
  - **Never `pkill -f <plain-name>`** for anything whose name appears in your own
    command line — it self-kills the shell. Use bracketed patterns like `[o]moPulseFocus`.
  - **X11 quirks**: DISPLAY is `:1` (auto-detect exists in scripts); use
    `XAUTHORITY=/run/user/1000/gdm/Xauthority` for wmctrl from tool shells.
  - **Viewer**: single-attach design (FIFO swap). Hover-prewarm (`?mode=prewarm`) is a
    no-op by design until the tab viewer lands — keep it that way.
  - **open /api/attention sorts projects by urgency already**; "top item" = first project
    with `next != null` in that array. No re-ranking needed client-side.

## Next steps
1. **Endpoint** `POST /api/focus/next` in `src/server/api.ts` (route after /focus):
   build attention payload (reuse `multiProjectService.getMultiProjectPayload()` +
   `buildAttentionPayload`), take the first project with `next != null`, call
   `focusSession(project.projectRoot, next.sessionId)`.
   - Optional query `?skip=N` (default 0): skip the first N attention entries across the
     flattened list — designed for future cycling; v1 UI sends nothing.
   - Empty attention list → `{ ok: true, action: "nothing-pending" }` (200), not an error.
   - Done-condition: curl POST returns queued and the viewer shows the top session.
2. **Tests** in `src/__tests__/attention.test.ts` (or new file): skip-flattening order,
   nothing-pending case. Run `npx vitest run` — full suite green (299+).
3. **UI — Next button**: in `FocusRemote.tsx`, a persistent "▶ NEXT" button above the
   card list → POST `/api/focus/next`; same optimistic pattern as FocusTargetButton
   (busy flag, inline error). Disabled-look when `allClear`.
4. **UI — keyboard map** on `?view=remote` (window keydown listener in FocusRemote):
   - `n` → POST /api/focus/next
   - `j` / `ArrowDown`, `k` / `ArrowUp` → move a visual selection cursor over attention
     cards (roving highlight, reuse the urgent/target styling with a selection ring)
   - `Enter` / `Space` → focus the selected card's session (same POST as its button)
   - digits `1..9` → select+focus the Nth attention card directly
   - `Escape` → clear selection
   - Ignore key handling when modifiers held or when a text input has focus (none exist
     in this view today, but guard anyway).
   Done-condition: tab through the map in a real browser (agent-browser) without mouse.
5. **tapxr note**: add one line to `docs/ROADMAP.md` under Planned that this keymap is the
   semantic pre-implementation of tapxr 4-way navigation (n/enter ≈ next/act, j/k ≈
   up/down). No contract change required.
6. **Deploy + verify live**: build, rsync src/dist (scripts unchanged), restart service,
   health check, click through the remote at `/?view=remote`, verify the viewer window
   switches. Report evidence.
7. **Commit** in Conventional Commits (`feat(server): focus-next endpoint`,
   `feat(ui): remote next button + keyboard map`) — do NOT commit files outside your
   scope (see dirty-tree warning).

## Added scope since emit (2026-09-19 evening) — include in this unit
1. **Queue view toggle — DONE** (032f160): `sessions: AttentionSession[]` on
   AttentionProject; global top/all toggle + per-project chevron in the remote;
   "+N more waiting" is now a clickable expand button.
2. **Autonomous-session filtering — DONE** (032f160): Tier-1 = parent_id filter
   (subagent children, multi-project.ts). Tier-2 heuristics were REJECTED by evidence
   (human TUI prompts ALSO carry model metadata; short-prompt heuristics hide real
   sessions). Instead: operator-controlled hiding — ✕ on any remote card →
   POST /api/attention/hide/:sessionId, persisted in attention-hidden.json next to the
   sources registry; "N hidden — show hidden" footer restores. Keep this mechanism; do
   NOT add heuristics on top.
3. **FIFO viewer redesign — DONE** (commit "single-consumer FIFO viewer loop"): the
   watchdog subshell could die and strand requests in the FIFO buffer (observed: hours-
   long stall). Replaced with single-threaded `read -t 0.5` poll on fd8 — no subshell,
   no pending file. Verified live: POST → attach swap → warm. Prewarm is a no-op in
   this design (focus-session.sh exits "skipped"); it activates with the tab viewer.
4. **Fixed in passing**: duplicate omo-focus app entry (autostart .desktop now
   NoDisplay=true); focus remote status colors now canonical `--status-*` tokens
   (ef0011c). Cosmetic, unowned: QuotaStrip right column (OpenAI/Kimi) icon left edges
   differ ~28px (favicon width variance, pre-existing) and the header zoom cluster is
   tight — low-priority polish if touching the header anyway.

## Prohibitions
- Do not touch: `src/server/dev.ts`, `src/ingest/per-session-timeseries.ts`, anything in
  the dirty WIP set (other agent's projectListMode work), `vite.config.ts`, `scripts/
  focus-*.sh` (viewer is proven — regressions there cost hours), `src/server/dashboard.ts`
  beyond imports if even that.
- Do not implement server-side cursor state for cycling (stateless `?skip=N` only).
- Do not change the attention ranking order or the FIFO viewer.
- Do not start the voice-bridge work (Seam 1/2) — that is a separate, contract-first slice.
- No new dependencies.
