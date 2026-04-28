import { describe, expect, it } from "vitest";
import {
	getCapability,
	isAllowed,
	listCapabilities,
} from "../server/control-plane/plan-b/capability-registry";
import type { AutomationTier } from "../server/control-plane/plan-b/types";

// ─── listCapabilities ──────────────────────────────────────────────────

describe("listCapabilities", () => {
	it("returns exactly 3 capabilities", () => {
		const caps = listCapabilities();
		expect(caps).toHaveLength(3);
	});

	it("includes mark_plan_stale", () => {
		const caps = listCapabilities();
		const types = caps.map((c) => c.decisionType);
		expect(types).toContain("mark_plan_stale");
	});

	it("includes log_session_stalled", () => {
		const caps = listCapabilities();
		const types = caps.map((c) => c.decisionType);
		expect(types).toContain("log_session_stalled");
	});

	it("includes notify_question_pending", () => {
		const caps = listCapabilities();
		const types = caps.map((c) => c.decisionType);
		expect(types).toContain("notify_question_pending");
	});

	it("all capabilities are tier1", () => {
		const caps = listCapabilities();
		for (const cap of caps) {
			expect(cap.minTier).toBe("tier1");
		}
	});

	it("all capabilities are low risk", () => {
		const caps = listCapabilities();
		for (const cap of caps) {
			expect(cap.riskClass).toBe("low");
		}
	});

	it("returns a frozen/readonly array", () => {
		const caps = listCapabilities();
		expect(Object.isFrozen(caps)).toBe(true);
	});
});

// ─── getCapability ─────────────────────────────────────────────────────

describe("getCapability", () => {
	it("returns entry for mark_plan_stale", () => {
		const entry = getCapability("mark_plan_stale");
		expect(entry).toBeDefined();
		expect(entry!.decisionType).toBe("mark_plan_stale");
		expect(entry!.primitive).toBe("update_ledger_status");
	});

	it("returns entry for log_session_stalled", () => {
		const entry = getCapability("log_session_stalled");
		expect(entry).toBeDefined();
		expect(entry!.decisionType).toBe("log_session_stalled");
		expect(entry!.primitive).toBe("append_drift_event");
	});

	it("returns entry for notify_question_pending", () => {
		const entry = getCapability("notify_question_pending");
		expect(entry).toBeDefined();
		expect(entry!.decisionType).toBe("notify_question_pending");
		expect(entry!.primitive).toBe("publish_advisory");
	});

	it("returns undefined for unknown decision type", () => {
		expect(getCapability("nonexistent")).toBeUndefined();
	});

	it("returns undefined for empty string", () => {
		expect(getCapability("")).toBeUndefined();
	});
});

// ─── isAllowed ─────────────────────────────────────────────────────────

describe("isAllowed", () => {
	it("allows mark_plan_stale at tier1", () => {
		expect(isAllowed("mark_plan_stale", "tier1")).toBe(true);
	});

	it("allows log_session_stalled at tier1", () => {
		expect(isAllowed("log_session_stalled", "tier1")).toBe(true);
	});

	it("allows notify_question_pending at tier1", () => {
		expect(isAllowed("notify_question_pending", "tier1")).toBe(true);
	});

	it("denies mark_plan_stale at shadow tier", () => {
		expect(isAllowed("mark_plan_stale", "shadow")).toBe(false);
	});

	it("denies log_session_stalled at shadow tier", () => {
		expect(isAllowed("log_session_stalled", "shadow")).toBe(false);
	});

	it("denies notify_question_pending at shadow tier", () => {
		expect(isAllowed("notify_question_pending", "shadow")).toBe(false);
	});

	it("denies unknown decision type at tier1", () => {
		expect(isAllowed("unknown_type", "tier1")).toBe(false);
	});

	it("denies unknown decision type at shadow", () => {
		expect(isAllowed("unknown_type", "shadow")).toBe(false);
	});

	it("denies empty string decision type at tier1", () => {
		expect(isAllowed("", "tier1")).toBe(false);
	});
});
