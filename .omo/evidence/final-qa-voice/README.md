# F3 — Real Manual QA: voice-widget-remote-ui

- Worktree: `/home/ezotoff/.local/share/opencode/worktree/d8d11124fc0ff6a2a6d3b5dce5f236030f5e460d/plan/voice-widget-remote-ui`
- HEAD: `b2d1a9a` (plan/voice-widget-remote-ui), clean tracked tree
- Run: 2026-09-28 16:53–16:56 CEST, clean-state replay (no repo source modified)
- Verdict: **APPROVE**

## Scenario results — 5/5 pass

| # | Scenario | Command | Result | Evidence |
|---|----------|---------|--------|----------|
| 1 | Unit/reducer/codec/proxy/component suites | `bun run test` | 44 files, **431 passed / 1 skipped**, exit 0 | `01-unit-tests.log` |
| 2 | Stub-bridge e2e | `bunx playwright test tests/e2e/voice-widget.spec.ts` | **2 passed** (5.7s) | `02-e2e-stub.log`, `02-task5-*` |
| 3 | Token-absent live degradation | `curl` WS upgrade → `:4300/api/voice-ws` | **HTTP 503** `voice bridge token unavailable`; health **200** after | `03-token-absent-live.log` |
| 4 | Stub round-trip through real proxy | e2e re-run + direct raw-WS probe | e2e **2 passed**; **DIRECT_PROXY_ROUNDTRIP=PASS** | `04-e2e-realproxy.log`, `04-stub-log.jsonl`, `04b-direct-proxy.log` |
| 5 | Production build | `bun run build` | exit 0, `dist/assets/index-DuBGtkjZ.js` | `05-build.log` |

Extra: `bunx tsc --noEmit` exit **0** (`05b-tsc.log`).

## Integration checks — 2/2

1. **Live token-absent degradation** (scenario 3): token file absent for the
   duration; the deployed `:4300` proxy returned a clean `503` (not a crash,
   not a 500) with the exact body `voice bridge token unavailable`, and
   `/api/health` stayed `200`. This is the plan's compliant degradation path.
2. **Real-proxy stub round-trip** (scenario 4): stub bridge reached *through*
   the real `voice-proxy.ts` (spawned via `src/server/dev.ts` with
   `OMO_PULSE_VOICE_BRIDGE_URL` override). Stub log confirms
   `view-context` frame validated (`ok:true`) and the `selection
   {contextTag:"ctx-1", index:1}` frame arrived. Direct raw-WebSocket probe
   independently reproduced open → view-context → `show` → selection.

## Environment notes (not defects)

- **Live `:4300` runs the current build.** Production install
  `~/.local/share/omo-pulse/dist/assets/index-DuBGtkjZ.js` is byte-identical
  (300643 bytes) to this worktree's fresh build, and the install contains
  `src/server/voice-proxy.ts` + `voice-ws` route → no "deploy pending".
- **Token file flaps.** `~/.local/state/voice-bridge/token` was absent at
  scenario 3 and at 16:56, present transiently at ~16:55 (external persist
  task in flight). My live checks observed the absent→503 branch; the
  present→101 branch is consistent with `voice-proxy.ts` but was not observed
  by this reviewer's own clean curls.
- **Restore:** no token created by this run survived (direct probe created one
  at 16:55 and removed it); final state matches initial (absent). All
  processes started by this run were SIGTERM/SIGKILLed and PIDs logged in the
  scenario logs. A `bun src/server/dev.ts` (pid 2170199) present at teardown
  was NOT started by this run — left untouched.
- Pre-existing files in this dir (`gates.txt`, `live-upgrade.txt`,
  `scenario-*.txt`, `playwright.log`, `task-5-*.png`) were written by a
  concurrent F3 run/agent, not this reviewer; not relied upon here.

## Verdict

`F3 VERDICT: APPROVE — clean-state replay all green: 431/1 unit, 2/2 e2e, 503+200 degradation, real-proxy round-trip PASS, build exit 0.`
`Scenarios [5/5 pass] | Integration [2/2]`
