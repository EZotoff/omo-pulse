import { useMemo } from "react"

export type DensityMode = "comfortable" | "dense" | "ultra-dense"

/**
 * Auto-detect density mode based on how many projects are displayed.
 *
 * - comfortable (2–5): standard strip height, padding, font
 * - dense (6–10): tighter strips, smaller font
 * - ultra-dense (10+): minimal padding, abbreviated
 */
export function useDensityMode(projectCount: number): DensityMode {
  return useMemo<DensityMode>(() => {
    if (projectCount <= 5) return "comfortable"
    if (projectCount <= 10) return "dense"
    return "ultra-dense"
  }, [projectCount])
}
