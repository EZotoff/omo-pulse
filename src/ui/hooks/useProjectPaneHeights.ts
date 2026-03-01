import { useState, useCallback, useEffect } from "react"

const STORAGE_KEY = "dashboard-pane-heights"
const DEFAULT_HEIGHT = 400
const MIN_HEIGHT = 150

type PaneHeights = Record<string, number | null>

/** Read persisted pane heights from localStorage, returning empty object on failure */
function readPersistedState(): PaneHeights {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as PaneHeights
    }
    return {}
  } catch {
    return {}
  }
}

/** Persist pane heights to localStorage, silently failing if unavailable */
function persistState(state: PaneHeights): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage may be unavailable (private browsing, quota exceeded) */
  }
}

/**
 * Manages per-pane max-height values with localStorage persistence.
 * Each pane is keyed by sourceId. A value of `null` means "released" (no max-height).
 * A numeric value is the constrained max-height in px (clamped to >= 150).
 */
export function useProjectPaneHeights(): {
  heights: PaneHeights
  setHeight: (sourceId: string, px: number) => void
  releaseHeight: (sourceId: string) => void
  isReleased: (sourceId: string) => boolean
  getHeight: (sourceId: string) => number
} {
  const [heights, setHeights] = useState<PaneHeights>(() => readPersistedState())

  /* Persist to localStorage whenever heights change */
  useEffect(() => {
    persistState(heights)
  }, [heights])

  const setHeight = useCallback((sourceId: string, px: number) => {
    const clamped = Math.max(MIN_HEIGHT, px)
    setHeights((prev) => ({ ...prev, [sourceId]: clamped }))
  }, [])

  const releaseHeight = useCallback((sourceId: string) => {
    setHeights((prev) => ({ ...prev, [sourceId]: null }))
  }, [])

  const isReleased = useCallback(
    (sourceId: string): boolean => heights[sourceId] === null,
    [heights],
  )

  const getHeight = useCallback(
    (sourceId: string): number => {
      const val = heights[sourceId]
      if (val === null || val === undefined) return DEFAULT_HEIGHT
      return val
    },
    [heights],
  )

  return { heights, setHeight, releaseHeight, isReleased, getHeight }
}
