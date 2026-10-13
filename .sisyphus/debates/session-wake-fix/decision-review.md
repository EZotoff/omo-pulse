# Decision Review Synthesis — session-wake-fix (2026-09-23)

Protocol: Decision Review (critique → revision → 3-judge panel). Stages persisted in this directory.

## Verdict: ADOPT (with advisory fix incorporated)

| Judge | Weight | Verdict | Key point |
|---|---|---|---|
| Analyst (ultrabrain) | **binding** | ADOPT | All blocks 4-5/5; ship order enforced; stage-(iii) skip = protocol violation |
| Aesthete (artistry) | advisory | ADOPT | b4 risks over-engineering — keep as exploratory prototype only |
| Stylist (document-writer) | advisory | REVISE → incorporated | "task ID" evidence rule incoherent for continuation-hook branch; fixed via per-branch durable handle |

## FINAL doctrine rule (Stylist-tightened, 77 words — replaces the earlier ~90-word draft)

> **No unbound promises.** Commit to future action only after arming a wake trigger and recording a durable handle: an owned background task with a deadline and task ID, or a continuation hook owning this session plus its state file. An operator handoff ends responsibility, not a trigger. If arming can't be verified, say "needs your input" and give current state. Promises are bounded: "observed until `<deadline>` via `<handle>`". On any wake, reconcile from durable state before acting.

## What ships, in order
1. Now: doctrine rule above (via postmortem-policy into AGENTS.md) + sentinel practice (bounded observation, verified arming, observational exit reasons).
2. Prototype: external-child registration against a copy of ParentWakeNotifier (contract-first: on-disk persistence, event-ID replay, deadline-carried expiry, one-shot idle alerts with parent-ack re-arm).
3. Gate: promise language upgrades to automatic wake ONLY after restart-survival + missed-event-replay test passes (stage iii). Skipping it = protocol violation.

## Standing objections / triggers
- Analyst: doctrine alone is theater — its strength lives in verifiable arming (b3/b4).
- Aesthete: don't let b4 become distributed-systems ballast; bounded observation already solves the trust deficit.
- Stylist reversal trigger: if hook paths have no durable handle, revert to per-branch evidence wording.
- Analyst reversal trigger: live restart drops a wake after stage-(iii) passes; sentinel timeouts prove non-enforceable; widespread cargo-cult compliance.
