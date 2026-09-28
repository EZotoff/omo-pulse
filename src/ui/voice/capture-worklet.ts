// Plain-string AudioWorklet source for 16 kHz Int16 mono capture.
//
// Kept as a string (not a public/ file) so the widget ships as one bundle and
// loads it through a Blob URL, mirroring the voice-bridge client. The processor
// resamples the context rate to 16 kHz, accumulates ~100 ms chunks, and posts
// Int16Array buffers to the main thread for the WebSocket.

export const CAPTURE_PROCESSOR = "resample16k"

export const CAPTURE_WORKLET_SOURCE = `class Resample16k extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.pos = 0
    this.buf = new Float32Array(2048)
    this.fill = 0
  }
  process(inputs) {
    const inp = inputs[0][0]
    if (!inp) return true
    for (let i = 0; i < inp.length; i++) {
      this.pos += this.ratio
      while (this.pos >= 1) {
        this.pos -= 1
        this.buf[this.fill++] = inp[i]
        if (this.fill >= this.buf.length) this.flush()
      }
    }
    if (this.fill >= 1600) this.flush()
    return true
  }
  flush() {
    if (this.fill === 0) return
    const out = new Int16Array(this.fill)
    for (let j = 0; j < this.fill; j++) {
      const v = Math.max(-1, Math.min(1, this.buf[j]))
      out[j] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    this.port.postMessage(out, [out.buffer])
    this.fill = 0
  }
}
registerProcessor(${JSON.stringify(CAPTURE_PROCESSOR)}, Resample16k)`
