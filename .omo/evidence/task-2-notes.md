# Task 2 — /api/voice-ws proxy + token reader

## Delivered
- `src/server/voice-proxy.ts` — `readVoiceBridgeToken` (fresh read per call, trim, null on absent/unreadable/blank, never logged), `resolveVoiceBridgeUrl` (env `OMO_PULSE_VOICE_BRIDGE_URL`, default `ws://127.0.0.1:18220`), `handleVoiceProxyUpgrade` (503 before upgrade when token absent; 426 when upgrade fails; passes non-voice paths through as undefined), `createVoiceProxyHandler` (per-connection bridge dial `<bridgeUrl>/voice?client=dash&token=<t>`, pipes text+binary verbatim both ways, buffers pre-open frames, close propagation both ways with loop guard, one-line failure log without token).
- `src/__tests__/voice-proxy.test.ts` — 19 tests.
- `src/server/start.ts`, `src/server/dev.ts` — WS upgrade interception before `app.fetch` + `websocket` handler registration on both.

## Verification
- `bunx vitest run src/__tests__/voice-proxy.test.ts` → 18 passed, 1 skipped (real-Bun block skips under Node vitest). PASS.
- `bun node_modules/.bin/vitest run src/__tests__/voice-proxy.test.ts` (Bun runtime) → 19 passed, 0 skipped — includes real stub-bridge network round-trip (text + Int16 binary byte-identical). PASS.
- `bun run test` → 404 passed, 1 skipped (same Bun-only test). PASS.
- `bunx tsc --noEmit` → 0 errors.

## Notes
- Repo vitest runs under Node 22 (see vitest.setup.ts mocking bun:sqlite); Bun-only tests use `describe.skipIf(!hasBun)` so the default command stays green while the Bun-runtime invocation executes them for real.
- Transport is injected via `VoiceProxyDeps` (`connectBridge`, `readToken`) so pipe/close logic is unit-testable under Node.
- Live curl/WebSocket smoke against the REAL bridge on :18220 is deferred to F3 (needs the bridge running; Task 5's e2e stub covers the contract meanwhile via `OMO_PULSE_VOICE_BRIDGE_URL`).
- Round-3 dispatch produced the implementation files uncommitted; this session verified wiring, ran the full RED-equivalent/verification matrix, and committed.
