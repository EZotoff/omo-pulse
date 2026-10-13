# Scenario 7 — Live upgrade smoke (conditional)

Status: **BLOCKED-EXTERNAL (degraded PASS for token-absent) / full 101-relay DEFERRED-pending-prerequisite**

## Prerequisite check
- `voice-bridge.service`: **active** (systemd --user)
- `~/.local/state/voice-bridge/token`: **ABSENT** → external `vb-token-persist` prerequisite still in flight.
- Authoritative rule: cannot write the token (worker must not); cannot restart the bridge.

## Live target
- `http://127.0.0.1:4300` = installed copy at `~/.local/share/omo-pulse` (pid 2111061, `bun src/server/start.ts`), NOT a systemd unit (`omo-pulse.service` inactive). Started before this session; **not restarted by this worker**.
- The installed copy **already runs the new proxy**: WS upgrade to `/api/voice-ws` short-circuits at [src/server/voice-proxy.ts:111-114](voice-proxy.ts) before any bridge dial. No local production fallback server was needed.

## Evidence
- `scenario-7-live-ws-probe.txt` — `curl -i` upgrade attempt → `HTTP/1.1 503 Service Unavailable` / body `voice bridge token unavailable`.
- `scenario-8-live-health.txt` — `curl -i /api/health` → `HTTP/1.1 200 OK` (`{"ok":true,"version":"0.1.0"}`).

## Interpretation
The 503 is the **designed graceful degradation** for a missing token (`readToken() === null`), not a crash. Service stays alive; non-voice API unaffected.

## Deferred
- Full `101 Switching Protocols` relay to the real voice-bridge (and audio/text pipe-through) is **DEFERRED-pending-prerequisite** (`vb-token-persist` must land the token first). Re-run scenario 7 after that lands; no code change expected.
