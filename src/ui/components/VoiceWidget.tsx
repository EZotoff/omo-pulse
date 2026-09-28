// Voice dock for the Focus Remote surface (Seam 3 dash client).
//
// Auto-connects on mount through the origin-relative voice proxy. Before the
// first successful connection the dock stays invisible: a failed attempt is a
// quiet offline, never an error banner. Once connected the dock survives
// later drop-offs with an offline chip and the hook's reconnect loop.

import { memo, useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { useVoiceSession } from "../hooks/useVoiceSession"
import type { ViewContextInput } from "../voice/protocol"
import { ShowView } from "./ShowView"
import "./VoiceWidget.css"

export type VoiceWidgetProps = {
  /** Current focus context from FocusRemote; sent (deduped) while connected. */
  readonly viewContext: ViewContextInput | null
}

function VoiceWidgetComponent({ viewContext }: VoiceWidgetProps) {
  const voice = useVoiceSession()
  const [everConnected, setEverConnected] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const everConnectedRef = useRef(false)

  /* Ambient surface: the dock wants the session from mount. */
  const connect = voice.connect
  useEffect(() => {
    connect()
  }, [connect])

  useEffect(() => {
    if (voice.state === "connected") {
      everConnectedRef.current = true
      setEverConnected(true)
      return
    }
    if (
      !everConnectedRef.current &&
      (voice.state === "offline" || voice.state === "error" || voice.state === "reconnecting")
    ) {
      /* First attempt failed and the bridge is not running: quiet offline.
         reconnecting is included because close→reconnecting is batched into
         one render, so "offline" alone is never observed. */
      setGaveUp(true)
    }
  }, [voice.state])

  useEffect(() => {
    if (viewContext !== null) voice.sendViewContext(viewContext)
  }, [viewContext, voice.sendViewContext])

  const onTalkDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId)
      voice.startCapture()
    },
    [voice.startCapture],
  )

  const onTalkUp = useCallback((): void => {
    voice.stopCapture()
  }, [voice.stopCapture])

  const onToggle = useCallback((): void => {
    if (voice.state === "idle" || voice.state === "offline") voice.connect()
    else voice.disconnect()
  }, [voice.state, voice.connect, voice.disconnect])

  if (gaveUp && !everConnected) return null

  return (
    <section className="voice-dock" data-state={voice.state} aria-label="Voice session">
      <div className="voice-dock-bar">
        <button
          type="button"
          className="voice-toggle"
          onClick={onToggle}
          data-active={voice.state !== "idle" && voice.state !== "offline"}
        >
          {voice.state === "idle" || voice.state === "offline" ? "connect" : "stop"}
        </button>
        <span className="voice-status" data-state={voice.state}>
          {voice.state === "reconnecting" || voice.state === "connecting"
            ? "connecting"
            : voice.state === "error"
              ? "offline"
              : voice.state}
        </span>
        {voice.confirmationPending && (
          <span className="voice-confirm" title="Vox is waiting for spoken confirmation">
            confirm?
          </span>
        )}
        <button
          type="button"
          className="voice-transcript-toggle"
          aria-expanded={transcriptOpen}
          onClick={() => setTranscriptOpen((open) => !open)}
        >
          {transcriptOpen ? "hide log" : "log"}
        </button>
      </div>

      {voice.lastShow !== null && (
        <div className="voice-show">
          <ShowView frame={voice.lastShow} onSelect={voice.sendSelection} />
        </div>
      )}

      {transcriptOpen && (
        <div className="voice-transcript" aria-live="polite">
          {voice.transcript.length === 0 ? (
            <span className="voice-transcript-empty">no transcript yet</span>
          ) : (
            voice.transcript.map((entry, index) => (
              <div key={index} className={`voice-line voice-line--${entry.role}`}>
                {entry.text}
              </div>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        className="voice-talk"
        onPointerDown={onTalkDown}
        onPointerUp={onTalkUp}
        onPointerCancel={onTalkUp}
        disabled={voice.state !== "connected"}
        aria-label="Push to talk"
      >
        talk
      </button>

      {voice.audioSuspended && (
        <div className="voice-overlay">
          <p>audio suspended — tap to resume</p>
          <button type="button" onClick={voice.resumePlayback}>
            Resume
          </button>
        </div>
      )}
    </section>
  )
}

/** Memoized: the remote polls attention data every few seconds. */
export const VoiceWidget = memo(VoiceWidgetComponent)
