# Plan B Task 15 Manual QA

- Date: 2026-04-25
- API base URL: `http://127.0.0.1:51244/api`
- Commit SHA: `c71ba5390303788077e51045e93204fdb4a8f8ec`
- QA source label: `hub`
- QA source ID: `d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85`
- QA project root: `/home/ezotoff/omo-hub`
- Tier1 execution ID: `c6b0d80e-dd8f-4082-9970-c39f59460ffa`

## Preconditions

Selected a fresh/stable source that still had a stale plan signal:

- `aggregateStatus: "running_tool"`
- `planProgress.name: "plan-b-implementation"`
- `planProgress.status: "in progress"`
- `planProgress.completed: 16`
- `planProgress.total: 20`
- `planProgress.planStale: true`
- `planProgress.planComplete: false`
- `mainSession.lastUpdated: "2026-04-25T17:30:52.828Z"`

## Commands and Results

### 1. Inspect selected source snapshot

```bash
curl -sS "http://127.0.0.1:51244/api/projects/d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85"
```

Relevant response excerpt:

```json
{
  "sourceId": "d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85",
  "aggregateStatus": "running_tool",
  "planProgress": {
    "name": "plan-b-implementation",
    "status": "in progress",
    "completed": 16,
    "total": 20,
    "planStale": true,
    "planComplete": false
  },
  "mainSession": {
    "lastUpdated": "2026-04-25T17:30:52.828Z"
  }
}
```

Verdict: PASS — source was fresh enough to avoid auto-downgrade and stale enough to produce `mark_plan_stale`.

### 2. Confirm baseline tier is shadow

```bash
curl -sS "http://127.0.0.1:51244/api/control-plane/tier"
```

Response:

```json
{"ok":true,"tier":"shadow"}
```

Verdict: PASS — baseline tier started in `shadow`.

### 3. Execute in shadow tier

```bash
curl -sS -X POST "http://127.0.0.1:51244/api/control-plane/execute" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85","decisionType":"mark_plan_stale","targetId":"d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85"}'
```

Response:

```json
{
  "ok": true,
  "sourceId": "d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85",
  "tier": "shadow",
  "executionId": null,
  "status": "advisory_only",
  "result": {
    "decisionType": "mark_plan_stale",
    "targetId": "d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85",
    "action": "advisory_only",
    "reason": "Automation tier \"shadow\" is advisory-only",
    "executionId": null
  }
}
```

Verdict: PASS — shadow mode stayed advisory-only.

### 4. Promote to tier1

```bash
curl -sS -X POST "http://127.0.0.1:51244/api/control-plane/tier" \
  -H "Content-Type: application/json" \
  -d '{"tier":"tier1","approved":true,"reason":"Task 15 manual QA"}'
```

Response:

```json
{"ok":true,"tier":"tier1"}
```

Immediate re-check:

```bash
curl -sS "http://127.0.0.1:51244/api/control-plane/tier"
```

```json
{"ok":true,"tier":"tier1"}
```

Verdict: PASS — promotion persisted and no auto-downgrade occurred before execution.

### 5. Execute in tier1

```bash
curl -sS -X POST "http://127.0.0.1:51244/api/control-plane/execute" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85","decisionType":"mark_plan_stale","targetId":"d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85"}'
```

Response excerpt:

```json
{
  "ok": true,
  "sourceId": "d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85",
  "tier": "tier1",
  "executionId": "c6b0d80e-dd8f-4082-9970-c39f59460ffa",
  "status": "dispatched",
  "result": {
    "decisionType": "mark_plan_stale",
    "targetId": "d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85",
    "action": "dispatched",
    "executionId": "c6b0d80e-dd8f-4082-9970-c39f59460ffa",
    "outcomeMatched": true,
    "preflightResult": {
      "approved": true,
      "checks": {
        "tier": true,
        "scope": true,
        "freshness": true,
        "drift": true,
        "suppression": true,
        "cooldown": true,
        "idempotency": true
      }
    }
  }
}
```

Verdict: PASS — approved tier1 execution dispatched successfully.

### 6. Confirm tier remains tier1 after execution

```bash
curl -sS "http://127.0.0.1:51244/api/control-plane/tier"
```

Response:

```json
{"ok":true,"tier":"tier1"}
```

Verdict: PASS — successful execution did not auto-downgrade the tier.

### 7. Confirm persisted execution row

```bash
curl -sS "http://127.0.0.1:51244/api/control-plane/executions"
```

Relevant response excerpt:

```json
{
  "ok": true,
  "executions": [
    {
      "id": "c6b0d80e-dd8f-4082-9970-c39f59460ffa",
      "state": "succeeded",
      "phase": "reconcile",
      "error": null,
      "idempotencyKey": "mark_plan_stale:d1f8d543451eea5738ed0ba5dd52fa45d6a42466501277e7520ef4d5b34ebe85:cfa897d7c2758fdc80ae57ff7884a5c06be2143f90a81b03dae34756dcdb9e27",
      "createdAt": "2026-04-25T17:32:03.168Z",
      "updatedAt": "2026-04-25T17:32:03.168Z"
    }
  ]
}
```

Verdict: PASS — execution persisted and reconciled successfully.

### 8. Confirm final execution detail and lifecycle phases

```bash
curl -sS "http://127.0.0.1:51244/api/control-plane/executions/c6b0d80e-dd8f-4082-9970-c39f59460ffa"
```

Relevant response excerpt:

```json
{
  "ok": true,
  "execution": {
    "id": "c6b0d80e-dd8f-4082-9970-c39f59460ffa",
    "state": "succeeded",
    "phase": "reconcile",
    "error": null
  },
  "phases": [
    "select_executable",
    "preflight",
    "dispatch",
    "monitor",
    "reconcile"
  ]
}
```

Verdict: PASS — final lifecycle reached `reconcile` with a succeeded execution.

## Summary

Task 15 manual QA passed on a real live source. The run demonstrated:

- advisory-only behavior in `shadow`
- explicit operator promotion to `tier1`
- successful approved `mark_plan_stale` dispatch in `tier1`
- persisted execution state in the ledger
- final lifecycle completion at `reconcile`

This artifact closes the previous F3 gap by providing repo-tracked, command-level, real-environment evidence.
