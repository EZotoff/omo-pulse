# Stage 4 Decision (judge — Analyst, BINDING) — 2026-09-24

## Block scores

### b1 (claim / invariant)
- correctness: 5 — invariant now includes failure semantics + bounded horizon; armed trigger as necessary-not-sufficient matches the delivery-failure reality.
- feasibility: 5 — pure conceptual framing, no mechanism cost.
- risk: 5 — no new risk introduced; honestly bounds its own guarantee.

### b2 (doctrine)
- correctness: 5 — covers arming, task-ID evidence, handoff-as-responsibility-end, bounded phrasing, durable-state reconcile; addresses both stage-2 critiques. Word count ~77, within the operator's ≤80 constraint.
- feasibility: 4 — doctrine text is not self-enforcing (stage-2's original point), but mandatory task-ID recording makes compliance observable/auditable after the fact, which is the achievable standard for prose rules.
- risk: 4 — residual: agents may perform cargo-cult compliance (reciting a task ID without verifying arming); mitigated by b3's verified-arming requirement.

### b3 (sentinel, today)
- correctness: 5 — deadline enforced by the task's own timeout mechanism where available, observational-only output taxonomy, residual risk named rather than hidden.
- feasibility: 4 — the "where available" hedge means some deployments fall back to in-polling deadlines; acceptable but should be recorded per-sentinel which mode is in force.
- risk: 4 — wedged-watcher + dead-notification-path hole remains, but is now explicitly backstopped (watchdog/operator) instead of unacknowledged.

### b4 (stack change, design-first + staged)
- correctness: 5 — all five lifecycle questions (persistence, missed events, expiry, idle semantics, parent termination) answered in the contract before any API choice; staged promise ceiling (no automatic-wake promises until restart-survival + replay are demonstrated) directly closes the trust-damaging scenario.
- feasibility: 4 — on-disk persistence + last-notified-ID replay mirrors the proven restart-continuation pattern, so no novel mechanism; prototype-against-a-copy contains blast radius. Remaining work is real but bounded.
- risk: 4 — the staged ceiling is the key risk control; risk only materializes if stage (iii) is skipped and language upgraded early. That skip must be treated as a violation, not a judgment call.

### b5 (fallbacks)
- correctness: 5 — deadline ownership unambiguous (sentinel's timeout IS the deadline); observation failure surfaces as an observable completion event.
- feasibility: 5 — uses only existing channels.
- risk: 4 — depends on operator actually treating "no reminder by deadline" as attention-needed; expectation is stated in every promise, which is the best available mechanism.

## Blocks flagged for removal
None. All five survive.

## Anti-overengineering check
b4 carries the design weight but is contract-first and explicitly staged with a promise ceiling — the complexity is the minimum that answers the critique's five lifecycle questions; the doctrine (the part every agent pays for) is one ≤80-word paragraph. Passes.

---

decision: ADOPT
recommendation: "Ship in b4's stated order: land the b2 doctrine text and b3 sentinel practice now; prototype registration against a ParentWakeNotifier copy; only after a demonstrated restart-survival + missed-event-replay test may promise language upgrade from bounded observation to automatic wake. Treat skipping stage (iii) as a protocol violation, not discretion."
strongest_objection: "b2 is prose and agents can cargo-cult it — reciting a task ID without verified arming. The doctrine is only as strong as b3/b4 making arming verifiable; the two must ship together, doctrine alone would be theater."
what_changed: "Task-ID recording made mandatory (observable evidence); operator handoff reclassified as responsibility-end; bounded phrasing required; arming verified not assumed; b4 rebuilt as contract-first with on-disk persistence, event-ID replay, deadline-carried expiry, one-shot idle alerts with parent-ack re-arm, and a staged promise ceiling that closes the restart-drop trust failure."
remaining_uncertainty: "Whether the background-task timeout mechanism reliably enforces deadlines in every deployment (the 'where available' hedge); whether parent-ack re-arm semantics collide with ParentWakeNotifier's existing dedupe journal in practice; real-world frequency of cargo-cult compliance with the doctrine."
reversal_trigger: "Stage-(iii) test passes but a live plugin restart still drops a wake in production; or sentinel timeouts prove non-enforceable in common deployments; or cargo-cult compliance is observed widespread despite verified-arming requirements."
surviving_blocks: [b1, b2, b3, b4, b5]
