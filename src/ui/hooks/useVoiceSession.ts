// Voice session hook: WebSocket lifecycle, PCM16 worklet audio, and the two
// Seam 1/2 senders. The pure decisions live in ../voice/session-state.ts; this
// file wires them to sockets, audio contexts, and React state.
//
// Doctrine mirrors useDashboardData.ts: refs to avoid stale closures, setTimeout
// reconnect loops, and cleanup that tears down every acquired resource.

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import {
  buildSelectionFrame,
  buildViewContextFrame,
  parseServerFrame,
  type ShowFrame,
  type ViewContextInput,
} from "../voice/protocol"
import {
  createVoiceReducer,
  initialVoiceState,
  shouldSendSelection,
  shouldSendViewContext,
  viewContextKey,
  type TranscriptEntry,
  type VoiceUiConnectionState,
  type VoiceUiState,
} from "../voice/session-state"
import { CAPTURE_PROCESSOR, CAPTURE_WORKLET_SOURCE } from "../voice/capture-worklet"
import { PLAYBACK_PROCESSOR, PLAYBACK_WORKLET_SOURCE } from "../voice/playback-worklet"

const RECONNECT_MS = 1500
const DEFAULT_API_PORT = "18031"

type ViteEnv = { readonly DEV?: boolean; readonly [key: string]: unknown }

function readViteEnv(): ViteEnv {
  return (import.meta as unknown as { env?: ViteEnv }).env ?? {}
}

/** API-server port for the dev WebSocket origin; mirrors vite.config.ts. */
export function voiceApiPort(): string {
  const env = readViteEnv()
  const raw = env["VITE_OMO_PULSE_API_PORT"] ?? env["OMO_PULSE_API_PORT"]
  return typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_API_PORT
}

/**
 * WebSocket URL for the voice proxy.
 *
 * Dev: Vite's /api proxy has no ws:true, so connect directly to the API server
 * origin. Prod: origin-relative path served by the same Hono server.
 */
export function voiceWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:"
  if (readViteEnv().DEV === true) {
    return `${proto}//${location.hostname}:${voiceApiPort()}/api/voice-ws`
  }
  return `${proto}//${location.host}/api/voice-ws`
}

type CaptureHandle = {
  readonly ctx: AudioContext
  readonly node: AudioWorkletNode
  readonly stream: MediaStream
  readonly workletUrl: string
}

type PlaybackHandle = {
  readonly ctx: AudioContext
  readonly node: AudioWorkletNode
  readonly workletUrl: string
}

function createWorkletUrl(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "application/javascript" }))
}

/** True when a raw text frame is the bridge's handoff notice. */
function isHandoffFrame(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === "object" && (parsed as { type?: unknown }).type === "handoff"
  } catch {
    return false
  }
}

