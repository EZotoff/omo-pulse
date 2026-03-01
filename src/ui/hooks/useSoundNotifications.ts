import { useState, useEffect, useRef, useCallback } from "react"
import type { SoundConfig } from "../../types"

const STORAGE_KEY = "dashboard-sound-config"

const DEFAULT_CONFIG: SoundConfig = {
  enabled: true,
  volume: 50,
  onSessionIdle: true,
  onPlanComplete: true,
  onSessionError: true,
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

export function useSoundNotifications(): {
  config: SoundConfig
  setConfig: (config: SoundConfig) => void
  playSessionIdle: () => void
  playPlanComplete: () => void
  playSessionError: () => void
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

  /** Lazily get or create the AudioContext */
  const getAudioContext = useCallback((): AudioContext => {
    audioCtxRef.current ??= new AudioContext()
    return audioCtxRef.current
  }, [])

  /**
   * Low-frequency gentle tone: 300Hz, 200ms, sine wave, volume ramp down.
   */
  const playSessionIdle = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onSessionIdle) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const gain = (cfg.volume / 100) * 0.3
    const now = ctx.currentTime

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(300, now)

    gainNode.gain.setValueAtTime(gain, now)
    gainNode.gain.linearRampToValueAtTime(0, now + 0.2)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(now)
    oscillator.stop(now + 0.2)
  }, [getAudioContext])

  /**
   * Rising two-tone sequence: 400Hz then 600Hz, 150ms each, triangle wave.
   */
  const playPlanComplete = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onPlanComplete) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const gain = (cfg.volume / 100) * 0.3
    const now = ctx.currentTime

    // First tone: 400Hz
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = "triangle"
    osc1.frequency.setValueAtTime(400, now)
    gain1.gain.setValueAtTime(gain, now)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.15)

    // Second tone: 600Hz
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "triangle"
    osc2.frequency.setValueAtTime(600, now + 0.15)
    gain2.gain.setValueAtTime(gain, now + 0.15)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.15)
    osc2.stop(now + 0.3)
  }, [getAudioContext])

  /**
   * Short alert: 500Hz, 100ms, sawtooth wave, two quick pulses.
   */
  const playSessionError = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onSessionError) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const gain = (cfg.volume / 100) * 0.3
    const now = ctx.currentTime

    // First pulse
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = "sawtooth"
    osc1.frequency.setValueAtTime(500, now)
    gain1.gain.setValueAtTime(gain, now)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.1)

    // Second pulse (after 50ms gap)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "sawtooth"
    osc2.frequency.setValueAtTime(500, now + 0.15)
    gain2.gain.setValueAtTime(gain, now + 0.15)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.15)
    osc2.stop(now + 0.25)
  }, [getAudioContext])

  return { config, setConfig, playSessionIdle, playPlanComplete, playSessionError }
}
