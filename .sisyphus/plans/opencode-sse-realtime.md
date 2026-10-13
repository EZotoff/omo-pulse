# OpenCode SSE Real-Time Ingest (Phase 1)

## TL;DR

> **Quick Summary**: Replace omo-pulse's TTL-gated lazy-recompute "polling" with event-driven invalidation fed by opencode's native SSE stream (`/global/event`), so the dashboard reflects agent activity within ~300ms instead of up to 10s. The existing SQLite derivation layer stays untouched; SSE becomes the freshness trigger, with TTL-poll retained as automatic fallback when no opencode server is reachable.
>
> **Deliverables**:
> - A new opencode SSE client module that discovers the opencode server, subscribes to `/global/event`, normalizes events, and reconnects with `?after=N` replay.
> - Debounced cache-invalidation wiring into `createMultiProjectService`, with a graceful fallback to the current TTL behavior.
> - A server→browser SSE endpoint (`GET /api/events`) plus a `useDashboardData` subscription so freshness reaches the UI, with a live/polling connection-health indicator.
> - Vitest fixture-driven tests (TDD) + Playwright e2e proving sub-second update latency.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T3 (bus interface) → T4 (invalidation) → T5 (endpoint) → T6 (UI)

---

## Context

### Original Request

> "Replace omo-pulse's 2s DB poll with opencode's native SSE event stream (via `@opencode-ai/sdk`). Phase 1: rewrite ingest from DB-poll to opencode SSE." Write the plan into the omo-pulse project dir so it can be `/start-work`ed there.

### Interview Summary

**Key Discussions**:
- **Architecture finding (decisive)**: There is no background `setInterval` poller for ingest. Freshness is *lazy TTL-gated recomputation* — `DashboardStore.getSnapshot()` recomputes only when `now - lastComputedAt > pollIntervalMs` (2s), and `getMultiProjectPayload()` caches the aggregate for 5s. An `invalidate()` hook already exists. So "replace polling with SSE" = "replace the TTL clock with an event-driven invalidation clock."
- **Approach chosen**: Event-driven invalidation (keep SQLite derivation, flush caches on SSE events) rather than event-sourced re-derivation. Rationale: reuses 100% of the verified derivation code, low risk, and is the natural stepping stone toward the later event-sourced + herdr-spine vision.
- **Debounce is mandatory**: opencode emits high-frequency `text.delta` events; without debouncing, every delta would trigger a full SQLite recompute. Mirror the existing `telegram.ts` debounce pattern.
- **UI must perceive the win**: with only ingest-side invalidation, the UI's existing poll still caps perceived freshness at its interval. Phase 1 includes a server→browser push so the improvement is visible.

**Research Findings**:
- opencode (anomalyco/opencode, SHA `e639969`) ships a mature streaming substrate: OTel (`OTEL_EXPORTER_OTLP_ENDPOINT` → `/v1/logs`+`/v1/traces`) AND four SSE endpoints on its HTTP server (default port 4096): `/global/event` (host-wide), `/event`, `/api/event`, `/api/session/{id}/event?after=N` (durable replay). Typed via `@opencode-ai/sdk` (`client.event.subscribe()`, `client.session.events()`). Events persisted, so `?after=N` is a real resume stream.
- Event types: `session.created/updated/deleted`, `message.updated`, `part.updated`, `status`/`idle`, plus `step.*`, `tool.*`, `text.delta`, `reasoning.*`, `shell.*`, `compaction.*`, `agent.switched`, `model.switched`.
- No SQLite update-hooks exist in opencode → polling/SSE are the only options; SSE wins.

### Metis Review

**Identified Gaps** (addressed):
- *SDK-in-Bun uncertainty*: `@opencode-ai/sdk` is designed for browser/Node; Bun compatibility + server-endpoint discovery unverified. Resolved by making T1 a de-risking task that verifies both and falls back to raw `fetch`-based SSE against the discovered endpoint.
- *High-frequency delta flood*: Resolved by mandating a debounce window (default 300ms, configurable) in T4, mirroring `telegram.ts` lines 147/293.
- *Silent fallback masking outages*: Resolved by T6's live/polling health indicator so a dead SSE link is visible, not hidden by the TTL fallback.
- *Scope creep into event-sourced re-derivation / herdr spine*: Locked out in "Must NOT Have".
- *Stale README port*: README says API port 4301; actual default in `dev.ts` is `18031`. Plan uses the real value.

---

## Work Objectives

### Core Objective

Make omo-pulse reflect opencode agent activity in near-real-time (~300ms) by driving cache invalidation from opencode's SSE event stream instead of a TTL clock, without rewriting the derivation layer and with automatic fallback to current behavior when SSE is unavailable.

