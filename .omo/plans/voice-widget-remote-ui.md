# Voice Widget + Seam 2 Show-View Renderer in the Remote UI

## TL;DR

> **Quick Summary**: Mount a voice widget in omo-pulse's remote/attention UI that connects to Vox through a server-proxied voice WSS (Seam 3 dash client class), emits view-context on navigation (Seam 1), and renders Vox's show frames as native cards/lists/choices with selection feedback (Seam 2).
>
> **Deliverables**:
> - Voice protocol types + frame codec (ported from the bridge's wire contract)
> - Server-side WS proxy `/api/voice-ws` (token stays server-side; remote phones reach the loopback-bound bridge)
> - `useVoiceSession` hook (PCM16 worklet audio, PTT, transcript/confirm/interrupt state, view-context + selection send)
> - ShowView renderer (7 views: card/list/table/choice/progress/comparison/diff)
> - VoiceWidget mounted in FocusRemote + e2e
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves + final verification
> **Critical Path**: T1 protocol → T2 proxy → T3 hook → T5 widget mount → F1-F4 → user okay

---

## Context

### Original Request
Contract pending-work rows (portable-supervisor-contract.md): "Voice widget + context feed in remote UI | omo-pulse | not started" and "Show-view renderer (Seam 2 frames) | omo-pulse | not started". Operator kicked off the follow-on batch 2026-09-26 ("proceed" after kick-off).

### Interview Summary
**Key Discussions** (operator delegated design via "proceed"; decisions recorded):
- **Connection topology (the load-bearing decision)**: the widget NEVER connects to the bridge directly. It connects origin-relative to omo-pulse's `/api/voice-ws`, which upgrades and pipes to `ws://127.0.0.1:18220/voice?client=dash&token=<boot token>` read server-side from `~/.local/state/voice-bridge/token`. Rationale: (a) the bridge binds loopback only, so a remote phone (`?remote=1` over LAN) cannot reach it — but it already reaches :4300; (b) the per-boot token never enters the browser or any static page — strictly better than the bridge's own HTML-injection pattern while staying within its "auth is server-side only" rule; (c) one code path for desktop and phone.
- **Prerequisite (external, already in flight)**: voice-bridge session `vb-token-persist` persists the per-boot token to `~/.local/state/voice-bridge/token` (0600). If absent, the proxy returns 503 and the widget renders disabled — feature degrades gracefully, never errors at the operator.
- **Audio**: mirror the bridge's own web client exactly — 16 kHz Int16 mono uplink / 24 kHz Int16 downlink binary frames, AudioWorklet capture/playback, PTT interaction, suspend overlay for autoplay policy.

**Research Findings**:
- Wire contract fully specified in `voice-bridge/src/server/protocol.ts` (ClientControlFrame: inputComplete/text/view-context/selection; ServerControlFrame: state/missed-audio/transcript/confirmation-pending/interrupt/error/ShowFrame; selection contextTag `ctx-N`).
- Bridge server accepts upgrade on `/ws` OR `/voice` with `?token=` and `?client=dash` (clientClass gating: only dash clients' view-context/selection are honored — main.ts:181-245).
- ShowFrame: `{type:"show", view: card|list|table|choice|progress|comparison|diff, title, contextTag, payload}` (voice-bridge/src/pipeline/show.ts:1-4); selection answers `{type:"selection", contextTag, index}`.
- Reference audio client: `voice-bridge/web/index.html` (worklets, PTT, reconnect, wake lock, suspend overlay).
- Dash mount surface: FocusRemote (attention/remote view; already hosts escalations section + selection state in useFocusRemoteControls).

### Momus High-Accuracy Review
**Round 2 — OKAY** (bg_3e23ee17, 2026-09-26, digest 8e8a417…): "Round-1 findings remain fixed... The tasks can proceed." Remaining risk (accepted, non-blocking): dev API server binds 127.0.0.1, so phone validation must ride the production endpoint, not the dev-only direct WS URL.

**Round 1 — REJECT** (bg_a123f5a2, 2026-09-26, digest 8e488e9…): 3 MAJOR findings, all addressed — (1) cited `src/ingest/attention-hidden.ts` did not exist → corrected to `src/server/attention-hidden.ts`; (2) dev WebSocket path conflicted with the no-vite-config guardrail (Vite `/api` proxy lacks `ws: true`) → dev now connects directly to the API-server origin (OMO_PULSE_API_PORT, default 18031) via `voiceWsUrl()`, WS handler registered on BOTH start.ts and dev.ts, vite.config untouched; (3) Task 4 QA scenario not executable → replaced with exact sample frames + assertions for all seven views.

### Metis Review
**Identified Gaps** (addressed):
- **Bridge down / token file stale (rotates per boot)**: proxy must read the token file fresh per connection attempt (no caching across boots); on bridge refusal the widget shows "voice offline", not an error banner. Widget reconnect with 1.5 s backoff mirrors the bridge client.
- **WS proxying through Hono**: Hono routes don't own the upgrade; Bun.serve needs a websocket handler at the server bootstrap (start.ts) with a per-connection pipe to a Bun WebSocket client. Task 2 is dedicated to this and must be verified with a real round-trip, not just an upgrade 101.
- **One active voice client (contract Seam 3)**: last connect wins, previous gets `{type:"handoff"}` close. The widget must tolerate handoff closes without error UI.
- **View-context freshness**: emit only while a voice session is active AND on change (dedup) — contract Seam 1. MVP emission points: focus/selection changes in FocusRemote.
- **No scope creep**: no mutation tools, no new deps, no bridge modifications beyond the launched token-persist task, no contract edits.
- **Autoplay policy**: first playback needs a user gesture — the PTT press IS the gesture; suspend overlay copied from the bridge client pattern.

---

## Work Objectives

### Core Objective
Give omo-pulse's attention/remote surface full-duplex voice with Vox through the contract's dash client class, plus native rendering of Vox's show frames with correlated selection feedback.

### Concrete Deliverables
- `src/ui/voice/protocol.ts` — frame codec + types (ported wire contract; no imports from the voice-bridge repo)
- `src/server/voice-proxy.ts` + wiring in `src/server/start.ts`/`api.ts` — `/api/voice-ws` transparent proxy (binary + text frames both directions, close propagation)
- `src/ui/hooks/useVoiceSession.ts` — connection lifecycle, audio worklets, PTT, state machine, view-context/selection senders
- `src/ui/components/ShowView.tsx` (+ CSS) — renderer for the 7 Seam-2 views with selection feedback
- `src/ui/components/VoiceWidget.tsx` (+ CSS) — mic button, status, transcript drawer, confirm chip; mounted in FocusRemote
- Unit tests (codec, proxy, hook logic) + Playwright e2e (loopback=text mode against a stub bridge)

### Definition of Done
- [x] `bun run test` passes (existing 359 + new)
- [x] `bunx tsc --noEmit` → 0 errors
- [x] Live: with voice-bridge.service running and token file present, `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" ... http://127.0.0.1:4300/api/voice-ws` completes a WS upgrade (101) and relays a `state` frame
- [x] Playwright: widget renders in remote view, connects through the proxy against a stub bridge, renders a `show` card, selection round-trips (`selection` frame observed by stub)
- [x] Token absent → proxy 503, widget shows disabled state, rest of remote UI unaffected

### Must Have
- Proxy reads `~/.local/state/voice-bridge/token` fresh per connection; token never appears in any client-visible payload, page, or log
- Graceful degradation at every layer: bridge down/token absent/handoff close → quiet offline state, no error banners
- 16 kHz Int16 uplink / 24 kHz Int16 downlink exactly per protocol.ts; binary frames passed through unmodified
- Selection feedback correlated by contextTag; stale tags (unknown ctx-N) silently dropped
- view-context emitted on change only, max recent 5, only while session active

### Must NOT Have (Guardrails)
- No direct browser→bridge connections (loopback token never exposed to the network beyond the workstation)
- No modifications to voice-bridge beyond the already-launched token-persist task; no contract edits
- No new runtime dependencies (AudioWorklet + native WebSocket only)
- No voice mutation/approval UI beyond displaying `confirmation-pending` state — confirm gates remain voice/bridge-side
- No recording, persistence, or logging of audio content or transcripts to disk
- Do not modify `vite.config.ts` or the build pipeline

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest unit + Playwright e2e)
- **Automated tests**: TDD for codec + proxy; tests-after for hook/UI wiring
- **Framework**: Vitest, Playwright, curl (upgrade smoke), systemd (live bridge)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.
- **Frontend/UI**: Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — upgrade smoke + frame relay

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (foundation, parallel):
├── Task 1: Voice protocol codec + types (TDD) [deep]
└── Task 2: /api/voice-ws proxy + token reader (TDD) [deep]

Wave 2 (after W1, parallel):
├── Task 3: useVoiceSession hook + audio worklets (depends: T1, T2) [unspecified-high]
└── Task 4: ShowView renderer (depends: T1 only) [visual-engineering]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── Task 5: VoiceWidget mount in FocusRemote + e2e (depends: T3, T4) [visual-engineering]
└── F1-F4 verification wave
```

### Dependency Matrix
- **Task 1**: [blocked by none] - [blocks T3, T4], wave 1
- **Task 2**: [blocked by none] - [blocks T3, T5], wave 1
- **Task 3**: [blocked by T1, T2] - [blocks T5], wave 2
- **Task 4**: [blocked by T1] - [blocks T5], wave 2
- **Task 5**: [blocked by T3, T4] - [blocks F1-F4], wave 3

### Agent Dispatch Summary
- **Wave 1**: **2** - T1 → `deep`, T2 → `deep`
- **Wave 2**: **2** - T3 → `unspecified-high`, T4 → `visual-engineering`
- **Wave 3**: **1** - T5 → `visual-engineering`
- **Wave FINAL**: **4** - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Voice protocol codec + types (TDD)

  **What to do**:
  - Create `src/ui/voice/protocol.ts`: port the wire contract from `~/AI_projects/voice-bridge/src/server/protocol.ts` into dash-owned types (no imports from the other repo): `ClientVoiceFrame` (inputComplete | text | view-context | selection), `ServerVoiceFrame` (state | missed-audio | transcript | confirmation-pending | interrupt | error | show), plus `parseServerFrame(raw: string): ServerVoiceFrame | null` and builders `buildViewContextFrame(...)`, `buildSelectionFrame(contextTag, index)` with the same validation rules the bridge enforces (contextTag `/^ctx-\d+$/`, recent max 5, selection kind union, view union, session state union).
  - Add `ShowViewData` helpers: per-view payload guards (`options`/`rows`/`items` arrays for choice/table/list — mirror `ShowRegistry.select` in voice-bridge/src/pipeline/show.ts:19-24) exposing `getSelectableOptions(payload): unknown[]`.
  - Tests FIRST in `src/__tests__/voice-protocol.test.ts`: valid frames of each type parse; malformed JSON / wrong unions / bad contextTag / recent>5 → null; builders produce frames the bridge's own `parseClientFrame` would accept (assert structurally identical to the bridge's examples).

  **Must NOT do**:
  - No imports from voice-bridge (copy the contract, don't link it); no audio handling here (pure codec).

  **Recommended Agent Profile**
  - **Category**: `deep` — TDD codec with a strict validation matrix against an external wire contract.
  - **Skills**: []

  **Parallelization**: Can run in parallel (Wave 1, with Task 2). Blocks T3, T4. Blocked By: none.

  **References**:
  - `~/AI_projects/voice-bridge/src/server/protocol.ts` (ENTIRE file, 94 lines) — the authoritative wire contract; port semantics exactly.
  - `~/AI_projects/voice-bridge/src/pipeline/show.ts:1-24` — ShowFrame shape + how selections index into options/rows/items.
  - `src/types.ts` — where shared UI types live; add voice types here OR in protocol.ts per repo convention (types.ts for cross-layer, protocol.ts for wire-local).

  **Acceptance Criteria**:
  - [ ] `src/__tests__/voice-protocol.test.ts` RED first, then GREEN (≥10 tests)
  - [ ] `bunx vitest run src/__tests__/voice-protocol.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: Codec round-trips against bridge examples
    Tool: Bash (bun one-liner)
    Steps: parse the literal example frames from protocol.ts (state, transcript, show card with ctx-3, confirmation-pending) → assert typed output; build a view-context frame → assert JSON.stringify equals the bridge-parsed canonical shape.
    Expected: all parse/build round-trips exact.
    Evidence: .sisyphus/evidence/task-1-codec-roundtrip.json
  Scenario: Malformed input rejected
    Tool: Bash (bun one-liner) — contextTag 'ctx-x', recent array of 6, view 'garbage' → all null.
    Evidence: .sisyphus/evidence/task-1-codec-malformed.json
  ```

  **Commit**: YES — `feat(voice): wire protocol codec for the bridge client` (protocol.ts + test)

- [x] 2. /api/voice-ws proxy + token reader (TDD)

  **What to do**:
  - Create `src/server/voice-proxy.ts`: `readVoiceBridgeToken(): string | null` (reads `~/.local/state/voice-bridge/token` fresh each call, trims, returns null on absent/unreadable — NEVER logs the value) and `createVoiceProxyHandler(bridgeUrl: string)` returning a Bun.serve websocket handler that, per connection: reads token; if null → close with 503 semantics before upgrade; opens a Bun `WebSocket` client to `<bridgeUrl>/voice?client=dash&token=<t>`; pipes binary AND text frames both directions verbatim; propagates close (including the bridge's `{type:"handoff"}` last-connect-wins close) both ways; cleans up on either side's close.
  - Wire into `src/server/start.ts`'s Bun.serve bootstrap AND `src/server/dev.ts` (the dev API server on `OMO_PULSE_API_PORT`, default 18031): route path `/api/voice-ws` — the upgrade interception happens BEFORE Hono's fetch (Hono does not own WS upgrades); all other paths pass through to the app unchanged. Proxy failures log a one-line reason WITHOUT the token.
  - DEV ROUTING (reconciled with the vite.config.ts guardrail — config stays untouched): Vite's `/api` proxy (vite.config.ts:19-21, no `ws: true`) cannot relay WebSockets, so in dev the widget connects DIRECTLY to the API server origin — `ws://<location.hostname>:<OMO_PULSE_API_PORT, default 18031>/api/voice-ws` (WebSockets are not CORS-blocked; the dev server performs no origin check). In production the widget connects origin-relative (`/api/voice-ws` on :4300). The URL choice lives in `voiceWsUrl()` (Task 3) keyed on `import.meta.env.DEV`; the WS handler registration must exist on BOTH servers (start.ts + dev.ts).
  - Tests FIRST in `src/__tests__/voice-proxy.test.ts`: token reader (present/absent/whitespace/permissions); proxy pipe against a local stub WSS server (Bun websocket server in-test): assert text frame round-trip, binary frame round-trip (Int16 payload byte-identical), close propagation both directions, 503-before-upgrade when token file absent.

  **Must NOT do**:
  - No token caching across connections (rotates per bridge boot); no token in any response body, header echo, or log line; no TLS/origin restrictions logic beyond what Bun.serve gives (loopback/LAN posture matches the existing service).

  **Recommended Agent Profile**
  - **Category**: `deep` — WS plumbing through the Bun bootstrap with real round-trip tests; subtle lifecycle work.
  - **Skills**: []

  **Parallelization**: Can run in parallel (Wave 1, with Task 1). Blocks T3, T5. Blocked By: none (token file consumed at runtime; the bridge-side persist task lands independently).

  **References**:
  - `src/server/start.ts` — Bun.serve bootstrap to modify (upgrade interception + websocket handler registration).
  - `~/AI_projects/voice-bridge/src/server/main.ts:76-204` — how the bridge validates token + upgrades on /voice with client=dash; the proxy must satisfy exactly this.
  - `~/AI_projects/voice-bridge/web/index.html:176-201` — reference client: ws.binaryType='arraybuffer', reconnect posture, close semantics.
  - `src/server/attention-hidden.ts` — repo pattern for small read-only file helpers with fail-soft catch (verified on disk).

  **Acceptance Criteria**:
  - [ ] `src/__tests__/voice-proxy.test.ts` RED→GREEN (≥6 tests incl. binary round-trip + close propagation + absent-token 503)
  - [ ] `bun run test` → PASS

  **QA Scenarios**:
  ```
  Scenario: Live upgrade + relay
    Tool: Bash (curl + voice-bridge.service running)
    Steps: 1) verify token file exists; 2) curl websocket-upgrade handshake to http://127.0.0.1:4300/api/voice-ws → expect 101; 3) read first relayed frame → expect the bridge 'state' JSON.
    Expected: 101 + relayed state frame.
    Evidence: .sisyphus/evidence/task-2-live-upgrade.txt
  Scenario: Token absent → refused
    Tool: Bash (curl)
    Steps: temporarily move the token file (restore after!) → handshake → expect refusal (non-101, 503-family) and no crash of the API server (health check 200 after).
    Evidence: .sisyphus/evidence/task-2-token-absent.txt
  ```

  **Commit**: YES — `feat(server): origin-relative voice WSS proxy with server-side token` (voice-proxy.ts, start.ts wiring, test)

- [x] 3. useVoiceSession hook + audio worklets

  **What to do**:
  - Create `src/ui/voice/capture-worklet.ts` + `playback-worklet.ts` (plain-string worklet sources loaded via Blob URLs, mirroring the bridge client's approach in web/index.html — 16 kHz Int16 mono capture chunked, 24 kHz Int16 playback queue).
  - Create `src/ui/hooks/useVoiceSession.ts`: connects via `voiceWsUrl()` (dev: direct `ws://<hostname>:18031/api/voice-ws` per Task 2's routing note; prod: origin-relative) with native WebSocket, binaryType arraybuffer; exposes an explicit return type: `{ state, transcript, confirmationPending, lastInterrupt, error, connect, disconnect, startCapture, stopCapture, sendText, sendViewContext, sendSelection }`. State machine mirrors the bridge frames: idle/connecting/connected/reconnecting/error/offline; reconnect with 1.5 s backoff while wanted and document visible; `{type:"handoff"}`-adjacent close → quiet offline (no error UI). Transcripts append (role+text), missed-audio surfaced as a system line. view-context sender dedups by structural JSON equality and only sends while connected (contract Seam 1). Selection sender drops stale contextTags client-side after checking against the last show frame the hook saw.
  - Audio lifecycle: getUserMedia on startCapture (the user gesture), worklet pipe to ws; playback worklet enqueues downlink Int16; suspend/resume overlay handling stays in the widget (Task 5), hook exposes an `unlocked` flag after first gesture.
  - Unit-testable seams: extract `createVoiceReducer(state, frame)` pure reducer + dedup logic into `src/ui/voice/session-state.ts` and TDD those; the hook wires them to effects.

  **Must NOT do**:
  - No persistence of audio/transcript anywhere; no direct bridge URL (always origin-relative proxy path); no new deps; no SSE/realtime-bus entanglement.

  **Recommended Agent Profile**
  - **Category**: `unspecified-high` — complex async lifecycle, but patterned on two strong references.
  - **Skills**: []

  **Parallelization**: Wave 2 (with Task 4). Blocks T5. Blocked By: T1, T2.

  **References**:
  - `~/AI_projects/voice-bridge/web/index.html:132-360` — THE reference implementation (connect/reconnect, capture/playback worklets, PTT semantics, suspend overlay, loopback=text mode). Mirror its structure; do not copy pixel styling.
  - `src/ui/hooks/useDashboardData.ts` — repo doctrine for setTimeout loops, AbortController, refs to avoid stale closures, keep-last-good-on-error.
  - `src/ui/voice/protocol.ts` (Task 1) — frame types; the hook consumes parseServerFrame for every text frame.
  - Contract Seam 1 (ez-omo-config docs/portable-supervisor-contract.md) — view-context emission rules (on change, dedup, compact, only while session active).

  **Acceptance Criteria**:
  - [ ] `src/__tests__/voice-session-state.test.ts` RED→GREEN (reducer: state frames, transcript append, confirmation toggle, interrupt, error, handoff-close → offline; dedup: identical view-context not re-sent; stale selection dropped)
  - [ ] `bunx tsc --noEmit` → 0

  **QA Scenarios**:
  ```
  Scenario: Reducer contract vs bridge frames
    Tool: Bash (vitest run) — feed literal frame sequences; assert final states.
    Evidence: .sisyphus/evidence/task-3-reducer.txt
  Scenario: Hook wiring smoke (stub ws)
    Tool: Playwright later in Task 5 (documented here as dependency); unit coverage stays at reducer level.
    Evidence: deferred to task-5 e2e artifacts.
  ```

  **Commit**: YES — `feat(voice): useVoiceSession hook with PCM16 worklet audio` (worklets, session-state.ts, hook, test)

- [x] 4. ShowView renderer (Seam 2) [visual-engineering]

  **What to do**:
  - Create `src/ui/components/ShowView.tsx` + `ShowView.css`: render `{view, title, contextTag, payload}` for all 7 views: card (single item emphasis), list (rows), table (rows w/ columns), choice (numbered options, tappable), progress (steps/percent from payload), comparison (two-column), diff (added/removed lines from payload). Unknown view → neutral fallback card with raw payload (additive tolerance). Each rendered instance carries `data-context-tag`.
  - Selection: choice (and table/list where options exist) index taps invoke `onSelect(contextTag, index)`; the widget (Task 5) routes that to `sendSelection`. Numbered `Q`-style affordance matches the 1-9 keyboard convention already in useFocusRemoteControls.
  - Design tokens from `src/styles/tokens.css` only; compact sizing suitable for both desktop panel and phone remote; memoized.

  **Must NOT do**:
  - No business logic, no lifecycle decisions, no mutation affordances — pure rendering + onSelect callback. No hardcoded rgba.

  **Recommended Agent Profile**
  - **Category**: `visual-engineering` — rendering + styling domain.
  - **Skills**: [`frontend`]

  **Parallelization**: Wave 2 (with Task 3). Blocks T5. Blocked By: T1 only.

  **References**:
  - `src/ui/components/FocusRemote.tsx:21-100` — escalations card patterns (clamping, ordering, tokens) to visually match.
  - `src/styles/tokens.css` — token source.
  - `~/AI_projects/voice-bridge/src/pipeline/show.ts:1-24` — view union + payload conventions (options/rows/items).
  - Contract Seam 2 — frame semantics, contextTag correlation, stale-tag dropping.

  **Acceptance Criteria**:
  - [ ] Component test (renderToStaticMarkup, mirroring project-strip-history.test.tsx pattern) for ≥4 views + unknown-view fallback + onSelect wiring
  - [ ] tsc 0 errors

  **QA Scenarios**:
  ```
  Scenario: All seven views render with sample payloads
    Tool: Bash (vitest render tests) + screenshot via a throwaway HTML harness in /tmp/opencode (not committed).
    Steps — for EACH view, render with the exact sample frame and assert the listed observable:
      1. card:    {view:"card", contextTag:"ctx-1", title:"SESSION", payload:{items:[{label:"ez-omo-dash", status:"question"}]}} → asserts .showview-card + text "ez-omo-dash".
      2. list:    {view:"list", contextTag:"ctx-2", title:"OPEN ITEMS", payload:{items:[{label:"Q1"},{label:"Q2"}]}} → asserts exactly 2 .showview-row elements.
      3. table:   {view:"table", contextTag:"ctx-3", title:"QUOTAS", payload:{rows:[{name:"Z.AI", used:"40%"},{name:"Kimi", used:"12%"}]}} → asserts a <table> with 2 data rows and a "Kimi" cell.
      4. choice:  {view:"choice", contextTag:"ctx-4", title:"DB OPTIONS", payload:{options:[{label:"Qdrant"},{label:"SQLite"}]}} → asserts 2 numbered option buttons; clicking option 2 fires onSelect("ctx-4", 1).
      5. progress:{view:"progress", contextTag:"ctx-5", title:"DEPLOY", payload:{steps:["build","rsync","restart"], done:2}} → asserts 3 step markers, 2 in done state.
      6. comparison: {view:"comparison", contextTag:"ctx-6", title:"A vs B", payload:{left:{label:"A", items:["x"]}, right:{label:"B", items:["y"]}}} → asserts two labeled columns with one item each.
      7. diff:    {view:"diff", contextTag:"ctx-7", title:"PATCH", payload:{lines:[{kind:"add",text:"+port"},{kind:"del",text:"-path"}]}} → asserts one .add and one .del line.
    Expected: every view renders its observable; harness screenshot shows all seven side by side.
    Evidence: .sisyphus/evidence/task-4-views.png + vitest output
  Scenario: Unknown view tolerated
    Tool: vitest — view: 'hologram' (unknown) → fallback card, no throw.
    Evidence: .sisyphus/evidence/task-4-unknown.txt
  ```

  **Commit**: YES — `feat(ui): Seam 2 show-view renderer` (ShowView.tsx/.css, test)

- [x] 5. VoiceWidget mount in FocusRemote + e2e [visual-engineering]

  **What to do**:
  - Create `src/ui/components/VoiceWidget.tsx` + CSS: a compact voice dock for FocusRemote — connect toggle, status chip (connecting/connected/offline states from the hook), PTT-style talk button (pointerdown/pointerup capture, mirroring the bridge client's touch-action handling), confirm-pending chip, collapsible transcript drawer, last show frame rendered via ShowView with selection routed to `sendSelection`, suspend overlay when AudioContext is suspended. Hidden entirely (renders null) when the proxy reports unavailable on first connect attempt AND bridge is not running — quiet offline.
  - Wire view-context: FocusRemote already owns selection/focus state (useFocusRemoteControls) — build the ViewContextFrame from current focus (view: "attention", project/session from selected target, recent from the attention ranking top-5) and call `sendViewContext` on changes (deduped by the hook).
  - Playwright e2e `tests/e2e/voice-widget.spec.ts`: spin a STUB bridge (tiny Bun ws server in the test, per Task 2's test pattern) + run the app with `OMO_PULSE_VOICE_BRIDGE_URL` pointing at the stub; assert: widget connects (status chip 'connected'), stub receives a view-context frame after navigating selection, stub sends a `show` choice frame → card renders → tap option 2 → stub receives `{type:"selection", contextTag, index:1}`; screenshot. Loopback=text mode for the text path; audio path verified only by unit seams (no mic in CI).
  - Deploy/restart per repo convention (build + service restart + health check).

  **Must NOT do**:
  - No confirm/approve buttons (display-only confirmation-pending chip); no audio assertions in e2e; no modification of FocusRemote's existing sections beyond mounting the dock + view-context wiring.

  **Recommended Agent Profile**
  - **Category**: `visual-engineering` — widget UI + e2e.
  - **Skills**: [`frontend`]

  **Parallelization**: Wave 3 (alone). Blocks F1-F4. Blocked By: T3, T4.

  **References**:
  - `src/ui/components/FocusRemote.tsx` — mount point; existing hooks usage; escalations section as the styling sibling.
  - `src/ui/hooks/useFocusRemoteControls.ts` — selection state feeding view-context.
  - `~/AI_projects/voice-bridge/web/index.html:102-131` — widget layout reference (chips, PTT, transcript, overlay).
  - `tests/e2e/dashboard.spec.ts` — Playwright conventions (baseURL, ports).
  - Contract Seam 1/2/3 — emission, correlation, client-class rules.

  **Acceptance Criteria**:
  - [ ] e2e passes: connect → view-context received by stub → show frame rendered → selection round-trip
  - [ ] `bun run test` + `bunx tsc --noEmit` + `bun run build` all green; service restarted and healthy

  **QA Scenarios**:
  ```
  Scenario: Full widget loop against stub bridge
    Tool: Playwright (stub bridge on a free port)
    Steps: open remote view → widget connects → change selection → stub asserts view-context frame content → stub emits show(choice, ctx-1, 2 options) → assert card + options rendered → tap option 2 → stub asserts selection frame {contextTag:'ctx-1', index:1}.
    Expected: every assertion binary-passes; screenshot captured.
    Evidence: .sisyphus/evidence/task-5-e2e-loop.png + stub log
  Scenario: Bridge absent → quiet offline
    Tool: Playwright (no stub)
    Steps: open remote view → widget shows offline state (or hides) → NO error banner; rest of remote UI functional.
    Evidence: .sisyphus/evidence/task-5-offline.png
  ```

  **Commit**: YES — `feat(ui): voice widget dock with context feed and show rendering` (VoiceWidget.tsx/.css, FocusRemote wiring, e2e)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Must Have vs implementation; Must NOT Have patterns searched (token leakage, direct bridge URLs in client code, new deps, audio/transcript persistence); evidence files present.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  `bunx tsc --noEmit` + `bun run test` + slop review of changed files.
  Output: `Build [PASS/FAIL] | Tests [N/N] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Every QA scenario from every task from clean state; live-bridge upgrade smoke; stub-bridge e2e; token-absent degradation; integration pass. Evidence to `.sisyphus/evidence/final-qa-voice/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Task-by-task diff vs spec; cross-task contamination; guardrail compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | VERDICT`

---

## Commit Strategy
Task-level commits YES per repo agent-git workflow; Conventional Commits; no pushes without explicit operator authorization (master is PR-gated).

## Success Criteria

### Verification Commands
```bash
bun run test        # all pass
bunx tsc --noEmit   # 0 errors
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" http://127.0.0.1:4300/api/voice-ws   # 101 + relayed state frame (bridge running)
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass

## Execution Record

Execution baseline: f22f3d1e997c04b4d2ffe63dfa43f74061138962
F#1: APPROVE — Must Have 5/5, Must NOT Have 6/6, Tasks 5/5; file:line-cited audit (ses_f177e1f04ffeonksxMuQ3XD3v8)
F#2: APPROVE — Build PASS, 431/432 tests, 0 CRITICAL, 3 info findings (ses_f177eb8edffewo6HkfwoklVSxC)
F#3: APPROVE — 5/5 scenarios, 2/2 integration; 503-degradation + real-proxy round-trip PASS; evidence .sisyphus/evidence/final-qa-voice/ (ses_f177f395bffeLRh1QY4n5vZvbX)
F#4: APPROVE — Tasks 5/5 compliant, deviation accepted (lastShow exposure necessity), Contamination CLEAN (ses_f177d7a0fffeVdBphiqN0CbLCq)
F#3: APPROVE — independent re-wave (Atlas): REJECT→fix (raw 101 capture live-upgrade-101.txt)→re-verdict APPROVE 5/5+2/2 (ses_f17752e88ffe71Ic3wi46I11uw); corroborates F1/F2/F4 second-wave APPROVE
