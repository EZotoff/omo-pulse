import { useState, useEffect, useRef, useCallback } from "react"
import type { SoundConfig } from "../../types"

const STORAGE_KEY = "dashboard-sound-config"

const DEFAULT_CONFIG: SoundConfig = {
  enabled: true,
  volume: 50,
  onSessionIdle: true,
  onPlanComplete: true,
  onSessionError: true,
  onQuestion: true,
}

/** Read persisted sound config from localStorage, returning defaults on failure */
function readPersistedConfig(): SoundConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_CONFIG
    const obj = parsed as Record<string, unknown>
    return {
      enabled: typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_CONFIG.enabled,
      volume: typeof obj.volume === "number" ? obj.volume : DEFAULT_CONFIG.volume,
      onSessionIdle: typeof obj.onSessionIdle === "boolean" ? obj.onSessionIdle : DEFAULT_CONFIG.onSessionIdle,
      onPlanComplete: typeof obj.onPlanComplete === "boolean" ? obj.onPlanComplete : DEFAULT_CONFIG.onPlanComplete,
      onSessionError: typeof obj.onSessionError === "boolean" ? obj.onSessionError : DEFAULT_CONFIG.onSessionError,
      onQuestion: typeof obj.onQuestion === "boolean" ? obj.onQuestion : DEFAULT_CONFIG.onQuestion,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

/** Persist sound config to localStorage, silently failing if unavailable */
function persistConfig(config: SoundConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* localStorage may be unavailable (private browsing, quota exceeded) */
  }
}

/** Apply an ADSR envelope to a gain node */
function applyADSR(gain: GainNode, now: number, peak: number, a: number, d: number, s: number, r: number): void {
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peak, now + a)
  gain.gain.linearRampToValueAtTime(peak * s, now + a + d)
  gain.gain.linearRampToValueAtTime(0, now + a + d + r)
}

export function useSoundNotifications(): {
  config: SoundConfig
  setConfig: (config: SoundConfig) => void
  playWaiting: () => void
  playAllClear: () => void
  playAttention: () => void
  playQuestion: () => void
} {
  const [config, setConfig] = useState<SoundConfig>(() => readPersistedConfig())
  const audioCtxRef = useRef<AudioContext | null>(null)
  const configRef = useRef(config)

  // Keep configRef in sync so useCallback closures read current value
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Persist to localStorage whenever config changes
  useEffect(() => {
    persistConfig(config)
  }, [config])

  // Close AudioContext on unmount to release audio resources
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        void audioCtxRef.current.close()
        audioCtxRef.current = null
      }
    }
  }, [])

  /** Lazily get or create the AudioContext */
  const getAudioContext = useCallback((): AudioContext => {
    audioCtxRef.current ??= new AudioContext()
    return audioCtxRef.current
  }, [])

  /**
   * Waiting sound (mapped to onSessionIdle):
   * Sine portamento glide A3 (220Hz) → E4 (329.63Hz), 1.2s total.
   */
  const playWaiting = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onSessionIdle) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const peak = (cfg.volume / 100) * 0.06
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.linearRampToValueAtTime(329.63, now + 1.2)

    applyADSR(gainNode, now, peak, 0.15, 0.1, 0.7, 0.3)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.15 + 0.1 + 0.3)
  }, [getAudioContext])

  /**
   * All-clear sound (mapped to onPlanComplete):
   * 3 rapid staccato sine notes: C5(523.25) → G5(783.99) → C6(1046.5).
   */
  const playAllClear = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onPlanComplete) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const peak = (cfg.volume / 100) * 0.06
    const now = ctx.currentTime

    const notes = [523.25, 783.99, 1046.5]
    const noteSpacing = 0.1

    for (let i = 0; i < notes.length; i++) {
      const noteStart = now + i * noteSpacing
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.type = "sine"
      osc.frequency.setValueAtTime(notes[i], noteStart)

      applyADSR(gainNode, noteStart, peak, 0.01, 0.02, 0.6, 0.05)

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.start(noteStart)
      osc.stop(noteStart + 0.01 + 0.02 + 0.05)
    }
  }, [getAudioContext])

  /**
   * Attention sound (mapped to onSessionError):
   * Sine A4 (440Hz), 2 short pulses, 80ms each with 60ms gap.
   */
  const playAttention = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onSessionError) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const peak = (cfg.volume / 100) * 0.06
    const now = ctx.currentTime

    const pulseOffsets = [0, 0.14] // 80ms pulse + 60ms gap = 140ms

    for (const offset of pulseOffsets) {
      const pulseStart = now + offset
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.type = "sine"
      osc.frequency.setValueAtTime(440, pulseStart)

      applyADSR(gainNode, pulseStart, peak, 0.005, 0.01, 0.8, 0.02)

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.start(pulseStart)
      osc.stop(pulseStart + 0.005 + 0.01 + 0.02)
    }
  }, [getAudioContext])

  /**
   * Question sound (mapped to onQuestion):
   * Sine descending D5 (587.33Hz) → A4 (440Hz), 400ms.
   */
  const playQuestion = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onQuestion) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const peak = (cfg.volume / 100) * 0.06
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(587.33, now)
    osc.frequency.linearRampToValueAtTime(440, now + 0.4)

    applyADSR(gainNode, now, peak, 0.02, 0.05, 0.6, 0.15)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.02 + 0.05 + 0.15)
  }, [getAudioContext])

  return { config, setConfig, playWaiting, playAllClear, playAttention, playQuestion }
}
