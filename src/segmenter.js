(function (root) {
  class Segmenter {
    constructor({ sampleRate = 16000, threshold = 0.008, silenceMs = 850, maxSeconds = 22, onSegment, onLevel }) {
      Object.assign(this, { sampleRate, threshold, silenceMs, maxSeconds, onSegment, onLevel }); this.reset();
    }
    reset() { this.frames = []; this.pre = []; this.samples = 0; this.voiced = 0; this.silent = 0; this.active = false; }
    push(frame) {
      let energy = 0; for (const x of frame) energy += x * x;
      const rms = Math.sqrt(energy / frame.length); this.onLevel?.(rms);
      const duration = frame.length / this.sampleRate * 1000;
      if (!this.active) {
        this.pre.push(frame); if (this.pre.length > 3) this.pre.shift();
        if (rms < this.threshold) return;
        this.active = true; this.frames = this.pre; this.pre = []; this.samples = this.frames.reduce((n, f) => n + f.length, 0);
      } else { this.frames.push(frame); this.samples += frame.length; }
      if (rms >= this.threshold) { this.voiced += duration; this.silent = 0; } else this.silent += duration;
      if (this.silent >= this.silenceMs || this.samples >= this.sampleRate * this.maxSeconds) this.flush();
    }
    flush() {
      if (this.active && this.voiced >= 250) {
        const output = new Float32Array(this.samples); let at = 0;
        for (const f of this.frames) { output.set(f, at); at += f.length; }
        this.onSegment(output);
      }
      this.reset();
    }
  }
  if (typeof module !== 'undefined') module.exports = { Segmenter }; else root.Segmenter = Segmenter;
})(typeof window !== 'undefined' ? window : globalThis);
