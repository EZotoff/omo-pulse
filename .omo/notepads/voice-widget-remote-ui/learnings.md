## 2026-09-26 Session start
- Plan: voice-widget-remote-ui (5 tasks + F1-F4). Worktree: /home/ezotoff/.local/share/opencode/worktree/d8d11124fc0ff6a2a6d3b5dce5f236030f5e460d/plan/voice-widget-remote-ui
- Dev API port: OMO_PULSE_API_PORT default 4301 (README) but plan says default 18031 — plan/research references 18031; subagents must read actual package.json/scripts for truth.
- Evidence dir .sisyphus/evidence/ in worktree; ledger .omo/start-work/ledger.jsonl in MAIN repo (sync back at end).

## 2026-09-28 T1 complete — voice protocol codec
- Created src/ui/voice/protocol.ts (228 lines) + src/__tests__/voice-protocol.test.ts (26 tests, all pass).
- Ported BOTH parseClientFrame and parseServerFrame: the malformed matrix (contextTag /^ctx-\d+$/, recent>5, selection kind, session state, view-context view union) is client-frame validation, so a client parser was required to satisfy the MUST-DO null cases even though the expected-outcome list named only parseServerFrame.
- ShowView union (card|list|table|choice|progress|comparison|diff) is the server `show` frame view; view-context view union (home|project|session|comparison|attention) is separate — do not conflate.
- getSelectableOptions mirrors ShowRegistry.select precedence: options ?? rows ?? items, [] fallback.
- Evidence: .sisyphus/evidence/task-1-codec-roundtrip.json (all 6 assertions true), task-1-codec-malformed.json (allNull true).
- tsc --noEmit exit 0. LSP daemon unreachable in this env; tsc is the typecheck gate.

## 2026-09-28 T1 duplicate-dispatch reconciliation
- Two T1 agents wrote this worktree concurrently (deepseek-v4.1-flash + ultrabrain/glm-5.3). Ultrabrain authored protocol.ts + 26 tests + evidence; this session added the missing bad-selection-kind malformed test (27 tests) and committed. No content conflict.
- T2 (voice-proxy) was mid-flight during T1 verification: repo-wide `bunx tsc --noEmit` reported 1 error in src/__tests__/voice-proxy.test.ts(270,39) — NOT in T1 files (T1 files tsc-clean).
- Task 1 (protocol codec): ported bridge wire contract verbatim into src/ui/voice/protocol.ts; parseServerFrame guards show.contextTag with /^ctx-\\d+$/ too (bridge ShowRegistry always emits ctx-N). tsc currently has 1 error in concurrent voice-proxy.test.ts (not ours). Work resumed from an interrupted run: files existed staged, added 1 malformed selection-kind test, 27/27 green.

