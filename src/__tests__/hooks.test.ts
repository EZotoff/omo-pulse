import { describe, it, expect } from "vitest"
import type { DensityMode } from "../ui/hooks/useDensityMode"

// ---------------------------------------------------------------------------
// useDensityMode: Test the pure threshold logic
// (The hook itself wraps useMemo, so we replicate the threshold function here)
// ---------------------------------------------------------------------------

function computeDensityMode(projectCount: number): DensityMode {
  if (projectCount <= 5) return "comfortable"
  if (projectCount <= 10) return "dense"
  return "ultra-dense"
}

describe("useDensityMode threshold logic", () => {
  it("returns 'comfortable' for 0 projects", () => {
    expect(computeDensityMode(0)).toBe("comfortable")
  })

  it("returns 'comfortable' for exactly 5 projects", () => {
    expect(computeDensityMode(5)).toBe("comfortable")
  })

  it("returns 'dense' for 6 projects", () => {
    expect(computeDensityMode(6)).toBe("dense")
  })

  it("returns 'dense' for exactly 10 projects", () => {
    expect(computeDensityMode(10)).toBe("dense")
  })

  it("returns 'ultra-dense' for 11 projects", () => {
    expect(computeDensityMode(11)).toBe("ultra-dense")
  })

  it("returns 'ultra-dense' for 100 projects", () => {
    expect(computeDensityMode(100)).toBe("ultra-dense")
  })
})

// ---------------------------------------------------------------------------
// useExpandState: Test the Set-based toggle / expandAll / collapseAll logic
// (The hook uses useState + useCallback; we replicate the pure state transforms)
// ---------------------------------------------------------------------------

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  return next
}

describe("useExpandState logic", () => {
  it("toggle adds an ID to an empty set", () => {
    const result = toggleInSet(new Set(), "proj-1")
    expect(result.has("proj-1")).toBe(true)
    expect(result.size).toBe(1)
  })

  it("toggle removes an existing ID", () => {
    const initial = new Set(["proj-1", "proj-2"])
    const result = toggleInSet(initial, "proj-1")
    expect(result.has("proj-1")).toBe(false)
    expect(result.has("proj-2")).toBe(true)
    expect(result.size).toBe(1)
  })

  it("expandAll creates a set with all given IDs", () => {
    const allIds = ["a", "b", "c"]
    const result = new Set(allIds)
    expect(result.size).toBe(3)
    expect(result.has("a")).toBe(true)
    expect(result.has("b")).toBe(true)
    expect(result.has("c")).toBe(true)
  })

  it("collapseAll creates an empty set", () => {
    const result = new Set<string>()
    expect(result.size).toBe(0)
  })

  it("toggle is idempotent: toggling twice restores original state", () => {
    const initial = new Set(["x"])
    const afterFirst = toggleInSet(initial, "x")
    expect(afterFirst.has("x")).toBe(false)
    const afterSecond = toggleInSet(afterFirst, "x")
    expect(afterSecond.has("x")).toBe(true)
  })
})
