import { useState, useCallback, useEffect } from "react"

const STORAGE_KEY = "ez-dash-expanded"

/** Read persisted expanded IDs from localStorage, returning empty Set on failure */
function readPersistedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === "string"))
  } catch {
    return new Set()
  }
}

/** Persist expanded IDs to localStorage, silently failing if unavailable */
function persistIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* localStorage may be unavailable (private browsing, quota exceeded) */
  }
}

/**
 * Manages which project strips are expanded/collapsed.
 * State is persisted to localStorage so expand state survives page reloads.
 */
export function useExpandState(): {
  expandedIds: Set<string>
  toggle: (sourceId: string) => void
  expandAll: (allIds: string[]) => void
  collapseAll: () => void
} {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => readPersistedIds())

  /* Persist to localStorage whenever expandedIds changes */
  useEffect(() => {
    persistIds(expandedIds)
  }, [expandedIds])

  const toggle = useCallback((sourceId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) {
        next.delete(sourceId)
      } else {
        next.add(sourceId)
      }
      return next
    })
  }, [])

  const expandAll = useCallback((allIds: string[]) => {
    setExpandedIds(new Set(allIds))
  }, [])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  return { expandedIds, toggle, expandAll, collapseAll }
}
