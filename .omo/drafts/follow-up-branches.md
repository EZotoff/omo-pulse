# Draft: Follow-Up Branches from Current Repo State

## Situation Summary

Three local respins are completed and verified (not yet merged to master):
- `fix/timestamp-sanitization` — 3 commits, timestamp guard rails
- `feature/worktree-discovery-respin` — 3 commits, worktree auto-discovery
- `feature/uninitiated-plans-respin` — 3 commits, uninitiated plan detection

Master HEAD: `998f415` (Merge PR #25 status-preview-visual-refresh)

## Work Item 1: Dashboard Lifecycle Extraction

### Current State
- `feature/dashboard-lifecycle-respin` branch exists but is EMPTY (0 commits above master)
- Active worktree at `/home/ezotoff/AI_projects/worktrees/dashboard-lifecycle-respin`
- Source material: Commit `4d284e8` on `fix/nand-ago-bug` (15 files, +874/-30 lines)
- That commit is heavily entangled — mixes lifecycle/history/completed-status/uninitiated-plans/archive concerns

### Entangled Commit Analysis (4d284e8)
**Concerns identified:**
1. **Types layer**: BoulderHistoryEntry, ArchivedPlan, PlanHistory types + boulderStatus/completedAt on ProjectSnapshot
2. **Data layer**: readBoulderHistory() reading .sisyphus/boulder-history.jsonl + scanUnintiatedPlans _archive exclusion
3. **Server layer**: Wire readBoulderHistory into dashboard payload + map through transformPayloadToSnapshot
4. **UI layer**: PlanProgress completed status + ProjectStrip plan history section + CSS
5. **Tests**: 6 test files covering all layers

### Key Overlap
- `scanUnintiatedPlans` in this commit adds `_archive` exclusion
- `feature/uninitiated-plans-respin` adds `scanUnintiatedPlans` WITHOUT `_archive` exclusion
- If uninitiated-plans merges first, lifecycle needs to MODIFY the existing function (not create fresh)

### Extraction Strategy Decision
- **DECIDED**: Full vertical slice (types → data → server → UI → tests)
- The whole point is end-to-end lifecycle feature, not just data layer

## Work Item 2: Project Management UI Sequencing

### Current State
- Branch does NOT exist locally
- Implementation exists only in `fix/nand-ago-bug` commits (78d5820 plan + c995ec0 full impl)
- c995ec0: 16 files, +1755/-359 lines — OverlayShell, ProjectCard, ProjectManagementPanel, projectSearch, e2e tests
- **BLOCKED** behind lifecycle extraction (probably uses plan history/completed status concepts)

### Decision
- **NOT planned now** — acknowledged as next in sequence after lifecycle merges

## Work Item 3: AI Review Copilot-Parser Follow-Up

### Current State
- `ai-review-v2-impl` local and remote are IDENTICAL at `a691e64`
- PR #22 is OPEN, MERGEABLE, CLEAN
- Worktree has dirty (uncommitted) changes: the complete Copilot-parser migration
- Migration is COMPLETE and COHERENT per explore agent analysis

### Dirty Changes Summary
- Deletes: ai-diff-review.ts (584 lines), ai-diff-review.test.ts (392 lines)
- Adds: copilot-review-parser.ts (567 lines), copilot-review-parser.test.ts (466 lines), copilot-instructions.md (76 lines), review-gate.md (165 lines)
- Modifies: workflow yml, merge-scorecards.ts/.test.ts (terminology LLM → Copilot)

### Strategy Decision
- Create new branch from ai-review-v2-impl HEAD (a691e64)
- Commit dirty changes as single coherent commit
- Create follow-up PR targeting master (or targeting ai-review-v2-impl branch)

## Open Questions

1. **Merge order**: Should the 3 completed respins merge to master FIRST before lifecycle extraction? (affects whether scanUnintiatedPlans already exists)
2. **Follow-up PR target**: Should the Copilot-parser PR target master directly, or target the ai-review-v2-impl branch?
3. **ArchivedPlan type**: Is it actually used in the lifecycle slice, or can it be deferred?
4. **Test strategy**: Reuse test code from commit 4d284e8 as-is, or rewrite against current master?

## Scope Boundaries

- **IN**: Lifecycle extraction plan, ai-review follow-up plan, sequencing guidance
- **OUT**: Project management UI plan (blocked), fix/nand-ago-bug cleanup (deferred)
