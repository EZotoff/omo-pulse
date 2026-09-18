import { useState, useRef, useCallback, memo } from "react"
import type { AttentionProject } from "../../types"
import { useAttention } from "../hooks/useAttention"
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

type FocusTargetButtonProps = {
  project: AttentionProject
}

function FocusTargetButton({ project }: FocusTargetButtonProps) {
  const next = project.next
  const [isSwitching, setIsSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const onFocus = useCallback(async (): Promise<void> => {
    if (!next || busyRef.current) return
    busyRef.current = true
    setIsSwitching(true)
    setError(null)

    const minDelay = new Promise((resolve) => setTimeout(resolve, 800))
    try {
      const call = fetch(
        `/api/focus/${encodeURIComponent(project.sourceId)}/${encodeURIComponent(next.sessionId)}`,
        { method: "POST" },
      ).then(async (res) => {
        const body: { ok: boolean; error?: string } = await res.json()
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        return body
      })
      await Promise.all([call, minDelay])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSwitching(false)
      busyRef.current = false
    }
  }, [next, project.sourceId])

  if (!next) return null

  const urgent = URGENT_STATES.has(next.state)

  return (
    <div className="focus-project">
      <div className="focus-proj-head">
        <span className="focus-pname">{project.label}</span>
        <span className="focus-ptime">{formatWait(next.waitMs)}</span>
      </div>
      <button
        type="button"
        className={`focus-target${urgent ? " focus-target--urgent" : ""}`}
        data-state={next.state}
        onClick={onFocus}
        disabled={isSwitching}
      >
        <span className="focus-t-main">
          <span className="focus-t-label">{next.sessionLabel}</span>
        </span>
        <span className="focus-t-focus">{isSwitching ? "switching…" : "FOCUS ▶"}</span>
      </button>
      {error && (
        <div className="focus-error" role="alert">
          {error}
        </div>
      )}
      {project.queue > 0 && <div className="focus-queue">+{project.queue} more waiting</div>}
    </div>
  )
}

const MemoFocusTarget = memo(FocusTargetButton)

/* ── Component ── */

export function FocusRemote() {
  const { projects, connected } = useAttention()
  const attention = projects.filter((p) => p.next !== null)
  const busy = projects.filter((p) => p.next === null && p.busySessions > 0)
  const allClear = attention.length === 0

  return (
    <div className="focus-remote" data-connected={connected}>
      <header className="focus-rhead">
        <span className="focus-rdot" aria-hidden="true" />
        <h1>
          omo-pulse <span>· focus remote</span>
        </h1>
        <span className="focus-rsort">by urgency</span>
      </header>
      <main className="focus-list">
        {allClear ? (
          <div className="focus-clear-panel">
            <div className="focus-clear-ck" aria-hidden="true">
              ✓
            </div>
            <h2>All clear</h2>
            <p>no sessions need your attention right now</p>
          </div>
        ) : (
          attention.map((project) => <MemoFocusTarget key={project.sourceId} project={project} />)
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
    </div>
  )
}
