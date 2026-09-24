import { useState, useRef, useCallback, memo } from "react"
import type { AttentionProject, AttentionSession, SupervisorQueueItem } from "../../types"
import { useAttention } from "../hooks/useAttention"
import { useSupervisorQueue } from "../hooks/useSupervisorQueue"
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

/* ── Supervisor escalations (Seam 4, read-only ambient) ── */

/** Clamp an excerpt to ~160 chars on a word boundary. */
function clampExcerpt(text: string, max = 160): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Display-only ordering (never written back — the supervisor owns lifecycle):
 * urgency desc → stakes desc → confidence desc → createdAt asc (oldest first).
 * Missing priority fields sort as lowest.
 */
function compareEscalations(a: SupervisorQueueItem, b: SupervisorQueueItem): number {
  const num = (v: number | undefined) => (typeof v === "number" ? v : -Infinity)
  const time = (v: string | undefined) => (typeof v === "string" ? Date.parse(v) : Infinity)
  const pa = a.priority
  const pb = b.priority
  return (
    num(pb?.urgency) - num(pa?.urgency) ||
    num(pb?.stakes) - num(pa?.stakes) ||
    num(pb?.confidence) - num(pa?.confidence) ||
    time(pa?.createdAt) - time(pb?.createdAt)
  )
}

/** Open, non-snoozed items only: terminal lifecycle or a future notBefore hides the item. */
function isOpenEscalation(item: SupervisorQueueItem, nowMs: number): boolean {
  if (item.isResolved) return false
  const notBefore = item.priority?.notBefore
  if (typeof notBefore === "string" && Date.parse(notBefore) > nowMs) return false
  return true
}

type EscalationView = {
  readonly item: SupervisorQueueItem
  readonly shortId: string
  readonly text: string
  readonly targetLabel: string
  readonly href: string
}

function buildEscalationViews(
  items: readonly SupervisorQueueItem[],
  projects: readonly AttentionProject[],
  readAtMs: number,
): EscalationView[] {
  const nowMs = Date.now()
  const open = items.filter((item) => isOpenEscalation(item, nowMs)).sort(compareEscalations)
  return open.slice(0, 8).map((item, index) => {
    const question = item.question ?? item.rationale ?? ""
    const text = question.length > 0 ? clampExcerpt(question) : "(no question text)"
    const root = item.target?.root ?? ""
    const rootBase = root.split("/").filter(Boolean).pop() ?? ""
    /* Map root → project label via the attention projects when possible. */
    const project = projects.find((p) => p.projectRoot === root) ??
      projects.find((p) => p.label.toLowerCase() === rootBase.toLowerCase())
    const targetLabel = project?.label ?? (rootBase.length > 0 ? rootBase : "unknown project")
    /* Deep-link: unused query params are ignored by the dashboard app; they
       document the target for future deep-link routing. Session param only
       when the target sessionID maps to a known attention session. */
    const sessionMatched =
      project !== undefined &&
      item.target?.sessionID !== undefined &&
      project.sessions.some((s) => s.sessionId === item.target?.sessionID)
    const params = new URLSearchParams({ view: "dashboard" })
    if (project !== undefined) params.set("project", project.sourceId)
    if (sessionMatched) params.set("session", item.target?.sessionID ?? "")
    const href = `/?${params.toString()}`
    return {
      item,
      shortId: `Q${index + 1}·${item.id.replace(/^att_/, "")}`,
      text,
      targetLabel,
      href,
    }
  })
}

function formatEscalationAge(item: SupervisorQueueItem, readAtMs: number): string {
  const createdMs = item.priority?.createdAt !== undefined ? Date.parse(item.priority.createdAt) : NaN
  const baseMs = Number.isFinite(createdMs) ? createdMs : readAtMs
  if (!Number.isFinite(baseMs)) return ""
  return formatWait(Math.max(0, Date.now() - baseMs))
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

export function FocusRemote() {
  const { projects, connected, hiddenCount, refresh } = useAttention()
  const { queue, available } = useSupervisorQueue()
  const escalations = available && queue !== null ? buildEscalationViews(queue.items, projects, queue.readAtMs) : []
  const attention = projects.filter((p) => p.next !== null)
  const busy = projects.filter((p) => p.next === null && p.busySessions > 0)
  const allClear = attention.length === 0
  const controls = useFocusRemoteControls(attention)
  /* Projects whose queue can expand (more than one attention session) */
  const multiSession = attention.filter((p) => p.sessions.length > 1)
  const allExpanded =
    multiSession.length > 0 && multiSession.every((p) => controls.expandedIds.has(p.sourceId))
  const noneExpanded = multiSession.every((p) => !controls.expandedIds.has(p.sourceId))

  /* Bulk action only: sets every project at once. Individual chevrons keep
     full control afterwards — this is not a sticky mode. */
  const setAllQueues = useCallback(
    (expand: boolean) => {
      controls.setExpanded(expand ? multiSession.map((p) => p.sourceId) : [])
    },
    [multiSession, controls],
  )

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
            className={noneExpanded ? "is-active" : ""}
            onClick={() => setAllQueues(false)}
          >
            top
          </button>
          <button
            type="button"
            className={allExpanded ? "is-active" : ""}
            onClick={() => setAllQueues(true)}
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
            const expanded = controls.expandedIds.has(project.sourceId)
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
        {escalations.length > 0 && (
          <>
            <div className="focus-divider focus-esc-head" data-testid="escalations-heading">
              Escalations
            </div>
            {escalations.map(({ item, shortId, text, targetLabel, href }) => (
              <a
                key={item.id}
                className="focus-esc"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="escalation-card"
                data-item-id={item.id}
                title={`Open ${targetLabel} in the dashboard`}
              >
                <span className="focus-esc-top">
                  <span className="focus-esc-id">{shortId}</span>
                  <span className="focus-esc-target">{targetLabel}</span>
                  <span className="focus-esc-age">{formatEscalationAge(item, queue?.readAtMs ?? 0)}</span>
                </span>
                <span className="focus-esc-q">{text}</span>
              </a>
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