### Concrete Deliverables

- `src/ingest/opencode-sse-client.ts` — discover, connect, normalize, reconnect/replay.
- `src/ingest/opencode-event-map.ts` — event-type → freshness-relevance mapping.
- Config env vars + normalized types + an internal pub/sub bus interface (in `types.ts` / a new `src/ingest/realtime-types.ts`).
- Debounced invalidation wired into `createMultiProjectService` + server lifecycle (`dev.ts`, `start.ts`).
- `GET /api/events` SSE endpoint in `api.ts`.
- `useDashboardData.ts` SSE subscription + a connection-health badge.
- Vitest tests + Playwright e2e + recorded fixtures under `src/__tests__/fixtures/opencode-events/`.

### Definition of Done

- [ ] `bun run test` passes with new SSE tests (0 failures).
- [ ] With opencode running, an agent action (e.g. a tool call) appears in the dashboard within 1s, evidenced by a Playwright trace.
- [ ] With opencode stopped, the dashboard continues to update via TTL fallback (no crash, health indicator shows "polling").
- [ ] `bun run build` succeeds; `tsc --noEmit` clean.

### Must Have

- Sub-second (≤1s) perceived update latency when SSE is connected, proven by an automated Playwright timing assertion.
- Debounced invalidation (no per-delta recompute storm).
- Automatic fallback to existing TTL-poll behavior when the opencode server is unreachable or SSE disconnects.
- `?after=N` resume so a transient disconnect does not drop events.
- A visible live/polling connection indicator.
- TDD: every task ships a failing test first.

### Must NOT Have (Guardrails)

- Do NOT rewrite or replace the SQLite derivation functions (`derive*Sqlite`, `buildDashboardPayload`, `getMainSessionViewSqlite`, etc.). They stay the source of deep data.
- Do NOT remove the file-based storage backend or the TTL cache paths — they are the fallback.
- Do NOT add herdr, multi-harness, OTel collector, drift/alerting, or event-sourced re-derivation. Those are later phases.
- Do NOT add `as any` / `@ts-ignore` / empty catches. Follow existing error-isolation patterns (per-source try/catch returning safe empties, as in `multi-project.ts`).
- Do NOT change the `/api/projects` response contract (`DashboardMultiProjectPayload`) — the UI subscription is additive.
- Do NOT bind a port without checking the deployment registry if any new listener is introduced (the SSE endpoint reuses the existing Hono server on `OMO_PULSE_API_PORT`, so no new port — confirm this holds).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest unit, playwright e2e, both in `package.json`).
- **Automated tests**: TDD (RED → GREEN → REFACTOR). Each task writes a failing test against recorded/fixture SSE data first.
- **Framework**: vitest (unit/integration), playwright (e2e/UI timing).
- **If TDD**: Each task follows RED (failing test from a fixture) → GREEN (minimal impl) → REFACTOR.

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — navigate, subscribe, simulate/await event, assert DOM + timing, screenshot.
- **API/Backend**: Bash (curl) — hit SSE endpoint, assert event-stream frames.
- **Library/Module**: Bash (`bun run test` / vitest) — import, feed fixture, compare output.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation, parallel):
├── T1: opencode SSE client (discover/connect/normalize/replay) [deep]
├── T2: recorded event fixtures + event→invalidation mapping [quick]
└── T3: config + feature flag + normalized types + pub/sub bus interface [quick]

Wave 2 (After Wave 1 - integration, parallel):
├── T4: debounced invalidation wiring into multi-project service + lifecycle (depends: T1, T3) [deep]
└── T5: GET /api/events server→browser SSE endpoint (depends: T3) [unspecified-high]