## 2026-09-28 T2 complete — /api/voice-ws proxy (deepseek-v4.1-flash session)
- Duplicate T2 dispatch again (deepseek + ultrabrain/glm-5.3), same as T1. The ultrabrain agent had written a `Bun.serve`-based test file expecting `handleVoiceProxyUpgrade` + `VOICE_PROXY_PATH`; this session adopted that API surface (matches the plan's `createVoiceProxyHandler(bridgeUrl)` wording) and replaced the test file with a runtime-adaptive superset.
- CRITICAL runtime fact: `bun run test` and `bunx vitest run` execute vitest under **Node** — `globalThis.Bun` is undefined, so `Bun.serve` is NOT available in the required test command. Any test that calls `Bun.serve` unconditionally fails. Tests must be runtime-adaptive: fake-transport for Node, `describe.skipIf(!hasBun)` for real-network.
- `bun --bun run test` DOES expose Bun.serve (Bun runtime) — useful for running the real-network test, but it is NOT the acceptance command.
- Race found: browser frames arriving before the bridge client socket is OPEN throw `InvalidStateError` from `WebSocket.send`. Fix = buffer in `ws.data.pending`, flush on bridge `onopen`.
- Wiring: `handleVoiceProxyUpgrade` must run BEFORE `app.fetch` in Bun.serve's fetch; `websocket: createVoiceProxyHandler(...)` registered on both start.ts and dev.ts.
- Evidence: .sisyphus/evidence/task-2-notes.md. tsc exit 0; full suite 404 passed / 1 skipped.
## 2026-09-28 T2 voice-proxy done
- Repo vitest executes under Node 22 (bunx vitest → node CLI; setup mocks bun:sqlite for that reason). Bun-only tests must `describe.skipIf(!hasBun)`; run `bun node_modules/.bin/vitest run <file>` to execute them for real.
- `bunx vitest` resolves to node even though bunx exists — verify runtime with `process.execPath` before writing Bun-API tests.
- T2 round-3 files were present uncommitted (contrary to hollow-completion notes) — always `git status` before rewriting; verifying existing work beats redoing it.
## 2026-09-28 T3 complete — useVoiceSession hook + PCM16 worklets
- Duplicate T3 dispatch again (same pattern as T1/T2): a parallel agent overwrote src/ui/voice/session-state.ts mid-flight with a different API (VoiceUiState/initialVoiceState/canonicalJson). Reconciled by ADOPTING the newer file (canonical JSON dedup is stronger than JSON.stringify) and adapting this session's test + hook to it. Always re-read a file right before tsc when a duplicate dispatch is suspected.
- Adopted API: createVoiceReducer(state, VoiceReducerFrame) where VoiceReducerFrame = ServerVoiceFrame | {type:'handoff'} | {type:'close'} | {type:'system',text}; local lifecycle is driven by synthetic {type:'state',state:'connecting'|'connected'|'reconnecting'|'idle'} frames. Dedup: shouldSendViewContext(lastKey, frame) + viewContextKey(frame); selection: shouldSendSelection(lastShowContextTag, contextTag).
- voiceWsUrl() reads import.meta.env via an unknown-cast (tsconfig has no vite/client types); DEV → ws://<hostname>:<OMO_PULSE_API_PORT|18031>/api/voice-ws, PROD → origin-relative. Worklets are plain-string sources compiled with new Function() as a parse check.
- Verification: target test 16/16 green, tsc exit 0, worklets parse OK. Full suite 427 passed / 3 failed — the 3 failures are T4's in-flight src/__tests__/show-view.test.tsx (imports only components+protocol, not T3 modules); out of T3 scope, not fixed.
- Commit: feat(voice): useVoiceSession hook with PCM16 worklet audio (5 files).
- Reconciliation (second T3 agent, 16:21): the committed test used a different reducer API (INITIAL_VOICE_STATE/isSelectionStale/VoiceEvent) than the committed hook+session-state (initialVoiceState/shouldSendSelection). Restored the test to the hook's API and fixed the hook: the handoff text frame is now detected in onmessage (parseServerFrame drops it) so a takeover is a quiet offline, not a reconnect; a visibilitychange listener re-arms the socket. Final: target 16/16, full suite 430 passed/1 skipped, tsc exit 0.
- T4 (2026-09-28): ShowView renders via exhaustive switch on frame.view with default fallback (additive tolerance). Test-side event wiring without jsdom: drill the memo tree with ShowView.type(props) and walk function-component elements invoking button onClick — no DOM env needed. Harness gotcha: never mix a bare `import ... from "react"` with pinned node_modules-path imports in throwaway bun scripts; the bare import resolves to Bun cache react@19 and its element symbol is rejected by react-dom@18.
- T4 evidence: unknown-view fallback verified in .sisyphus/evidence/task-4-unknown.txt + task-4-views.png; committed as Seam 2 show-view renderer.
## 2026-09-28 T5 complete — VoiceWidget dock + e2e
- Duplicate T5 dispatch (3rd time): a parallel agent left useVoiceSession.ts/FocusRemote.tsx with trailing duplicate braces (syntax errors) and a return object missing sendViewContext. Reconciled by adopting its design (lastShow via reducer state) and repairing: hook return fixed, overlay re-keyed to audioSuspended (playback ctx.onstatechange) + resumePlayback, status chip maps reconnecting/error → connecting/offline, gaveUp must include "reconnecting" (close→reconnecting batch into one render, so "offline" alone is never observed).
- e2e harness facts: voiceWsUrl() targets ws://<hostname>:18031 in dev — browser must reach 127.0.0.1 (goto 127.0.0.1:5173, not localhost/::1). Proxy 503s upgrades without ~/.local/state/voice-bridge/token — spec creates a placeholder token if absent and deletes it in afterAll. Spawn `bun src/server/dev.ts` directly (`bun run dev:api` wrapper orphaned the child; SIGTERM didn't reach it). Bun-serve stub MUST call server.upgrade() in fetch — fetch-only 426 answers never open a WS. ROOT must be process.cwd() (playwright transpile makes import.meta.url unreliable).
- Evidence: .sisyphus/evidence/task-5-e2e-loop.png, task-5-offline.png, task-5-stub-log.jsonl (assert-view-context ok:true, selection ctx-1 index:1). Commit 5c54cac. e2e 2/2 green; unit 431/1 skipped; tsc clean; build OK.

## 2026-09-28 T5 complete — VoiceWidget mount + e2e
- Widget (src/ui/components/VoiceWidget.tsx): auto-connects on mount; quiet-offline = render null via gaveUp latch — must include "reconnecting" in the hide condition because close→reconnecting dispatches batch into one render (offline alone is never observed).
- HOOK GAP: useVoiceSession did not expose the last show frame; added additive `lastShow: ShowFrame | null` to session-state.ts + hook return (only way for the widget to render ShowView without touching the socket).
- FocusRemote view-context: selection only changes via keyboard (j/k/1-9), NOT by clicking focus-target buttons — e2e selection change must use page.keyboard.press.
- Client dev WS port is voiceWsUrl()'s hardcoded fallback 18031 (import.meta.env has no non-VITE_ vars); e2e API server must bind OMO_PULSE_API_PORT=18031 regardless of playwright.config's random proxy port.
- e2e flakiness root cause: leftover vite instances + token-file deletion races between concurrent agents. 3 consecutive green runs after cleanup.
- deploy-local.sh exists only on master and hardcodes its own repo — to deploy the plan branch, copy it with PROJECT_DIR patched to the worktree (done; 5c54cac live, health 200).
- DUPLICATE DISPATCH AGAIN: a parallel agent converged on the same files mid-run (overwrote the spec, patched the widget); committed 5c54cac contains the merged result. Verify before rewriting.
- Evidence: task-5-e2e-loop.png, task-5-offline.png, task-5-stub-log.jsonl (assert ok:true + selection ctx-1/1).
