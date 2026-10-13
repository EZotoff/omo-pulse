# Handoff: omo-pulse realtime SSE shipped — roadmap moves to Phase 2 + hygiene
- emitted: 2026-10-06T22:55:00+02:00 (updated after menu execution) | source session: Sisyphus orchestrator session, ez-omo-dash (subagent IDs cited in State) | source head: 6d15f50 @ master, tree dirty (untracked scratch only — see Gotchas)
- supersedes: none

## Mission
This thread took omo-pulse from 30s-polling to realtime: OpenCode's native SSE event stream now drives cache invalidation, a server→browser refresh stream, and an honest live/polling badge. That plan is COMPLETE, verified, merged, and deployed. The next thread picks up the documented Phase-2 follow-up (per-source invalidation), the known perf hotspot, and backlog hygiene.

## Entry artifacts (read these first)
1. `.omo/plans/opencode-sse-realtime.md` — the completed plan plus its Execution Record: the full decision trail (broken upstream assumptions, badge/state design, clearCache vs store-drop ruling, Oracle SDK verdict, deploy automation). Read the Execution Record bottom-up; it is the ground truth for "why things are the way they are".
2. `scripts/deploy.sh` + `.git/hooks/post-merge` + `~/.config/systemd/user/ez-omo-dash.service.d/realtime.conf` — the deploy pipeline. Merges to master auto-deploy: test → build → rsync to the install copy → restart → health + SSE-frame check.
3. `src/ingest/opencode-sse-client.ts` — the raw-fetch SSE client (Basic auth, backoff reconnect, best-effort `?after`, 45s silence watchdog). The SDK-vs-raw-fetch question is SETTLED (Oracle ruling in the Execution Record) — do not reopen without new evidence.

## State
- Done (all on master, local only):
  - Wave commits `a9b3478` (client/bus/fixtures/mapper), `db78d86` (sanitized real-capture fixtures), `cec7a55` (debounced invalidation + DashboardStore.clearCache), `f1c0385` (GET /api/events), `0ff88da` (Basic auth), `8680394` (UI subscription + badge), `98627a3` + `78322e1` (upstream-state propagation, awaited worker invalidation, randomized e2e port, constructible mocks), `ee0e631` (post-merge mock fix), deploy script + `6d15f50` (silence watchdog).
  - Verification: 337/337 unit, e2e 2/2, tsc at 11 pre-existing baseline errors, real-event→DOM latency measured 81ms, live service on :4300 reporting upstream `connected`.
  - Final verification wave: F2/F3 APPROVE; F1's last blocker closed by direct measurement; F4's findings all fixed (SDK fork resolved by Oracle ruling).
  - Key subagent sessions (recoverable if needed): Oracle SDK ruling `ses_f324b77d5ffeU5Oxg9Fqp39c3f`; F3 QA `ses_f329f868ffeSSxXF9GeRWe3tA`.
- In flight: nothing. No background tasks, no open teams of ours.
- Known gotchas / landmines:
  - **master is NOT pushed.** `origin/feat/project-list-mode` has diverged; delete the local + remote feature branches only after master is pushed and verified.
  - The live service runs from `~/.local/share/omo-pulse` — a plain-copy install owned by `scripts/deploy.sh`. Never edit code there; never delete it.
  - OpenCode's real server on this host is `127.0.0.1:3021` with Basic auth (credentials via `~/.config/opencode/serve.env`, wired through the systemd drop-in). The plan's `:4096` default does not exist here.
  - Upstream `/global/event`: NO replay (`?after` ignored, no SSE id) and NOT metadata-only (frames carry prompt/tool content — sanitize any capture: secrets scan + >60-char string strip + path genericization).
  - Invalidation is currently GLOBAL: each debounced refresh clears every DashboardStore, so a warm refetch recomputes all ~30 projects (~13.6s cold `/api/projects`). This is the Phase-2 target, by design.
  - Z.AI models hit a 5h usage limit until ~17:20 today; fallback models worked but with retry roulette. Plan delegation accordingly.
  - A foreign team `cluster-b-investigation` (4 members, project-scoped) is active in this project — NOT this thread's; do not close it.
  - Untracked scratch in the tree: `test-badge.ts`, `test-badge2.ts`, `tests/e2e/temp_check.spec.ts`, plus `.omo/`, `.opencode/`, `.vera/`, `.sisyphus/plans/opencode-sse-realtime.md` (untracked by convention).

## Next steps
1. **Push + branch cleanup** (operator authorization required first). Done when `origin/master == 6d15f50` and the diverged `feat/project-list-mode` local/remote branches are deleted.
2. **Phase 2 — per-source invalidation.** Events carry `directory`; map to projectRoot and clear only the matching DashboardStore (+ per-source payload cache). Done when a unit test proves a project-A event does not clear project B's store, and a warm `/api/projects` refetch after a single-project event returns in < 1s.
3. **Perf — cold `/api/projects` ≈ 13.6s.** Likely folds into step 2; independently, investigate stagger/warm-up of the aggregate payload. Done when p95 warm refetch < 1s and cold start < 5s for 30 projects.
4. **Backlog triage** (operator decision): `.omo/plans/refactor-code-quality.md` is 31/180 checkboxes with a stale April boulder state — resume, archive, or rewrite. Also decide: fix or waive the 11 pre-existing tsc errors (`src/server/dashboard.ts` 2, `multi-project.ts` 1, `project-strip-history.test.tsx` 2, `useDashboardData.ts` 3, `useProjectOrder.ts` 3).
5. **Hygiene sweep**: delete the scratch files above; verify the foreign team is closed by its owner.
6. **Longer horizon** (Portable Supervisor prototype, contract-first per `~/ez-omo-config/docs/portable-supervisor-contract.md`): attention queue / escalations from the supervisor ledger into omo-pulse. Cross-repo: contract → voice-bridge → dash.

## Prohibitions
- Do NOT push, force-push, or delete remote branches without explicit operator authorization.
- Do NOT edit or delete anything under `~/.local/share/omo-pulse` (deploy.sh owns it) or `~/.config/systemd/user/ez-omo-dash.service.d/` without re-verifying the drop-in chain.
- Do NOT write to OpenCode's SQLite — omo-pulse is a read-only observer.
- Do NOT add runtime dependencies; the SDK-vs-raw-fetch decision is settled (Execution Record, Oracle ruling).
- Do NOT modify `vite.config.ts` or the build pipeline without an explicit request.
- Do NOT touch the `cluster-b-investigation` team.
- On resume: present this artifact's decision checkpoint (continue / revise / archive) BEFORE executing anything.

## UPDATE 2026-10-06 — menu items 1-5 executed
- Item 1 moot: parallel agents merged PRs #74-78 to origin/master during the idle gap (local head now fc1d8b3→4d69ad7→24708de); branches already cleaned.
- Item 2 DONE: per-source invalidation (`4d69ad7`) — resolveProjectRoot + scoped store clears + global fallback.
- Item 3 PARTIAL: warm refetch 7-109ms (MET); cold start 10.4s vs <5s target — remaining work: parallelize store builds (stagger redesign), single-flight + boot-warm shipped (`24708de`).
- Item 4 DONE elsewhere: refactor plan already archived; tsc baseline zero.
- Item 5 DONE elsewhere: scratch swept; foreign team is owner-managed.
- New next steps: (a) cold-start parallelization; (b) review the two weeks of merged UI work for roadmap fit (supervisor-attention-view, voice-widget-remote-ui plans now exist in .omo/plans/); (c) push master (`4d69ad7`/`24708de` are local-only — verify with git status -sb).
