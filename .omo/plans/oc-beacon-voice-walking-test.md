# OC Beacon Voice Walking-Test — Implementation Plan

> Spec: portable-supervisor-contract.md "Amendment 2026-10-08" (ez-omo-config 9786a00).
> Status: GO (operator, 2026-10-08, transport option (a)). T0 CLOSED: tailscale serve --bg --https=4300 -> 127.0.0.1:4300 live (health 200 over tailnet; clientClass 400-validation verified through the proxy). T2 DONE: stack = OkHttp (okhttp3.WebSocket + DshWebSocketOpener injection pattern to mirror); config in data/api/. T1 DONE (18/18 tests; bridge protocol.ts outranked the older web reference on handoff+views; bridge requires project/session/recent in view-context — app will always populate). Wave 1 DONE + committed oc-beacon 4a88fdc01 (24 voice tests; full app suite 4038/0; manifest RECORD_AUDIO added; URL via connect() pending a setting). Wave 2 DONE + committed oc-beacon a68d06daa (worker died at ~5min mark mid-settings; orchestrator verified completion — everything existed, suite green — and applied review fixes: exponential backoff by consecutive failures, frames DROP_OLDEST). Review verdict PASS (0 CRITICAL, 4 WARNING — 2 fixed, 2 known-latent: codec nullability, empty project/session fallback). Wave 3 APK DONE: fresh dev+stable APKs served at :18445 (delivery dir is manual-copy, no gradle task). Pushed to ezotoff remote (a68d06daa); origin=collaborator remote untouched. NEXT: operator on-device dogfood.
> Repos touched: ~/src/oc-beacon (all tasks), verification probes may touch nothing else.

## Wave 0 — Foundations & verification (parallel)

### T0: Phone→omo-pulse reachability probe (BLOCKING GATE)
- **Risk being retired**: omo-pulse `start.ts` binds `hostname: "127.0.0.1":4300` — loopback only. The amendment assumes the phone reaches it "over Tailscale/LAN". Something must proxy (tailscale serve?) or the whole transport ruling needs revisit.
- Do: check `tailscale serve status` / any existing proxy to :4300; if none, options: (a) tailscale serve proxy → localhost:4300, (b) bind change (security decision — loopback is deliberate), (c) LAN bind on tailscale interface only. Surface to operator if not (a)-trivial.
- Done-condition: phone Chrome can open `http(s)://<host>/api/health` on the omo-pulse service.

### T1: Frame codec (pure Kotlin, immediately testable)
- Create `data/api/voice/VoiceFrames.kt`: ClientControlFrame (view-context / selection), ServerControlFrame (state / missed-audio / transcript / confirmation-pending / interrupt / error / handoff / show), ShowFrame with 7 views (card|list|table|choice|progress|comparison|diff) + contextTag. Mirror `voice-bridge/src/server/protocol.ts` and omo-pulse `src/ui/voice/protocol.ts` semantics; binary audio frames are raw PCM16 payloads, distinct from JSON control frames per the bridge wire contract.
- Tests: `app/src/test/.../VoiceFramesTest.kt` — round-trip, unknown-view tolerance, stale-tag passthrough.

### T2: Survey WS + settings surface
- Read `data/api/dsh/DshWsEventClient.kt` + `DshRemoteMuxEngine.kt`: identify the WS stack (OkHttp vs Ktor) — the voice client MUST reuse it. Identify where connection URLs/config live (settings/server screens, `data/…` storage) and how to add an omo-pulse base URL field.
- Done-condition: written answers (stack, config insertion point) recorded in the executing session; no code yet.

## Wave 1 — Voice plumbing (parallel after T1+T2)

### T3: VoiceWsClient
- `data/api/voice/VoiceWsClient.kt`: WSS to `{omoPulseUrl}/api/voice-ws?clientClass=beacon`; reuses T2's stack; binary PCM16 up/down; JSON control frames via T1 codec; reconnect with 1.5s backoff; on `{type:"handoff"}` close → terminal Handoff state, NO auto-reconnect (amendment item 1); reconnect happens on next explicit PTT press.
- Tests: fake WS server (follow DshWsEventClient test pattern) — connect, frame round-trips, handoff terminal state, backoff.

