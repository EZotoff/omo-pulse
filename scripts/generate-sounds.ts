#!/usr/bin/env bun
/**
 * Generate demo audio files for README documentation.
 * Uses the same synthesis parameters as useSoundNotifications.ts
 * but renders offline to WAV files.
 */

import * as fs from "node:fs"
import * as path from "node:path"

const SAMPLE_RATE = 44100
const VOLUME = 50 // Same as default config
const PEAK = (VOLUME / 100) * 0.06

const OUTPUT_DIR = path.resolve(import.meta.dir, "../docs/sounds")

// -----------------------------------------------------------------------------
// WAV file utilities
// -----------------------------------------------------------------------------

function writeWav(filename: string, samples: Float32Array): void {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = samples.length * (bitsPerSample / 8)
  const fileSize = 36 + dataSize

  const buffer = Buffer.alloc(44 + dataSize)
  let offset = 0

  // RIFF header
  buffer.write("RIFF", offset); offset += 4
  buffer.writeUInt32LE(fileSize, offset); offset += 4
  buffer.write("WAVE", offset); offset += 4

  // fmt chunk
  buffer.write("fmt ", offset); offset += 4
  buffer.writeUInt32LE(16, offset); offset += 4 // chunk size
  buffer.writeUInt16LE(1, offset); offset += 2 // PCM format
  buffer.writeUInt16LE(numChannels, offset); offset += 2
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4
  buffer.writeUInt32LE(byteRate, offset); offset += 4
  buffer.writeUInt16LE(blockAlign, offset); offset += 2
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2

  // data chunk
  buffer.write("data", offset); offset += 4
  buffer.writeUInt32LE(dataSize, offset); offset += 4

  // Convert float samples to 16-bit PCM
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(sample * 32767), offset)
    offset += 2
  }

  fs.writeFileSync(filename, buffer)
}

// -----------------------------------------------------------------------------
// Synthesis utilities
// -----------------------------------------------------------------------------

function createBuffer(durationSec: number): Float32Array {
  return new Float32Array(Math.ceil(SAMPLE_RATE * durationSec))
}

/** Generate ADSR envelope values */
function adsrGain(t: number, peak: number, a: number, d: number, s: number, r: number): number {
  if (t < 0) return 0
  if (t < a) return (t / a) * peak
  if (t < a + d) return peak - ((t - a) / d) * (peak - peak * s)
  if (t < a + d + r) return peak * s * (1 - (t - a - d) / r)
  return 0
}

/** Exponential ramp between two values over a duration */
function expRamp(t: number, start: number, end: number, duration: number): number {
  if (t >= duration) return end
  return start * Math.pow(end / start, t / duration)
}

// -----------------------------------------------------------------------------
// Sound generators (matching useSoundNotifications.ts exactly)
// -----------------------------------------------------------------------------

/** Waiting/Idle: "tuk-tuk" - short percussive double tap */
function generateWaiting(): Float32Array {
  const duration = 0.25
  const buffer = createBuffer(duration)
  const hitOffsets = [0, 0.15]

  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE
    let sample = 0

    for (const offset of hitOffsets) {
      const ht = t - offset
      if (ht < 0 || ht > 0.06) continue

      const freq = expRamp(ht, 800, 600, 0.05)
      const gain = adsrGain(ht, PEAK * 0.7, 0.005, 0.045, 0, 0.01)
      sample += Math.sin(2 * Math.PI * freq * ht) * gain
    }

    buffer[i] = sample
  }

  return buffer
}

/** All-clear/Plan complete: 3 rapid staccato notes C5 -> G5 -> C6 */
function generateAllClear(): Float32Array {
  const duration = 0.4
  const buffer = createBuffer(duration)
  const notes = [523.25, 783.99, 1046.5]
  const noteSpacing = 0.1

  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE
    let sample = 0

    for (let j = 0; j < notes.length; j++) {
      const noteStart = j * noteSpacing
      const nt = t - noteStart
      if (nt < 0 || nt > 0.08) continue

      const freq = notes[j]
      const gain = adsrGain(nt, PEAK, 0.01, 0.02, 0.6, 0.05)
      sample += Math.sin(2 * Math.PI * freq * nt) * gain
    }

    buffer[i] = sample
  }

  return buffer
}

/** Attention/Error: "peew" sweep + distorted "explosion" */
function generateAttention(): Float32Array {
  const duration = 0.75
  const buffer = createBuffer(duration)
  const peak = PEAK * 0.3

  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE
    let sample = 0

    // Phase 1: "Peew" (0 to 0.2s)
    if (t < 0.2) {
      const freq = expRamp(t, 2000, 200, 0.2)
      const gain = adsrGain(t, peak * 1.5, 0.01, 0.15, 0.2, 0.04)
      sample += (2 * Math.abs(((t * freq) % 1) - 0.5) - 0.5) * 2 * gain // triangle wave
    }

    // Phase 2: "Explosion" (0.2s to 0.7s)
    if (t >= 0.2 && t < 0.7) {
      const et = t - 0.2
      const gain = adsrGain(et, peak * 2, 0.01, 0.2, 0.5, 0.29)

      // Seeded noise for reproducibility
      const noise = ((Math.sin(t * 12345.6789) * 43758.5453) % 1) * 2 - 1

      // Dissonant sawtooth oscillators
      const freq1 = 150
      const freq2 = 150 * 1.414
      const saw1 = 2 * ((t * freq1) % 1) - 1
      const saw2 = 2 * ((t * freq2) % 1) - 1

      const mixed = noise + saw1 + saw2
      // Hard clipping distortion
      const distorted = Math.max(-1, Math.min(1, mixed * 5))

      sample += distorted * gain
    }

    buffer[i] = sample
  }

  return buffer
}

/** Question: "say whaaa?" - pitch dip then sweep up */
function generateQuestion(): Float32Array {
  const duration = 0.5
  const buffer = createBuffer(duration)

  for (let i = 0; i < buffer.length; i++) {
    const t = i / SAMPLE_RATE
    if (t > 0.45) {
      buffer[i] = 0
      continue
    }

    // Pitch contour: 600Hz -> 450Hz (0.1s) -> 4000Hz (0.35s)
    let freq: number
    if (t < 0.1) {
      freq = expRamp(t, 600, 450, 0.1)
    } else {
      freq = expRamp(t - 0.1, 450, 4000, 0.25)
    }

    const gain = adsrGain(t, PEAK * 1.2, 0.04, 0.08, 0.7, 0.23)
    buffer[i] = Math.sin(2 * Math.PI * freq * t) * gain
  }

  return buffer
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const sounds = [
    { name: "idle", generate: generateWaiting, desc: "Session idle — double tap" },
    { name: "plan-complete", generate: generateAllClear, desc: "Plan complete — ascending notes" },
    { name: "error", generate: generateAttention, desc: "Error/attention — sweep + distortion" },
    { name: "question", generate: generateQuestion, desc: "Question pending — rising pitch" },
  ]

  console.log("Generating demo sounds...\n")

  for (const { name, generate, desc } of sounds) {
    const samples = generate()
    const filename = path.join(OUTPUT_DIR, `${name}.wav`)
    writeWav(filename, samples)
    console.log(`  ${name}.wav (${desc})`)
    console.log(`    Duration: ${(samples.length / SAMPLE_RATE).toFixed(2)}s`)
    console.log(`    Samples: ${samples.length}`)
  }

  console.log(`\nSounds written to ${OUTPUT_DIR}`)
}

main()
