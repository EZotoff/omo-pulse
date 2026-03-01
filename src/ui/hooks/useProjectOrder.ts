import { useState, useCallback, useEffect } from "react"
import { ProjectOrderState } from "../../types"

const STORAGE_KEY = "dashboard-project-order"

/** Read persisted project order state from localStorage, returning defaults on failure */
function readPersistedState(): ProjectOrderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { orderedIds: [], columns: 1 }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "orderedIds" in parsed &&
      "columns" in parsed &&
      Array.isArray((parsed as Record<string, unknown>).orderedIds) &&
      typeof (parsed as Record<string, unknown>).columns === "number"
    ) {
      return parsed as ProjectOrderState
    }
    return { orderedIds: [], columns: 1 }
  } catch {
    return { orderedIds: [], columns: 1 }
  }
}

/** Persist project order state to localStorage, silently failing if unavailable */
function persistState(state: ProjectOrderState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage may be unavailable (private browsing, quota exceeded) */
  }
}

/**
 * Manages project strip ordering and column count for the DnD grid layout.
 * State is persisted to localStorage so the layout survives page reloads.
 */
export function useProjectOrder(): {
  orderedIds: string[]
  columns: number
  reorder: (oldIndex: number, newIndex: number) => void
  setColumns: (n: number) => void
  syncIds: (currentIds: string[]) => void
} {
  const [state, setState] = useState<ProjectOrderState>(() => readPersistedState())

  /* Persist to localStorage whenever state changes */
  useEffect(() => {
    persistState(state)
  }, [state])

  const reorder = useCallback((oldIndex: number, newIndex: number) => {
    setState((prev) => {
      const next = [...prev.orderedIds]
      const [item] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, item)
      return { ...prev, orderedIds: next }
    })
  }, [])

  const setColumns = useCallback((n: number) => {
    setState((prev) => ({ ...prev, columns: n }))
  }, [])

  const syncIds = useCallback((currentIds: string[]) => {
    setState((prev) => {
      // Preserve order of existing IDs that are still in currentIds
      const retained = prev.orderedIds.filter((id) => currentIds.includes(id))
      // Add new IDs not yet in orderedIds
      const added = currentIds.filter((id) => !prev.orderedIds.includes(id))
      return { ...prev, orderedIds: [...retained, ...added] }
    })
  }, [])

  return { orderedIds: state.orderedIds, columns: state.columns, reorder, setColumns, syncIds }
}
