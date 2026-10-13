# Stage 3 Revision (proposer) — addresses critique-stage2.md

## b1 (claim) — REVISED [addresses: b1/minor]
Root cause = unbound future commitments. Strengthened invariant: a keepable promise = (armed wake trigger with recorded task ID) + (stated failure semantics) + (bounded horizon). An armed trigger is necessary but not sufficient — delivery can fail, so every promise names what happens if the trigger never fires.

## b2 (doctrine) — REVISED [addresses: both b2 critiques; operator length constraint]
Final text (≤80 words, evidence-anchored):

> **No unbound promises.** Commit to future action only after arming a wake trigger and recording its task ID: an owned background task with a deadline, or a continuation hook that owns this session. An operator handoff ends responsibility — it is not a trigger. If arming cannot be verified, say "needs your input" and give current state. Promises are bounded: "observed until <deadline> via <task ID>". On any wake, reconcile from durable state — session, plan, ledger — before acting.

Changes vs v1: task ID recording made mandatory (observable evidence, per MAJOR critique); operator handoff reclassified as responsibility-end, not a trigger (per minor); bounded-phrasing requirement added; verified-arming requirement added.

## b3 (sentinel, today) — REVISED [addresses: both b3 critiques]
- The promise form is "bounded observation until <deadline> via sentinel <task ID>" — never "I'll monitor".
- Arming is verified, not assumed: sentinel task ID recorded; deadline enforced via the background-task timeout mechanism itself where available, not only in polling logic.
- Sentinel output is observational: exit reason (milestone | inactive | error | deadline | observation_failed) + last-seen evidence (message ID/time, plan checkbox state). It never diagnoses the child (no "the child is stalled" claims).
- Residual risk stated openly: a wedged watcher + a dead notification path defeats this; watchdog and operator are detection backstops of last resort (see b5).

## b4 (stack change) — REVISED [addresses: all three b4/b5 majors]
Reframed as design-first, staged:
1. Contract BEFORE API: (a) registration persistence = on-disk, not in-memory (survives plugin restart); (b) missed-event recovery = last-notified event ID + replay on startup (mirror restart-continuation's consumed-snapshot pattern); (c) expiry = registration carries its own deadline; expiry is silent cleanup, not an event; (d) idle-event semantics = one-shot alert per armed observation; the parent re-arms by acknowledging (this defines the dedupe-key reset); (e) parent termination = registration expires with deadline; child keeps running unobserved — acceptable, operator-visible via plan state.
2. Implementation stages: (i) ship doctrine + sentinel now; (ii) prototype registration against a copy of ParentWakeNotifier; (iii) demonstrate restart-survival + missed-event replay in a test BEFORE any promise language upgrades from "bounded observation" to automatic wake.
3. The "most trust-damaging next failure" scenario (restart drops registration) is closed by (a) on-disk persistence and (b) the staged promise ceiling: until (iii) passes, no automatic-wake promises exist to break.

## b5 (fallbacks) — REVISED [addresses: b5 minor]
Deadline ownership: the sentinel task itself (its timeout IS the deadline). Observation failure is visible as a completion reminder carrying observation_failed. Operator expectation, stated in any monitoring promise: "if no completion reminder arrives by <deadline>, the watcher itself failed — treat as attention needed." Upstream requests unchanged; they mitigate nothing today and are labeled as such.
