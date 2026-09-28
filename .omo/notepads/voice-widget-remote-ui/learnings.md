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
