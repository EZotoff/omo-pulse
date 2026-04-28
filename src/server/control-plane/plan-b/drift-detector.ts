import type { DriftReport, ObservationFingerprint, StalenessLevel } from "./types.js";

/**
 * Default expected observation interval (5 minutes).
 *
 * Used as the baseline for staleness ratio classification when no explicit
 * interval is provided.
 */
export const DEFAULT_EXPECTED_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Calculate raw staleness in milliseconds.
 *
 * Returns a non-negative value representing how long ago the observation
 * was captured.
 */
export function calculateStalenessMs(nowMs: number, observedAt: number): number {
	return Math.max(0, nowMs - observedAt);
}

/**
 * Classify staleness into a severity level based on ratio to expected interval.
 *
 * Ratio bands (relative to expectedIntervalMs):
 *   < 1.0  → none
 *   < 2.0  → mild
 *   < 3.0  → moderate
 *   >= 3.0 → severe
 *
 * An invalid (<= 0) expected interval is treated as severe to fail closed.
 */
export function classifyStalenessLevel(
	stalenessMs: number,
	expectedIntervalMs: number = DEFAULT_EXPECTED_INTERVAL_MS,
): StalenessLevel {
	if (expectedIntervalMs <= 0) return "severe";
	const ratio = stalenessMs / expectedIntervalMs;
	if (ratio < 1.0) return "none";
	if (ratio < 2.0) return "mild";
	if (ratio < 3.0) return "moderate";
	return "severe";
}

/**
 * Detect drift by comparing the current observation fingerprint against the
 * previous one and classifying staleness.
 *
 * Rules:
 * - If the fingerprint changed (previous exists and hash differs), drift level
 *   is never "none" — it is clamped to at least "mild".
 * - If the fingerprint is the same, drift level is determined purely by
 *   staleness ratio.
 * - Recommended actions are deterministic and fail-closed:
 *     none     → none
 *     mild     → refresh
 *     moderate → downgrade
 *     severe   → alert
 */
export function detectDrift(args: {
	sourceId: string;
	current: ObservationFingerprint;
	previous: ObservationFingerprint | null;
	nowMs: number;
	expectedIntervalMs?: number;
}): DriftReport {
	const expectedIntervalMs =
		args.expectedIntervalMs ?? DEFAULT_EXPECTED_INTERVAL_MS;
	const stalenessMs = calculateStalenessMs(args.nowMs, args.current.observedAt);

	let driftLevel = classifyStalenessLevel(stalenessMs, expectedIntervalMs);

	const fingerprintChanged =
		args.previous !== null && args.previous.hash !== args.current.hash;

	if (fingerprintChanged && driftLevel === "none") {
		driftLevel = "mild";
	}

	const recommendedAction = ((): DriftReport["recommendedAction"] => {
		switch (driftLevel) {
			case "none":
				return "none";
			case "mild":
				return "refresh";
			case "moderate":
				return "downgrade";
			case "severe":
				return "alert";
		}
	})();

	return {
		sourceId: args.sourceId,
		fingerprint: args.current,
		previousFingerprint: args.previous,
		stalenessMs,
		driftLevel,
		recommendedAction,
		reportedAt: new Date(args.nowMs).toISOString(),
	};
}
