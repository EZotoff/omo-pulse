// Plain-string AudioWorklet source for 24 kHz Int16 playback.
//
// The processor holds a FIFO of Int16Array chunks posted from the main thread
// and drains them sample-by-sample into the output, emitting silence when the
// queue is empty. Loaded through a Blob URL like the capture worklet.

export const PLAYBACK_PROCESSOR = "play24k"

export const PLAYBACK_WORKLET_SOURCE = `class Play24k extends AudioWorkletProcessor {
  constructor() {
    super()
    this.q = []
    this.pos = 0
    this.port.onmessage = (e) => { this.q.push(e.data) }
  }
  process(inputs, outputs) {
    const out = outputs[0][0]
    for (let i = 0; i < out.length;) {
      if (this.q.length === 0) { out[i++] = 0; continue }
      const b = this.q[0]
      out[i++] = b[this.pos] / 0x8000
      if (++this.pos >= b.length) { this.q.shift(); this.pos = 0 }
    }
    return true
  }
}
registerProcessor(${JSON.stringify(PLAYBACK_PROCESSOR)}, Play24k)`