Wave 3 (After Wave 2 - UI):
└── T6: useDashboardData SSE subscription + connection-health badge (depends: T5) [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit
├── F2: Code quality review
├── F3: Real manual QA
└── F4: Scope fidelity check
-> Present results -> Get explicit user okay

Critical Path: T3 → T4 → T5 → T6 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix (show ALL tasks)

- **T1**: no blockers - blocks T4
- **T2**: no blockers - blocks T1's tests (fixtures), T4's tests
- **T3**: no blockers - blocks T4, T5
- **T4**: blocked by T1, T3 - blocks T6 (indirectly, via live data)
- **T5**: blocked by T3 - blocks T6
- **T6**: blocked by T5 - blocks F1-F4
- **F1-F4**: blocked by ALL

### Agent Dispatch Summary

- **Wave 1**: 3 — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 2 — T4 → `deep`, T5 → `unspecified-high`
- **Wave 3**: 1 — T6 → `visual-engineering`
- **Wave FINAL**: 4 — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high` (+playwright), F4 `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [ ] 1. opencode SSE client module (discover / connect / normalize / reconnect with `?after=N` replay)

  **What to do**:
  - Create `src/ingest/opencode-sse-client.ts`. First verify `@opencode-ai/sdk` runs under Bun (`bun add @opencode-ai/sdk` then a 10-line smoke import); if it works, use `client.event.subscribe()` / server discovery from it. If it does NOT work under Bun, fall back to a raw `fetch`-based SSE reader against a discovered endpoint.
  - Discover the opencode server endpoint: default `http://127.0.0.1:4096`, overridable via `OMO_PULSE_OPENCODE_ENDPOINT`. If using the SDK, follow its discovery (it reads opencode's server state); otherwise document the discovery file you read. Record the chosen mechanism in a comment.
  - Connect to `GET /global/event` (host-wide stream; preferred over per-session `/event`). Parse newline-delimited SSE.
  - Normalize each raw event into an internal `OpenCodeEvent` (from T3): at minimum `{ kind, sessionId, directory, seq, ts }`. Extract `seq`/id for replay.
  - On disconnect: reconnect with exponential backoff, resuming via `?after=<lastSeq>` (the global stream supports sequence resume).
  - Expose `start()`, `stop()`, `subscribe(listener)`, and `getState()` (`connected` | `reconnecting` | `down`).
  - RED first: write `src/__tests__/opencode-sse-client.test.ts` that feeds a recorded fixture (from T2) through an in-process/in-memory harness and asserts (a) normalized events emitted in order, (b) reconnect replays from the last `?after=` seq, (c) `stop()` tears down cleanly.

  **Must NOT do**:
  - Do not hardcode a port without honoring `OMO_PULSE_OPENCODE_ENDPOINT`.
  - Do not block the event loop; SSE parsing must be async/streaming.
  - Do not couple to `multi-project.ts` (T4 does the wiring).

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: autonomous problem-solving; must verify SDK-under-Bun + server discovery with fallback — genuinely needs research before action.
  - **Skills**: `[]`
    - None required — pure TS module following existing `src/ingest` patterns.
  - **Skills Evaluated but Omitted**:
    - `programming`: no special stack novelty beyond existing TS/Bun conventions already in the repo.
    - `debugging`: only if SDK-under-Bun verification fails; not preloaded.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T4
  - **Blocked By**: None (T2 fixtures are consumed by its tests but T1 can stub if T2 lags)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/server/telegram.ts:143-333` — `createTelegramService` factory pattern (`start`/`stop`/`getStatus`, internal state, setInterval lifecycle) to mirror for `start`/`stop`/`getState`.
  - `src/ingest/storage-backend.ts:35-49` — `withReadonlyDb` try/catch/finally + safe-failure style to mirror for connection error handling.

  **API/Type References** (contracts to implement against):
  - `src/types.ts:202` `DashboardMultiProjectPayload` — the eventual payload shape (context only; T1 does not produce it).
  - T3's `OpenCodeEvent` + `SseConnectionState` types (implement against the T3 contract).

  **External References** (libraries and frameworks):
  - opencode SSE: `GET /global/event` on the opencode HTTP server (default port 4096), `text/event-stream`, 10s heartbeat, sequence-resumable via `?after=N`. Verified at anomalyco/opencode SHA `e639969`, `packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts`.
  - `@opencode-ai/sdk`: `client.event.subscribe()`, `client.session.events()` — typed SSE wrappers. Verify Bun compatibility first.

  **WHY Each Reference Matters**:
  - telegram.ts: the only existing long-lived-service factory in the repo; copying its lifecycle shape keeps the new client idiomatic.
  - global.ts handler: confirms the exact SSE contract (heartbeat, resume) so the client handles disconnects correctly rather than guessing.

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `src/__tests__/opencode-sse-client.test.ts`
  - [ ] `bun run test -- opencode-sse-client` → PASS (≥3 tests: ordered emit, replay resume, clean stop), 0 failures

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: [Happy path — fixture events normalize and emit in order]
    Tool: Bash (vitest)
    Preconditions: T2 fixtures exist at src/__tests__/fixtures/opencode-events/ (or a committed minimal fixture)
    Steps:
      1. `bun run test -- opencode-sse-client`
      2. Assert the "ordered emit" test feeds a multi-event fixture and asserts normalized event order matches input.
      3. Assert exit code 0 and "X passing" with 0 failures.
    Expected Result: vitest reports PASS with ≥3 tests, 0 failures.
    Failure Indicators: exit code non-zero; "replay resume" or "ordered emit" test failing.
    Evidence: .sisyphus/evidence/task-1-client-fixture-emit.txt

  Scenario: [Failure/edge — opencode server unreachable → state=down, no throw]
    Tool: Bash (vitest)
    Preconditions: point client at a guaranteed-closed endpoint (e.g. http://127.0.0.1:9) via OMO_PULSE_OPENCODE_ENDPOINT
    Steps:
      1. Run the test that starts the client against the closed port.
      2. Assert `getState()` transitions to `down` (or `reconnecting`) within the test window.
      3. Assert no unhandled rejection is thrown.
    Expected Result: client reports `down`/`reconnecting`; process stable.
    Failure Indicators: unhandled promise rejection; state stuck on `connected`.
    Evidence: .sisyphus/evidence/task-1-client-unreachable.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-client-fixture-emit.txt (vitest output)
  - [ ] task-1-client-unreachable.txt (vitest output)

  **Commit**: YES (groups with T2, T3)
  - Message: `feat(ingest): opencode SSE client with discover/connect/replay`
  - Files: `src/ingest/opencode-sse-client.ts`, `src/__tests__/opencode-sse-client.test.ts`
  - Pre-commit: `bun run test -- opencode-sse-client`

---

- [ ] 2. Recorded SSE event fixtures + event→invalidation mapping

  **What to do**:
  - Capture real opencode SSE samples: with opencode running, `curl -N http://127.0.0.1:4096/global/event` for ~10s while triggering an agent action; save raw frames as JSONL under `src/__tests__/fixtures/opencode-events/real-sample.jsonl`. Capture at least: a `session.updated`, a `message.updated`, a `part.updated`, a `text.delta`, a `status`/`idle`.
  - Create `src/ingest/opencode-event-map.ts` exporting `isFreshnessRelevant(event): boolean` and `affectedProjectRoot(event): string | null`. Rule: `session.*`, `message.updated`, `part.updated`, `status` are freshness-relevant; `text.delta` and `reasoning.*` are NOT individually relevant (they're collapsed by the T4 debounce — map returns false so they're cheap to ignore, OR true with the same project key so debounce coalesces them — DECISION: return true for `message/part/session/status` only; ignore `text.delta`/`reasoning.*` to avoid noise). Document the decision in a comment.
  - RED first: `src/__tests__/opencode-event-map.test.ts` asserts the mapping over the fixture set.

  **Must NOT do**:
  - Do not commit secrets/prompts — the global event stream is metadata-only, but scan the capture before committing.
  - Do not make the mapper stateful.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: capture + small pure mapper; single concern.
  - **Skills**: `[]` — none overlap.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T1 tests, T4 tests
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ingest/token-usage-core.ts:36-48` — `clampToken`/`isRecord`/`readString` safe-predicate style to mirror for `isFreshnessRelevant`.

  **API/Type References**:
  - opencode event type shapes (External): `session.updated { session: { id, directory, ... } }`, `message.updated`, `part.updated`. Use T3's `OpenCodeEvent`.

  **External References**:
  - anomalyco/opencode `packages/schema/src/session-event.ts` (SHA `e639969`) — the canonical event union.

  **WHY Each Reference Matters**:
  - token-usage-core.ts: shows the repo's conventions for parsing/validating untyped external data safely.
  - session-event.ts: authoritative list of event kinds so the mapper is exhaustive, not guessed.

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Test file created: `src/__tests__/opencode-event-map.test.ts`
  - [ ] `bun run test -- opencode-event-map` → PASS, 0 failures

  **QA Scenarios:**

  ```
  Scenario: [Happy path — mapper classifies fixture events correctly]
    Tool: Bash (vitest)
    Preconditions: real-sample.jsonl fixture committed
    Steps:
      1. `bun run test -- opencode-event-map`
      2. Assert session/message/part/status events → isFreshnessRelevant=true with correct affectedProjectRoot.
      3. Assert text.delta/reasoning → isFreshnessRelevant=false.
    Expected Result: all assertions pass, 0 failures.
    Failure Indicators: misclassification of any fixture event.
    Evidence: .sisyphus/evidence/task-2-map-fixture.txt

  Scenario: [Failure/edge — unknown event kind does not throw]
    Tool: Bash (vitest)
    Steps:
      1. Feed a synthetic `{ kind: "something.new.v2" }` event.
      2. Assert isFreshnessRelevant returns false (safe default), no throw.
    Expected Result: false returned, no exception.
    Evidence: .sisyphus/evidence/task-2-map-unknown.txt
  ```

  **Commit**: YES (groups with T1, T3)
  - Message: `test(ingest): opencode sse event fixtures + freshness mapping`
  - Files: `src/__tests__/fixtures/opencode-events/real-sample.jsonl`, `src/ingest/opencode-event-map.ts`, `src/__tests__/opencode-event-map.test.ts`

---

- [ ] 3. Config + feature flag + normalized types + pub/sub bus interface

  **What to do**:
  - Add config (read in a new `src/ingest/realtime-config.ts`): `OMO_PULSE_OPENCODE_SSE_ENABLED` (default `"true"`), `OMO_PULSE_OPENCODE_ENDPOINT` (default `http://127.0.0.1:4096`), `OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS` (default `300`). Parse with the same defensive style as existing env reads.
  - Define normalized types in a new `src/ingest/realtime-types.ts`: `OpenCodeEvent` (`{ kind: string; sessionId?: string; directory?: string; seq?: number; ts: number }`), `SseConnectionState = "connected" | "reconnecting" | "down" | "disabled"`.
  - Define an internal pub/sub bus interface that T4 publishes to and T5 subscribes to: `RealtimeBus` with `publish(event: OpenCodeEvent): void`, `subscribe(listener: (e: OpenCodeEvent) => void): () => void`, and a simple in-memory implementation `createRealtimeBus()`. This decouples T4 and T5 so they can be built in parallel against this contract.
  - RED: `src/__tests__/realtime-bus.test.ts` — publish → all subscribers receive, in order; unsubscribe stops delivery.

  **Must NOT do**:
  - Do not pull in an external pub/sub library; a tiny in-memory Set-of-listeners suffices.
  - Do not make the bus async-queueing; synchronous fan-out on publish.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: small foundational types/config/bus, single concern each.
  - **Skills**: `[]`.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T4, T5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/server/dev.ts:14` — `parseInt(process.env.OMO_PULSE_API_PORT || "18031", 10)` env-read style to mirror.

  **API/Type References**:
  - `src/types.ts` — place cross-cutting types here or keep them in `realtime-types.ts` (prefer the new file to avoid bloating `types.ts`).

  **WHY Each Reference Matters**:
  - dev.ts env read: keeps config parsing consistent with the one existing pattern.

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] `src/__tests__/realtime-bus.test.ts` created
  - [ ] `bun run test -- realtime-bus` → PASS, 0 failures

  **QA Scenarios:**

  ```
  Scenario: [Happy path — bus fans out to subscribers]
    Tool: Bash (vitest)
    Steps:
      1. createRealtimeBus(); subscribe two listeners; publish an event.
      2. Assert both received the same event reference, in publish order.
    Expected Result: 2/2 deliveries, ordered.
    Evidence: .sisyphus/evidence/task-3-bus-fanout.txt

  Scenario: [Failure/edge — unsubscribe stops delivery]
    Tool: Bash (vitest)
    Steps:
      1. subscribe, capture unsubscribe handle, unsubscribe, publish.
      2. Assert the listener was NOT called.
    Expected Result: 0 deliveries after unsubscribe.
    Evidence: .sisyphus/evidence/task-3-bus-unsubscribe.txt
  ```

  **Commit**: YES (groups with T1, T2)
  - Message: `feat(ingest): realtime config, types, and pub/sub bus`
  - Files: `src/ingest/realtime-config.ts`, `src/ingest/realtime-types.ts`, `src/__tests__/realtime-bus.test.ts`

---

- [ ] 4. Debounced invalidation wiring into multi-project service + server lifecycle

  **What to do**:
  - In `src/server/multi-project.ts`, extend `createMultiProjectService` to accept an optional realtime integration. Add a method `onRealtimeEvent(e: OpenCodeEvent)` that: if `isFreshnessRelevant(e)` → schedule a debounced `invalidate()` (debounce window = `OMO_PULSE_OPENCODE_SSE_DEBOUNCE_MS`, default 300, mirroring `telegram.ts` debounce at lines 147/293). Phase 1 uses global invalidation (call existing `invalidate()`); per-source invalidation is explicitly out of scope.
  - Wire the bus: in `dev.ts` and `start.ts`, instantiate `createRealtimeBus()`, pass it + the SSE client (T1) into the service assembly; start the SSE client; on each client event, `bus.publish(event)` AND `service.onRealtimeEvent(event)`. (T5 subscribes to the same bus.)
  - Fallback: if SSE `getState()` is `down`/`reconnecting` for >5s, log once and rely on the existing TTL lazy recompute (already the default — no code needed beyond not invalidating). The connection state is surfaced via T6.
  - RED first: `src/__tests__/multi-project-realtime.test.ts` — construct the service with a mock, push a burst of 10 fixture events through `onRealtimeEvent`, assert `invalidate()` is called exactly ONCE per debounce window (debounce coalescing), then once more after the window.

  **Must NOT do**:
  - Do not invalidate per-event (must debounce).
  - Do not touch the derivation functions or the `/api/projects` contract.
  - Do not introduce per-source invalidation (global only this phase).

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: touches the central aggregation service + two server entrypoints; needs careful debounce + fallback reasoning and lifecycle correctness.
  - **Skills**: `[]`.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, both depend only on T1+T3 contracts)
  - **Parallel Group**: Wave 2 (with T5)
  - **Blocks**: T6 (indirectly)
  - **Blocked By**: T1, T3

  **References**:

  **Pattern References**:
  - `src/server/multi-project.ts:215-371` — `createMultiProjectService` signature, `invalidate()` at line 363, the caches at 221-225. This is the file you extend.
  - `src/server/multi-project.ts:76-81` — TTL constants (`MULTI_PROJECT_PAYLOAD_CACHE_TTL_MS=5000`, `DEFAULT_POLL_INTERVAL_MS=2000`); keep these as the fallback clock.
  - `src/server/telegram.ts:147,293-307` — debounce pattern (`if (nowMs - state.lastEditMs < debounceMs) return`) to mirror for invalidation debounce.
  - `src/server/dev.ts:18-46` — server assembly; this is where you instantiate the bus + SSE client and start them. Also update `src/server/start.ts` identically.

  **API/Type References**:
  - `src/server/api.ts:15-18` — `MultiProjectService` type (`getMultiProjectPayload`, `invalidate`); extend with `onRealtimeEvent` here or in multi-project.ts (keep the canonical type in multi-project.ts and re-export).

  **WHY Each Reference Matters**:
  - multi-project.ts invalidate/caches: the exact seam you're driving; misunderstanding it breaks fallback.
  - telegram.ts debounce: the repo's proven debounce idiom; copying it avoids inventing a new timing pattern.

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] `src/__tests__/multi-project-realtime.test.ts` created
  - [ ] `bun run test -- multi-project-realtime` → PASS (debounce coalescing + post-window re-invalidate), 0 failures

  **QA Scenarios:**

  ```
  Scenario: [Happy path — event burst collapses to one debounced invalidation]
    Tool: Bash (vitest)
    Preconditions: service constructed with a spy invalidate; debounce=300ms (use fake timers)
    Steps:
      1. Push 10 fixture events synchronously via onRealtimeEvent.
      2. Advance fake timers past the debounce window.
      3. Assert invalidate was called exactly once.
    Expected Result: invalidate call count === 1 for the burst.
    Failure Indicators: invalidate called 10× (no debounce) or 0× (debounce swallowed it).
    Evidence: .sisyphus/evidence/task-4-debounce-coalesce.txt

  Scenario: [Failure/edge — irrelevant events do not invalidate]
    Tool: Bash (vitest)
    Steps:
      1. Push events where isFreshnessRelevant=false (e.g. text.delta per T2's mapping).
      2. Assert invalidate NOT called.
    Expected Result: 0 invalidations.
    Evidence: .sisyphus/evidence/task-4-irrelevant-skipped.txt
  ```

  **Commit**: YES
  - Message: `feat(server): sse-driven debounced invalidation with ttl fallback`
  - Files: `src/server/multi-project.ts`, `src/server/dev.ts`, `src/server/start.ts`, `src/__tests__/multi-project-realtime.test.ts`
  - Pre-commit: `bun run test -- multi-project-realtime`

---

- [ ] 5. GET /api/events server→browser SSE endpoint

  **What to do**:
  - In `src/server/api.ts`, add `GET /api/events` returning `text/event-stream`. It subscribes to the `RealtimeBus` (from T3) and, on each relevant event, writes an SSE frame `event: refresh\ndata: {"ts":...}\n\n` to the browser. Include the standard 10s heartbeat comment line. The browser does NOT receive raw opencode events — only a `refresh` signal (it then re-fetches `/api/projects`); this keeps the contract minimal and avoids double-serializing payloads.
  - Plumb the bus into `createApi` (add a `realtimeBus` param). Update `dev.ts`/`start.ts` to pass the bus created in T4.
  - Handle client disconnect: remove the listener on stream close (Hono/`Bun.serve` writable close).
  - RED first: `src/__tests__/api-events.test.ts` — start the api on a random port with an in-memory bus, open the endpoint, publish an event, assert a `refresh` frame arrives; assert listener removed on disconnect.

  **Must NOT do**:
  - Do not push the full `DashboardMultiProjectPayload` through this endpoint (the browser refetches `/api/projects`).
  - Do not change other endpoints or the no-cache middleware.
  - Do not bind a new port — reuse the existing Hono app on `OMO_PULSE_API_PORT`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: backend SSE plumbing over Hono/Bun.serve with correct disconnect handling; non-trivial, no visual domain.
  - **Skills**: `[]`.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4; both depend on T3's bus contract)
  - **Parallel Group**: Wave 2 (with T4)
  - **Blocks**: T6
  - **Blocked By**: T3

  **References**:

  **Pattern References**:
  - `src/server/api.ts:20-41` — `createApi` factory + the no-cache/JSON middleware; add the new route in the same style.
  - `src/server/api.ts:119-122` — `GET /projects` handler style to mirror for the new route's structure.

  **API/Type References**:
  - T3's `RealtimeBus.subscribe` — the subscription contract.
  - opencode `global.ts` SSE handler (External) — reference for SSE frame format + heartbeat idiom.

  **External References**:
  - Hono streaming response docs (SSE via `streamSSE` or manual `Content-Type: text/event-stream` writable) — confirm the Bun-compatible form.

  **WHY Each Reference Matters**:
  - api.ts factory: the route must match existing middleware/error-handling or it breaks the `/api/*` invariants.
  - opencode global.ts: proven SSE frame/heartbeat shape to copy rather than reinvent.

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] `src/__tests__/api-events.test.ts` created
  - [ ] `bun run test -- api-events` → PASS (frame-on-publish + clean-disconnect), 0 failures

  **QA Scenarios:**

  ```
  Scenario: [Happy path — published event produces a refresh frame]
    Tool: Bash (curl)
    Preconditions: api running on a random test port with an in-memory bus
    Steps:
      1. `curl -sN http://127.0.0.1:<port>/api/events &` ; publish an event on the bus.
      2. Assert a frame beginning with `event: refresh` is received within 2s.
    Expected Result: `event: refresh\ndata: {...}` frame observed.
    Failure Indicators: no frame within 2s; wrong content-type.
    Evidence: .sisyphus/evidence/task-5-refresh-frame.txt

  Scenario: [Failure/edge — client disconnect removes the listener]
    Tool: Bash (vitest)
    Steps:
      1. Open the endpoint, capture the bus listener count; close the connection; publish.
      2. Assert listener count returns to baseline (no leak) and no write to a closed stream throws.
    Expected Result: listener removed; no unhandled error.
    Evidence: .sisyphus/evidence/task-5-disconnect-cleanup.txt
  ```

  **Commit**: YES
  - Message: `feat(api): GET /api/events sse push endpoint`
  - Files: `src/server/api.ts`, `src/server/dev.ts`, `src/server/start.ts`, `src/__tests__/api-events.test.ts`
  - Pre-commit: `bun run test -- api-events`

---

- [ ] 6. Browser real-time subscription + connection-health badge (UI)

  **What to do**:
  - In `src/ui/hooks/useDashboardData.ts`, add an `EventSource('/api/events')` subscription alongside the existing interval poll. On receiving a `refresh` event, immediately trigger a `/api/projects` refetch (reuse the existing fetcher). Keep the interval poll as a fallback (it already exists) but it can be relaxed (e.g. every 5s) once SSE is confirmed live. Clean up the EventSource on unmount.
  - Track SSE connection state from the `EventSource` `onopen`/`onerror` events; expose a `connection: "live" | "polling"` value.
  - Render a small connection-health badge in the existing header/health-indicator area showing "live" (green) vs "polling" (amber). Reuse existing color tokens (cyan/amber per README's status palette) — do NOT introduce new styling systems.
  - RED first: this is UI — write a Playwright e2e (`tests/realtime-e2e.spec.ts`) that loads the dashboard, and asserts that after a `/api/events` `refresh` frame (simulated by driving the backend bus in the test setup, or by triggering a real opencode event in a local fixture run), the DOM `lastUpdated` value updates within 1s. Also a failure scenario: kill the EventSource and assert the badge shows "polling".

  **Must NOT do**:
  - Do not restyle the dashboard; reuse existing components/tokens.
  - Do not remove the interval poll (it's the fallback).
  - Do not change the `/api/projects` response shape.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: touches a React hook + renders a UI badge — frontend/UI work per the category domain rule.
  - **Skills**: `[]`
    - The change is a data-hook + a one-line badge; no design/styling system work. `frontend`/`frontend-ui-ux` omitted because there is no visual redesign or styling-system decision, only wiring an existing indicator. (If during work the badge needs non-trivial styling, re-evaluate and load `frontend`.)
  - **Skills Evaluated but Omitted**:
    - `frontend`/`frontend-ui-ux`: no redesign/styling; reuses existing status palette tokens only.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after T5)
  - **Blocks**: F1-F4
  - **Blocked By**: T5

  **References**:

  **Pattern References**:
  - `src/ui/hooks/useDashboardData.ts` — READ FIRST; this is the file you extend (poll + fetch logic). Mirror its fetcher and error handling.
  - `src/ui/hooks/useSoundNotifications.ts` — READ for the existing hook-lifecycle (subscribe/cleanup) idiom in this codebase.
  - README "Color-coded states — cyan (active), orange (needs attention)" — reuse these tokens for live/polling badge.

  **API/Type References**:
  - `GET /api/events` (from T5) — the `refresh` event contract.
  - `src/types.ts:202` `DashboardMultiProjectPayload` — unchanged.

  **WHY Each Reference Matters**:
  - useDashboardData.ts: the exact poll loop to augment; not mirroring its fetcher risks inconsistent error handling.
  - useSoundNotifications.ts: shows how this codebase cleans up browser subscriptions (avoid leaks).

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] `tests/realtime-e2e.spec.ts` created
  - [ ] `bun run test:e2e -- realtime-e2e` (or `playwright` invocation per package.json) → PASS, 0 failures

  **QA Scenarios:**

  ```
  Scenario: [Happy path — dashboard updates within 1s of a refresh event]
    Tool: Playwright
    Preconditions: dashboard running against a local opencode fixture/bus that emits a refresh after load
    Steps:
      1. Navigate to the dashboard URL; capture the initial "lastUpdated" text in a project strip.
      2. Trigger one refresh event on the bus (or one real opencode event in the fixture run).
      3. Assert the "lastUpdated" DOM value changes within 1000ms.
    Expected Result: DOM lastUpdated updates < 1s after the event.
    Failure Indicators: value unchanged after 1s (SSE not wired or refetch not triggered).
    Evidence: .sisyphus/evidence/task-6-live-update.png (+ trace)

  Scenario: [Failure/edge — SSE down shows "polling" badge and keeps updating via interval]
    Tool: Playwright
    Preconditions: dashboard running; block/kill /api/events (e.g. route intercept returns 503)
    Steps:
      1. Reload the dashboard.
      2. Assert the connection badge renders "polling" (amber).
      3. Wait beyond the interval poll period and assert the dashboard still refreshes via poll.
    Expected Result: badge="polling"; data still refreshes on the interval.
    Failure Indicators: badge stuck on "live"; data stops updating entirely.
    Evidence: .sisyphus/evidence/task-6-polling-fallback.png
  ```

  **Commit**: YES
  - Message: `feat(ui): realtime sse subscription + live/polling health badge`
  - Files: `src/ui/hooks/useDashboardData.ts`, the badge component location (find existing header/health indicator), `tests/realtime-e2e.spec.ts`
  - Pre-commit: `bun run test:e2e -- realtime-e2e`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the
> user and get explicit "okay" before completing. Do NOT auto-proceed.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (sub-second latency proven by Playwright trace; debounce present; fallback path present; `?after=N` resume; health indicator; TDD tests exist). For each "Must NOT Have": search the codebase for forbidden patterns (derivation functions modified; `as any`/`@ts-ignore`; new port bound; herdr/OTel/drift code) — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables vs plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [6/6] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `tsc --noEmit` + `bun run test`. Review changed files for `as any`/`@ts-ignore`, empty catches, stray logs, commented-out code, unused imports, AI slop (over-abstraction, generic names). Confirm error handling follows the per-source isolation pattern in `multi-project.ts`.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright`)
  From a clean state, execute EVERY QA scenario from T1-T6, capture evidence, test cross-task integration (full path: opencode event → invalidation → /api/events → UI update) and edge cases (SSE down → fallback). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — nothing missing, nothing beyond spec (no event-sourced re-derivation, no herdr, no OTel collector). Check "Must NOT do" compliance and cross-task contamination.
  Output: `Tasks [6/6 compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

Git commits: follow the active git workflow. A local commit is allowed when the user requested one or when a loaded project/skill workflow explicitly calls for checkpoint or logical-task commits. Each task above marks `Commit: YES` grouped per wave (Wave 1 = one commit for T1+T2+T3; Wave 2 = T4 commit and T5 commit; Wave 3 = T6 commit). If no active workflow calls for a commit, ask first. Before committing, inspect staged/untracked changes and never commit secrets, credentials, the recorded SSE capture if it contains prompts (scan `real-sample.jsonl`), or unrelated work. Do not push, force-push, amend, rebase, or run destructive git commands unless explicitly authorized.

---

## Success Criteria

### Verification Commands
```bash
bun run test                     # Expected: all unit/integration tests PASS, 0 failures
bun run build                    # Expected: exit 0
bunx tsc --noEmit                # Expected: no errors
bun run test:e2e -- realtime-e2e # Expected: Playwright PASS, latency < 1s
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (derivation untouched, no `as any`, no new port, no out-of-scope features)
- [ ] All tests pass (`bun run test` + e2e)
- [ ] Dashboard updates < 1s after an opencode event (Playwright evidence)
- [ ] Dashboard still updates via TTL poll when SSE is down (Playwright evidence)
