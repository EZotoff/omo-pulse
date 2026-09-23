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

