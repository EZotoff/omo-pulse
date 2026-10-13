# Stage 2 Critique (mephistopheles, generous-steelman) — 2026-09-23
- b1 | assumption | minor | Armed triggers can still fail to deliver; invariant needs armed trigger + explicit failure semantics.
- b2 | feasibility | MAJOR | AGENTS.md guidance is not enforceable; require observable evidence (task ID) before committing; phrase as bounded attempt.
- b2 | assumption | minor | Operator handoff is not a wake trigger — name it separately.
- b3 | risk | MAJOR | Deadlines in polling code don't enforce themselves; verify the completion-notification path actually fires before claiming "armed".
- b3 | evidence | minor | Inactivity ≠ stalled; sentinel reports "attention needed" + evidence, no child-state diagnosis.
- b4 | feasibility | MAJOR | Registration changes the notifier's lifecycle model: durable binding, expiry/cleanup, restart survival, missed events, parent termination.
- b4 | risk | MAJOR | Idle ≠ plan completion; dedupe-key reset, parent ack / re-arm semantics must be specified before choosing an API surface.
- b5 | risk | minor | Backstops need ownership: who owns the deadline, where observation failure is visible.
Trust-damaging scenario: "monitoring armed" → plugin restart drops in-memory registration → no wake → same broken promise under a purported fix. Until restart-recovery is demonstrated, promise only bounded observation.
