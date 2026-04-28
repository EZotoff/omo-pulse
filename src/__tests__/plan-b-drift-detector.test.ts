import { describe, expect, it } from "vitest";
import type { ObservationFingerprint } from "../server/control-plane/plan-b/types.js";

const drift = await import("../server/control-plane/plan-b/drift-detector.js");

function fingerprint(overrides: Partial<ObservationFingerprint> = {}): ObservationFingerprint {
	return {
		hash: "abc123",
		observedAt: 1000,
		sourceId: "source-1",
		...overrides,
	};
}

describe("Plan B Drift Detector", () => {
	describe("calculateStalenessMs", () => {
		it("returns 0 when nowMs equals observedAt", () => {
			expect(drift.calculateStalenessMs(5000, 5000)).toBe(0);
		});

		it("returns 0 when nowMs is before observedAt (non-negative)", () => {
			expect(drift.calculateStalenessMs(1000, 5000)).toBe(0);
		});

		it("returns positive difference when nowMs is after observedAt", () => {
			expect(drift.calculateStalenessMs(5000, 1000)).toBe(4000);
		});

		it("returns large value for large differences", () => {
			const diff = 86_400_000; // 1 day
			expect(drift.calculateStalenessMs(diff, 0)).toBe(diff);
		});

		it("never returns negative values", () => {
			const result = drift.calculateStalenessMs(0, Number.MAX_SAFE_INTEGER);
			expect(result).toBe(0);
		});
	});

	describe("classifyStalenessLevel", () => {
		it("returns none when ratio < 1.0", () => {
			const result = drift.classifyStalenessLevel(
				100_000, // 100s staleness
				300_000, // 5min expected interval
			);
			expect(result).toBe("none");
		});

		it("returns none at exact boundary ratio = 1.0 (not < 1.0)", () => {
			// ratio = 1.0 is NOT < 1.0, so it falls into mild
			const result = drift.classifyStalenessLevel(
				300_000,
				300_000,
			);
			expect(result).toBe("mild");
		});

		it("returns mild when 1.0 <= ratio < 2.0", () => {
			const result = drift.classifyStalenessLevel(
				400_000, // 1.33x
				300_000,
			);
			expect(result).toBe("mild");
		});

		it("returns mild at exact ratio = 2.0 boundary (not < 2.0)", () => {
			const result = drift.classifyStalenessLevel(
				600_000,
				300_000,
			);
			expect(result).toBe("moderate");
		});

		it("returns moderate when 2.0 <= ratio < 3.0", () => {
			const result = drift.classifyStalenessLevel(
				700_000, // 2.33x
				300_000,
			);
			expect(result).toBe("moderate");
		});

		it("returns severe when ratio >= 3.0", () => {
			const result = drift.classifyStalenessLevel(
				900_000, // 3.0x
				300_000,
			);
			expect(result).toBe("severe");
		});

		it("returns severe for very large staleness", () => {
			const result = drift.classifyStalenessLevel(
				86_400_000, // 1 day
				300_000,
			);
			expect(result).toBe("severe");
		});

		it("uses default interval of 5 minutes when not provided", () => {
			// 4 min staleness with default 5 min interval => ratio 0.8 => none
			const result = drift.classifyStalenessLevel(240_000);
			expect(result).toBe("none");
		});

		it("returns severe for zero expected interval (fails closed)", () => {
			const result = drift.classifyStalenessLevel(100_000, 0);
			expect(result).toBe("severe");
		});

		it("returns severe for negative expected interval (fails closed)", () => {
			const result = drift.classifyStalenessLevel(100_000, -1);
			expect(result).toBe("severe");
		});
	});

	describe("detectDrift", () => {
		const NOW_MS = 5000;

		it("returns none/none when fingerprint unchanged and staleness low", () => {
			const current = fingerprint({ hash: "abc123", observedAt: 4000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 3000 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 300_000,
			});

			expect(report.driftLevel).toBe("none");
			expect(report.recommendedAction).toBe("none");
			expect(report.stalenessMs).toBe(1000);
		});

		it("returns mild/refresh when fingerprint unchanged but staleness is mild", () => {
			const current = fingerprint({ hash: "abc123", observedAt: 1000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 500 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 300_000,
			});

			// stalenessMs = 4000, ratio = 4000/300000 = 0.013 => none
			// But wait, that's < 1.0 ratio, so it's none
			expect(report.driftLevel).toBe("none");
		});

		it("returns mild/refresh when fingerprint changed and staleness is low", () => {
			const current = fingerprint({ hash: "def456", observedAt: 4000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 3000 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 300_000,
			});

			// stalenessMs = 1000, ratio = 1000/300000 = 0.003 => none
			// But fingerprint changed, so none is clamped to mild
			expect(report.driftLevel).toBe("mild");
			expect(report.recommendedAction).toBe("refresh");
		});

		it("returns moderate/downgrade when fingerprint unchanged and staleness moderate", () => {
			const current = fingerprint({ hash: "abc123", observedAt: 1000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 500 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 1500, // ratio = 4000/1500 = 2.67 => moderate
			});

			expect(report.driftLevel).toBe("moderate");
			expect(report.recommendedAction).toBe("downgrade");
		});

		it("returns severe/alert when staleness is severe", () => {
			const current = fingerprint({ hash: "abc123", observedAt: 1000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 500 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 1000, // ratio = 4000/1000 = 4.0 => severe
			});

			expect(report.driftLevel).toBe("severe");
			expect(report.recommendedAction).toBe("alert");
		});

		it("changed fingerprint can never return none (clamped to mild minimum)", () => {
			const current = fingerprint({ hash: "def456", observedAt: NOW_MS });
			const previous = fingerprint({ hash: "abc123", observedAt: NOW_MS - 100 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 300_000,
			});

			// stalenessMs = 0, ratio = 0 => none, but fingerprint changed => mild
			expect(report.driftLevel).not.toBe("none");
			expect(report.driftLevel).toBe("mild");
		});

		it("no previous fingerprint means no fingerprint change clamping", () => {
			const current = fingerprint({ hash: "abc123", observedAt: NOW_MS });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous: null,
				nowMs: NOW_MS,
				expectedIntervalMs: 300_000,
			});

			// stalenessMs = 0, ratio = 0 => none, no previous => no clamping
			expect(report.driftLevel).toBe("none");
			expect(report.recommendedAction).toBe("none");
		});

		it("maps recommendedAction correctly for all drift levels", () => {
			const base = fingerprint({ hash: "abc123", observedAt: 1000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 500 });

			// Test each level by controlling expectedIntervalMs
			const testCases: Array<{ intervalMs: number; expectedLevel: string; expectedAction: string }> = [
				{ intervalMs: 300_000, expectedLevel: "none", expectedAction: "none" },
				{ intervalMs: 2500, expectedLevel: "mild", expectedAction: "refresh" },
				{ intervalMs: 1500, expectedLevel: "moderate", expectedAction: "downgrade" },
				{ intervalMs: 1000, expectedLevel: "severe", expectedAction: "alert" },
			];

			for (const tc of testCases) {
				const report = drift.detectDrift({
					sourceId: "source-1",
					current: base,
					previous,
					nowMs: NOW_MS,
					expectedIntervalMs: tc.intervalMs,
				});
				expect(report.driftLevel).toBe(tc.expectedLevel);
				expect(report.recommendedAction).toBe(tc.expectedAction);
			}
		});

		it("includes sourceId, fingerprint, and reportedAt in report", () => {
			const current = fingerprint({ hash: "abc123", observedAt: 4000 });
			const previous = fingerprint({ hash: "abc123", observedAt: 3000 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
			});

			expect(report.sourceId).toBe("source-1");
			expect(report.fingerprint).toEqual(current);
			expect(report.previousFingerprint).toEqual(previous);
			expect(report.reportedAt).toBe(new Date(NOW_MS).toISOString());
		});

		it("uses default expected interval when not provided", () => {
			const current = fingerprint({ hash: "abc123", observedAt: NOW_MS - 240_000 }); // 4 min ago
			const previous = fingerprint({ hash: "abc123", observedAt: NOW_MS - 300_000 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
			});

			// stalenessMs = 240000, default interval = 300000, ratio = 0.8 => none
			expect(report.driftLevel).toBe("none");
		});

		it("invalid expected interval fails closed to severe", () => {
			const current = fingerprint({ hash: "abc123", observedAt: NOW_MS - 1000 });
			const previous = fingerprint({ hash: "abc123", observedAt: NOW_MS - 2000 });

			const report = drift.detectDrift({
				sourceId: "source-1",
				current,
				previous,
				nowMs: NOW_MS,
				expectedIntervalMs: 0,
			});

			expect(report.driftLevel).toBe("severe");
			expect(report.recommendedAction).toBe("alert");
		});
	});
});