export type UseVoiceSessionReturn = {
  state: VoiceUiConnectionState
  transcript: readonly TranscriptEntry[]
  confirmationPending: boolean
  lastInterrupt: string | null
  error: string | null
  connect: () => void
  disconnect: () => void
  startCapture: () => void
  stopCapture: () => void
  resumePlayback: () => void
  sendText: (text: string) => void
  sendViewContext: (input: ViewContextInput) => void
  sendSelection: (contextTag: string, index: number) => void
  unlocked: boolean
  /** Most recent `show` frame from the bridge, or null before one arrives. */
  lastShow: ShowFrame | null
  /** True when the playback AudioContext is suspended (autoplay policy). */
  audioSuspended: boolean
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const [state, dispatch] = useReducer(createVoiceReducer, initialVoiceState)
  const [unlocked, setUnlocked] = useState(false)
  const [audioSuspended, setAudioSuspended] = useState(false)

  const stateRef = useRef<VoiceUiState>(state)
  const wsRef = useRef<WebSocket | null>(null)
  const wantedRef = useRef(false)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureRef = useRef<CaptureHandle | null>(null)
  const capturingRef = useRef(false)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const unlockedRef = useRef(false)
  const lastViewContextKeyRef = useRef<string | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const sendRaw = useCallback((data: string | ArrayBufferView): void => {
    const ws = wsRef.current
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(data)
  }, [])

  const ensurePlayback = useCallback(async (): Promise<void> => {
    if (playbackRef.current !== null) return
    const ctx = new AudioContext({ sampleRate: 24000 })
    const url = createWorkletUrl(PLAYBACK_WORKLET_SOURCE)
    await ctx.audioWorklet.addModule(url)
    const node = new AudioWorkletNode(ctx, PLAYBACK_PROCESSOR)
    node.connect(ctx.destination)
    ctx.onstatechange = () => {
      setAudioSuspended(ctx.state === "suspended")
    }
    playbackRef.current = { ctx, node, workletUrl: url }
  }, [])

  const enqueuePlayback = useCallback((pcm: Int16Array): void => {
    const playback = playbackRef.current
    if (playback === null) return
    if (playback.ctx.state === "suspended") void playback.ctx.resume()
    playback.node.port.postMessage(pcm, [pcm.buffer as ArrayBuffer])
  }, [])

  const resumePlayback = useCallback((): void => {
    const playback = playbackRef.current
    if (playback !== null && playback.ctx.state === "suspended") void playback.ctx.resume()
  }, [])

  const stopCapture = useCallback((): void => {
    if (!capturingRef.current) return
    capturingRef.current = false
    const capture = captureRef.current
    captureRef.current = null
    if (capture !== null) {
      capture.stream.getTracks().forEach((track) => track.stop())
      capture.node.disconnect()
      void capture.ctx.close()
      URL.revokeObjectURL(capture.workletUrl)
    }
    sendRaw(JSON.stringify({ type: "inputComplete" }))
  }, [sendRaw])

  const openSocket = useCallback((): void => {
    if (wsRef.current !== null) return
    dispatch({ type: "state", state: "connecting" })

    let ws: WebSocket
    try {
      ws = new WebSocket(voiceWsUrl())
    } catch {
      dispatch({ type: "close" })
      return
    }
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.onopen = () => {
      dispatch({ type: "state", state: "connected" })
    }
    ws.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) {
        enqueuePlayback(new Int16Array(ev.data))
        return
      }
      if (typeof ev.data !== "string") return
      const frame = parseServerFrame(ev.data)
      if (frame !== null) {
        dispatch(frame)
        return
      }
      // The bridge announces a takeover with a handoff text frame, then closes.
      // parseServerFrame does not model it, so detect it here and stop wanting
      // the socket: a handoff is a quiet offline, never a reconnect.
      if (isHandoffFrame(ev.data)) {
        wantedRef.current = false
        dispatch({ type: "handoff" })
        ws.close()
      }
    }
    ws.onclose = (ev: CloseEvent) => {
      if (wsRef.current === ws) wsRef.current = null
      stopCapture()
      if (!wantedRef.current) return
      const handoff = ev.reason === "handoff"
      dispatch(handoff ? { type: "handoff" } : { type: "close" })
      if (!handoff && !document.hidden) {
        dispatch({ type: "state", state: "reconnecting" })
        reconnectRef.current = setTimeout(() => {
          openSocket()
        }, RECONNECT_MS)
      }
    }
    ws.onerror = () => {
      // onclose always follows; no separate error surface.
    }
  }, [enqueuePlayback, stopCapture])

  const connect = useCallback((): void => {
    wantedRef.current = true
    if (wsRef.current !== null) return
    openSocket()
  }, [openSocket])

  const disconnect = useCallback((): void => {
    wantedRef.current = false
    if (reconnectRef.current !== null) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    const ws = wsRef.current
    wsRef.current = null
    if (ws !== null) ws.close()
    stopCapture()
    dispatch({ type: "state", state: "idle" })
  }, [stopCapture])

  const startCapture = useCallback((): void => {
    if (capturingRef.current) return
    const ws = wsRef.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return
    if (!unlockedRef.current) {
      unlockedRef.current = true
      setUnlocked(true)
    }
    void ensurePlayback()
    if (navigator.mediaDevices === undefined) return
    capturingRef.current = true
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(async (stream) => {
        if (!capturingRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const ctx = new AudioContext()
        const url = createWorkletUrl(CAPTURE_WORKLET_SOURCE)
        await ctx.audioWorklet.addModule(url)
        if (!capturingRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          void ctx.close()
          URL.revokeObjectURL(url)
          return
        }
        const node = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR)
        node.port.onmessage = (ev: MessageEvent) => {
          if (ev.data instanceof Int16Array) sendRaw(ev.data)
        }
        ctx.createMediaStreamSource(stream).connect(node)
        captureRef.current = { ctx, node, stream, workletUrl: url }
      })
      .catch((err: unknown) => {
        capturingRef.current = false
        const message = err instanceof Error ? err.message : String(err)
        dispatch({ type: "error", message: `capture failed: ${message}` })
      })
  }, [ensurePlayback, sendRaw])

  const sendText = useCallback(
    (text: string): void => {
      const trimmed = text.trim()
      if (trimmed.length === 0) return
      sendRaw(JSON.stringify({ type: "text", text: trimmed }))
    },
    [sendRaw],
  )

  const sendViewContext = useCallback((input: ViewContextInput): void => {
    const ws = wsRef.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return
    const frame = buildViewContextFrame(input)
    if (!shouldSendViewContext(lastViewContextKeyRef.current, frame)) return
    ws.send(JSON.stringify(frame))
    lastViewContextKeyRef.current = viewContextKey(frame)
  }, [])

  const sendSelection = useCallback((contextTag: string, index: number): void => {
    const ws = wsRef.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return
    if (!shouldSendSelection(stateRef.current.lastShowContextTag, contextTag)) return
    ws.send(JSON.stringify(buildSelectionFrame(contextTag, index)))
  }, [])

  useEffect(() => {
    return () => {
      wantedRef.current = false
      if (reconnectRef.current !== null) clearTimeout(reconnectRef.current)
      const ws = wsRef.current
      wsRef.current = null
      if (ws !== null) ws.close()
      capturingRef.current = false
      const capture = captureRef.current
      captureRef.current = null
      if (capture !== null) {
        capture.stream.getTracks().forEach((track) => track.stop())
        capture.node.disconnect()
        void capture.ctx.close()
        URL.revokeObjectURL(capture.workletUrl)
      }
      const playback = playbackRef.current
      playbackRef.current = null
      if (playback !== null) {
        playback.node.disconnect()
        void playback.ctx.close()
        URL.revokeObjectURL(playback.workletUrl)
      }
    }
  }, [])

  // Foreground-only contract: a close while hidden schedules no reconnect, so
  // re-arm when the tab becomes visible again.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden || !wantedRef.current) return
      if (wsRef.current === null) openSocket()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [openSocket])

  return {
    state: state.state,
    transcript: state.transcript,
    confirmationPending: state.confirmationPending,
    lastInterrupt: state.lastInterrupt,
    error: state.error,
    connect,
    disconnect,
    startCapture,
    stopCapture,
    sendText,
    sendViewContext,
    sendSelection,
    unlocked,
    lastShow: state.lastShow,
    audioSuspended,
    resumePlayback,
  }
}
