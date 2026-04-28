import type { AutomationTier, CapabilityEntry } from "./types.js";

/**
 * Static capability registry — maps decision types to executable primitives.
 *
 * Exactly 3 Tier-1 entries. No Tier 2+ capabilities. No cross-project scope.
 * This is a deterministic, config-like lookup table.
 *
 * @see /home/ezotoff/omo-hub/.sisyphus/plans/plan-b-implementation.md
 */

const REGISTRY: readonly CapabilityEntry[] = Object.freeze([
  {
    decisionType: "mark_plan_stale",
    primitive: "update_ledger_status",
    riskClass: "low",
    minTier: "tier1",
    description: "Mark a plan as stale by updating its ledger status",
  },
  {
    decisionType: "log_session_stalled",
    primitive: "append_drift_event",
    riskClass: "low",
    minTier: "tier1",
    description: "Log a stalled session as a drift event",
  },
  {
    decisionType: "notify_question_pending",
    primitive: "publish_advisory",
    riskClass: "low",
    minTier: "tier1",
    description: "Publish an advisory for a pending question",
  },
]);

/**
 * Look up a capability entry by decision type.
 * Returns `undefined` for unknown/unregistered decision types.
 */
export function getCapability(
  decisionType: string,
): CapabilityEntry | undefined {
  return REGISTRY.find((e) => e.decisionType === decisionType);
}

/**
 * List all registered capabilities.
 */
export function listCapabilities(): readonly CapabilityEntry[] {
  return REGISTRY;
}

/**
 * Check whether a decision type is allowed at the given automation tier.
 *
 * - Unknown decision types → `false` (denied)
 * - Decision requires tier1 but current tier is shadow → `false` (denied)
 * - Decision requires tier1 and current tier is tier1 → `true` (allowed)
 */
export function isAllowed(
  decisionType: string,
  currentTier: AutomationTier,
): boolean {
  const entry = getCapability(decisionType);
  if (!entry) return false;

  const tierOrder: Record<AutomationTier, number> = { shadow: 0, tier1: 1 };
  const currentLevel = tierOrder[currentTier];
  const requiredLevel = tierOrder[entry.minTier];

  return currentLevel >= requiredLevel;
}
