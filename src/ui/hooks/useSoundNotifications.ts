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
   * Flat, neutral "tuk-tuk" - short percussive double tap.
   */
  const playWaiting = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onSessionIdle) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

    const peak = (cfg.volume / 100) * 0.06
    const now = ctx.currentTime

    // Two hits separated by ~100ms gap
    const hitOffsets = [0, 0.15]
    
    for (const offset of hitOffsets) {
      const hitStart = now + offset
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()

      osc.type = "sine"
      // Low frequency for a percussive knock
      osc.frequency.setValueAtTime(800, hitStart)
      // Slight pitch drop for more "wood" character
      osc.frequency.exponentialRampToValueAtTime(600, hitStart + 0.05)

      // Sharp attack, quick decay, no sustain
      applyADSR(gainNode, hitStart, peak * 0.7, 0.005, 0.045, 0, 0.01)

      osc.connect(gainNode)
      gainNode.connect(ctx.destination)

      osc.start(hitStart)
      osc.stop(hitStart + 0.06)
    }
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
   * "peew" (fast pitch sweep) + "explosion" (distorted noise).
   */
  const playAttention = useCallback(() => {
    const cfg = configRef.current
    if (!cfg.enabled || !cfg.onSessionError) return

    const ctx = getAudioContext()
    if (ctx.state === "suspended") void ctx.resume()

     const peak = (cfg.volume / 100) * 0.06 * 0.3
    const now = ctx.currentTime

    // Phase 1: "Peew" (0 to 0.2s)
    const peewOsc = ctx.createOscillator()
    const peewGain = ctx.createGain()
    peewOsc.type = "triangle"
    peewOsc.frequency.setValueAtTime(2000, now)
    peewOsc.frequency.exponentialRampToValueAtTime(200, now + 0.2)
    applyADSR(peewGain, now, peak * 1.5, 0.01, 0.15, 0.2, 0.04)
    peewOsc.connect(peewGain)
    peewGain.connect(ctx.destination)
    peewOsc.start(now)
    peewOsc.stop(now + 0.2)

    // Phase 2: "Explosion" (0.2s to 0.7s)
    const explStart = now + 0.2
    const explDuration = 0.5

    // Noise buffer
    const bufferSize = Math.round(ctx.sampleRate * explDuration)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const noiseSource = ctx.createBufferSource()
    noiseSource.buffer = buffer

    // Dissonant oscillators
    const dissOsc1 = ctx.createOscillator()
    dissOsc1.type = "sawtooth"
    dissOsc1.frequency.setValueAtTime(150, explStart)
    
    const dissOsc2 = ctx.createOscillator()
    dissOsc2.type = "sawtooth"
    // Tritone dissonance
    dissOsc2.frequency.setValueAtTime(150 * 1.414, explStart) 

    const explGain = ctx.createGain()
    applyADSR(explGain, explStart, peak * 2, 0.01, 0.2, 0.5, 0.29)

    // Distortion waveshaper
    const waveshaper = ctx.createWaveShaper()
    const curve = new Float32Array(400)
    for (let i = 0; i < 400; i++) {
      const x = (i * 2) / 400 - 1
      curve[i] = Math.max(-1, Math.min(1, x * 5)) // Hard clipping
    }
    waveshaper.curve = curve
    waveshaper.oversample = "4x"

    // Routing
    noiseSource.connect(explGain)
    dissOsc1.connect(explGain)
    dissOsc2.connect(explGain)
    explGain.connect(waveshaper)
    waveshaper.connect(ctx.destination)

    noiseSource.start(explStart)
    dissOsc1.start(explStart)
    dissOsc2.start(explStart)
    
    noiseSource.stop(explStart + explDuration)
    dissOsc1.stop(explStart + explDuration)
    dissOsc2.stop(explStart + explDuration)
  }, [getAudioContext])

   /**
    * Question sound (mapped to onQuestion):
    * Mimics vocal "say whaaa?": 500Hz -> dip to 400Hz -> sweep UP to 2000Hz.
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
    
    // Pitch contour: 500Hz -> 400Hz (~0.15s) -> 2000Hz (~0.3s)
    osc.frequency.setValueAtTime(500, now)
    // First segment (wh-): slight downward dip
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.15)
    // Second segment (-aaa?): dramatic upward sweep accelerating
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.45)

    // Volume contour covering both segments
    applyADSR(gainNode, now, peak * 1.2, 0.05, 0.1, 0.8, 0.3)

    osc.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.45)
  }, [getAudioContext])

  return { config, setConfig, playWaiting, playAllClear, playAttention, playQuestion }
}