### T4: Audio engine
- `data/voice/VoiceAudioEngine.kt`: AudioRecord (16 kHz mono PCM16) → binary frames while PTT held; AudioTrack (24 kHz PCM16) playback; audio-focus handling; clean start/stop with no leaked buffers. Manifest: add `RECORD_AUDIO`; runtime permission request lives in the UI (T7).
- Tests: engine behind an interface; stub recorder/player; verify PTT gating and no-send-when-idle.

### T5: VoiceSessionRepository
- `domain/voice/VoiceSessionRepository.kt`: state flow `Disconnected|Connecting|Live|MovedToAnotherSurface`; API: `pressPtt()/releasePtt()`, `sendSelection(contextTag, index)`, `emitViewContext(view, project?, session?, selection?)` (dedup + change-only, only while Live); wires T3+T4 via Hilt module (`di/VoiceModule.kt`).

## Wave 2 — UI (parallel)

### T6: ShowViewRenderer
- `ui/components/voice/ShowViewCard.kt` (+ per-view composables): 7 views + unknown-view fallback; selection tap → `sendSelection(contextTag, index)`. Port semantics from omo-pulse `ShowView.tsx`.

### T7: Voice surface + permission
- `ui/components/voice/VoiceWidget.kt`: PTT press-and-hold button (thumb zone), connection state chip (live/offline/moved), RECORD_AUDIO runtime request on first press, suspend/overlay for audio-focus loss. Mount on the **supervisor screen** (where attention lives during a walk).

### T8: View-context emitter
- Navigation listener mapping screens → beacon view values (`home|sessions|workspace|chat|supervisor`), dedup/change-only → `emitViewContext`.

## Wave 3 — Polish & dogfood

### T9: Small-screen polish
- Typography scale, one-hand reachability, glanceability of show cards, notification-permission interplay.

### T10: Build + device dogfood
- `gradle assembleDelivery` → output to the :18445 APK serve dir; install; dogfood checklist: connect → PTT → "what escalations are active?" → receive show card → tap choice → verify reply attribution (`channelID: "beacon"` in supervisor ledger) → open desktop widget mid-session → phone shows "voice moved" (handoff) → PTT re-press reconnects.
- Done-condition: checklist green on device; walking-test evidence recorded per the validation ladder.

## Top-3 risks

1. **Phone→omo-pulse transport** (T0): loopback bind may require a proxy decision — could invalidate the transport ruling; gate everything on it.
2. **WS stack mismatch** (T2): assuming instead of verifying DshWsEventClient's stack doubles Wave 1 rework.
3. **On-device audio UX**: half-duplex PTT on speakerphone is walk-test discipline, not code — set expectations early; echo/timing issues surface only on hardware.

First executable wave: **T0 + T1 + T2** (probe + codec + survey — no user-visible risk, unblocks everything).

## CORRECTION 2026-10-08 — the real spec existed all along
The walking-test surface was NEVER a free-form "mini-screen": the authoritative spec is ez-omo-config/docs/portable-supervisor-proposal.md — a dedicated **Portable Supervisor Mode** (constrained density, one object at a time, NO dense dashboard), default home = NEEDS YOU + CURRENT, horizontal swipe = project switch, vertical swipe = session switch, selection feeds Seam-1 context immediately, supervisor show-forms + PTT integrated. Found only after the operator forced a cross-repo doc search (the orchestrator AND the supervisor probe both wrongly declared "no spec exists" without searching linked repos). My earlier three-zone dashboard reconstruction is RETIRED. Also fixed this round: PTT snapshot-gate removed + Home mount (32050031c), emulator QA pipeline established (AVD `beacon`). Portable Mode build: bg_61b62f40, spec-cited. LESSON: before declaring a design nonexistent, search every linked project's docs/debates/proposals.
