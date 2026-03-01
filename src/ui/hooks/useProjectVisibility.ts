import { useState, useCallback, useEffect } from "react"
import type { VisibilityConfig } from "../../types"

const STORAGE_KEY = "dashboard-project-visibility"

/** Read persisted visibility state from localStorage, returning defaults on failure */
function readPersistedState(): VisibilityConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as VisibilityConfig
    }
    return {}
  } catch {
    return {}
  }
}

/** Persist visibility state to localStorage, silently failing if unavailable */
function persistState(state: VisibilityConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage may be unavailable (private browsing, quota exceeded) */
  }
}

/**
 * Manages per-project visibility toggles.
 * State is persisted to localStorage so visibility survives page reloads.
 * Projects default to visible when not explicitly set.
 */
export function useProjectVisibility(): {
  visibility: VisibilityConfig
  setVisibility: React.Dispatch<React.SetStateAction<VisibilityConfig>>
  isVisible: (sourceId: string) => boolean
  toggleVisibility: (sourceId: string) => void
} {
  const [visibility, setVisibility] = useState<VisibilityConfig>(() => readPersistedState())

  /* Persist to localStorage whenever state changes */
  useEffect(() => {
    persistState(visibility)
  }, [visibility])

  const isVisible = useCallback(
    (sourceId: string): boolean => visibility[sourceId] !== false,
    [visibility],
  )

  const toggleVisibility = useCallback((sourceId: string) => {
    setVisibility((prev) => ({
      ...prev,
      [sourceId]: prev[sourceId] === false ? true : false,
    }))
  }, [])

  return { visibility, setVisibility, isVisible, toggleVisibility }
}
