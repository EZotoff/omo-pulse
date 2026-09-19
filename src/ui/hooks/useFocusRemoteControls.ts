import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AttentionProject } from "../../types"

type FocusError = { readonly sessionId: string; readonly message: string }

export type FocusRemoteControls = {
  readonly expandedIds: ReadonlySet<string>
  readonly selectedId: string | null
  readonly switchingId: string | null
  readonly focusError: FocusError | null
  readonly nextError: string | null
  readonly toggleProject: (sourceId: string) => void
  readonly clearSelection: () => void
  readonly focusTarget: (sourceId: string, sessionId: string) => void
  readonly focusNext: () => void
}

export function useFocusRemoteControls(
  attention: readonly AttentionProject[],
): FocusRemoteControls {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [focusError, setFocusError] = useState<FocusError | null>(null)
  const [nextError, setNextError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const rankedSessions = useMemo(
    () => attention.flatMap((project) =>
      project.sessions.map((session) => ({ sourceId: project.sourceId, session })),
    ),
    [attention],
  )

  const postFocus = useCallback(async (url: string, sessionId: string): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setSwitchingId(sessionId)
    setFocusError(null)
    setNextError(null)
    const minDelay = new Promise((resolve) => setTimeout(resolve, 800))
    try {
      const call = fetch(url, { method: "POST" }).then(async (response) => {
        const body: { ok: boolean; error?: string } = await response.json()
        if (!response.ok || !body.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      })
      await Promise.all([call, minDelay])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (sessionId === "next") setNextError(message)
      else setFocusError({ sessionId, message })
    } finally {
      setSwitchingId(null)
      busyRef.current = false
    }
  }, [])

  const focusTarget = useCallback((sourceId: string, sessionId: string): void => {
    void postFocus(
      `/api/focus/${encodeURIComponent(sourceId)}/${encodeURIComponent(sessionId)}`,
      sessionId,
    )
  }, [postFocus])

  const focusNext = useCallback((): void => {
    if (rankedSessions.length === 0) return
    void postFocus("/api/focus/next", "next")
  }, [postFocus, rankedSessions.length])

  const toggleProject = useCallback((sourceId: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return
      if (event.key === "n") {
        event.preventDefault()
        focusNext()
        return
      }
      if (event.key === "Escape") {
        setSelectedId(null)
        return
      }
      if (rankedSessions.length === 0) return
      const currentIndex = rankedSessions.findIndex(({ session }) => session.sessionId === selectedId)
      if (event.key === "j" || event.key === "ArrowDown" || event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault()
        const direction = event.key === "j" || event.key === "ArrowDown" ? 1 : -1
        const nextIndex = currentIndex < 0
          ? direction > 0 ? 0 : rankedSessions.length - 1
          : (currentIndex + direction + rankedSessions.length) % rankedSessions.length
        const selected = rankedSessions[nextIndex]
        if (!selected) return
        setSelectedId(selected.session.sessionId)
        setExpandedIds((current) => new Set(current).add(selected.sourceId))
        return
      }
      if (event.key === "Enter" || event.key === " ") {
        const selected = rankedSessions.find(({ session }) => session.sessionId === selectedId)
        if (!selected) return
        event.preventDefault()
        focusTarget(selected.sourceId, selected.session.sessionId)
        return
      }
      if (/^[1-9]$/.test(event.key)) {
        const selected = rankedSessions[Number(event.key) - 1]
        if (!selected) return
        event.preventDefault()
        setSelectedId(selected.session.sessionId)
        setExpandedIds((current) => new Set(current).add(selected.sourceId))
        focusTarget(selected.sourceId, selected.session.sessionId)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [focusNext, focusTarget, rankedSessions, selectedId])

  useEffect(() => {
    if (!selectedId) return
    document.querySelector<HTMLElement>(`[data-session-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" })
  }, [selectedId, expandedIds])

  return {
    expandedIds,
    selectedId,
    switchingId,
    focusError,
    nextError,
    toggleProject,
    clearSelection: () => setSelectedId(null),
    focusTarget,
    focusNext,
  }
}
