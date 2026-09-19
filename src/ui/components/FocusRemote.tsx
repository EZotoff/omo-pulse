import { useState, useRef, useCallback, memo } from "react"
import type { AttentionProject, AttentionSession } from "../../types"
import { useAttention } from "../hooks/useAttention"
import { useFocusRemoteControls } from "../hooks/useFocusRemoteControls"
import "./FocusRemote.css"

/* ── Helpers ── */

const URGENT_STATES = new Set(["question", "error"])

function formatWait(waitMs: number): string {
  const seconds = Math.max(0, Math.floor(waitMs / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/* ── One session card (top item or queue item) ── */

type FocusTargetButtonProps = {
  sourceId: string
  session: AttentionSession
  onHidden?: (sessionId: string) => void
  onFocus: (sourceId: string, sessionId: string) => void
  isSelected: boolean
  isSwitching: boolean
  focusError: string | null
}

function FocusTargetButton({
  sourceId,
  session,
  onHidden,
  onFocus,
  isSelected,
  isSwitching,
  focusError,
}: FocusTargetButtonProps) {
  const [hideError, setHideError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const onHide = useCallback(() => {
    if (busyRef.current) return
    void fetch(`/api/attention/hide/${encodeURIComponent(session.sessionId)}`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        onHidden?.(session.sessionId)
      })
      .catch(() => {
        setHideError("could not hide session")
      })
  }, [session.sessionId, onHidden])

  const urgent = URGENT_STATES.has(session.state)

  return (
    <div className="focus-cardwrap">
      <button
        type="button"
        className={`focus-target${urgent ? " focus-target--urgent" : ""}${isSelected ? " focus-target--selected" : ""}`}
        data-state={session.state}
        data-session-id={session.sessionId}
        onClick={() => onFocus(sourceId, session.sessionId)}
        onMouseEnter={onPrewarm}
        disabled={isSwitching}
      >
        <span className="focus-t-main">
          <span className="focus-t-label">{session.sessionLabel}</span>
          <span className="focus-t-wait">{formatWait(session.waitMs)}</span>
        </span>
        <span className="focus-t-focus">{isSwitching ? "switching…" : "FOCUS ▶"}</span>
      </button>
      <button
        type="button"
        className="focus-hide"
        title="Hide this session from the attention list"
        aria-label={`Hide session ${session.sessionLabel}`}
        onClick={onHide}
      >
        ✕
      </button>
      {(focusError ?? hideError) && (
        <div className="focus-error" role="alert">
          {focusError ?? hideError}
        </div>
      )}
    </div>
  )
}

const MemoFocusTarget = memo(FocusTargetButton)

/* ── Component ── */

type ViewMode = "top" | "all"

export function FocusRemote() {
  const { projects, connected, hiddenCount, refresh } = useAttention()
  const [viewMode, setViewMode] = useState<ViewMode>("top")

  const attention = projects.filter((p) => p.next !== null)
  const busy = projects.filter((p) => p.next === null && p.busySessions > 0)
  const allClear = attention.length === 0
  const controls = useFocusRemoteControls(attention)

  const onHidden = useCallback(() => {
    controls.clearSelection()
    void refresh()
  }, [controls, refresh])

  const unhideAll = useCallback(() => {
    void fetch("/api/attention/unhide-all", { method: "POST" }).then(() => refresh())
  }, [refresh])

  return (
    <div className="focus-remote" data-connected={connected}>
      <header className="focus-rhead">
        <span className="focus-rdot" aria-hidden="true" />
        <h1>
          omo-pulse <span>· focus remote</span>
        </h1>
        <div className="focus-viewtoggle" role="group" aria-label="Sessions per project">
          <button
            type="button"
            className={viewMode === "top" ? "is-active" : ""}
            onClick={() => setViewMode("top")}
          >
            top
          </button>
          <button
            type="button"
            className={viewMode === "all" ? "is-active" : ""}
            onClick={() => setViewMode("all")}
          >
            all
          </button>
        </div>
      </header>
      <main className="focus-list">
        <button
          type="button"
          className="focus-next"
          onClick={controls.focusNext}
          disabled={allClear || controls.switchingId !== null}
        >
          {controls.switchingId === "next" ? "switching…" : "▶ NEXT"}
        </button>
        {controls.nextError && <div className="focus-error focus-next-error" role="alert">{controls.nextError}</div>}
        {allClear ? (
          <div className="focus-clear-panel">
            <div className="focus-clear-ck" aria-hidden="true">
              ✓
            </div>
            <h2>All clear</h2>
            <p>no sessions need your attention right now</p>
          </div>
        ) : (
          attention.map((project) => {
            const expanded = viewMode === "all" || controls.expandedIds.has(project.sourceId)
            const visible = expanded ? project.sessions : project.sessions.slice(0, 1)
            return (
              <div className="focus-project" key={project.sourceId}>
                <div className="focus-proj-head">
                  {project.sessions.length > 1 ? (
                    <button
                      type="button"
                      className="focus-chevron"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${project.label} session queue`}
                      title={expanded ? "Show top session only" : `Show all ${project.sessions.length} waiting sessions`}
                      onClick={() => controls.toggleProject(project.sourceId)}
                    >
                      {expanded ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="focus-chevron focus-chevron--spacer" aria-hidden="true" />
                  )}
                  <span className="focus-pname">{project.label}</span>
                  <span className="focus-ptime">{formatWait(visible[0].waitMs)}</span>
                </div>
                {visible.map((session) => (
                  <MemoFocusTarget
                    key={session.sessionId}
                    sourceId={project.sourceId}
                    session={session}
                    onHidden={onHidden}
                    onFocus={controls.focusTarget}
                    isSelected={controls.selectedId === session.sessionId}
                    isSwitching={controls.switchingId === session.sessionId}
                    focusError={controls.focusError?.sessionId === session.sessionId ? controls.focusError.message : null}
                  />
                ))}
                {!expanded && project.queue > 0 && (
                  <button
                    type="button"
                    className="focus-queue focus-queue--button"
                    onClick={() => controls.toggleProject(project.sourceId)}
                  >
                    +{project.queue} more waiting
                  </button>
                )}
              </div>
            )
          })
        )}
        {busy.length > 0 && (
          <>
            <div className="focus-divider">all busy</div>
            {busy.map((project) => (
              <div key={project.sourceId} className="focus-busy-row">
                <span>{project.label}</span>
                <span className="focus-busy-n">{project.busySessions} working</span>
              </div>
            ))}
          </>
        )}
      </main>
      {(hiddenCount ?? 0) > 0 && (
        <footer className="focus-rfoot">
          <span className="focus-hidden-n">{hiddenCount} hidden</span>
          <button type="button" className="focus-linkish" onClick={unhideAll}>
            show hidden
          </button>
        </footer>
      )}
    </div>
  )
}
