// Signal engine: turns an AnalyserNode (or nothing) into the band signal every
// Hidden Track visual reads. The band split, energy weights, transient and
// afterglow math come from Signal Theater's browser visualizer:
//   bass 0-12% of bins, low mids 12-32%, high mids 32-62%, treble 62-100%
//   energy = (bass*1.45 + lowMid + highMid*.8 + treble*.55) / 3.3
//   transient = max(energyRise*8.5, transient*.86), afterglow decays at .965
// When there is no live analyser (autoplay blocked, X card iframe with a
// suspended AudioContext, CORS refusal) it synthesizes a believable spectrum
// so the room never looks dead. That idle generator is also from Signal Theater.

export type Signal = {
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  energy: number;
  transient: number;
  afterglow: number;
  live: boolean;
  /** 0..1 per bin, length BINS */
  spectrum: Float32Array;
  /** time-domain wave, -1..1, length WAVE */
  wave: Float32Array;
  /**
   * Cathedral Engine V04 bands: six octave groups, each run through its
   * own float smoother at the V04 speeds (sub 5, bass 6.5, lowmid 6, mid 7,
   * highmid 8.5, treble 11 per second).
   */
  bands: Bands;
};

export type BandName = "sub" | "bass" | "lowmid" | "mid" | "highmid" | "treble";
export type Bands = Record<BandName, number>;
export const BAND_NAMES: BandName[] = ["sub", "bass", "lowmid", "mid", "highmid", "treble"];
// fraction-of-spectrum edges for each band (octave-ish on a 128 bin analyser)
const BAND_EDGES: Record<BandName, [number, number]> = {
  sub: [0, 0.03], bass: [0.03, 0.08], lowmid: [0.08, 0.18], mid: [0.18, 0.34], highmid: [0.34, 0.58], treble: [0.58, 1],
};
const BAND_SPEED: Record<BandName, number> = { sub: 5, bass: 6.5, lowmid: 6, mid: 7, highmid: 8.5, treble: 11 };
const BAND_GAIN: Record<BandName, number> = { sub: 1, bass: 1.05, lowmid: 1.2, mid: 1.4, highmid: 1.75, treble: 2.3 };

export const BINS = 64;
export const WAVE = 128;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function avg(src: Uint8Array, start: number, end: number) {
  let t = 0;
  const e = Math.max(start + 1, Math.min(src.length, end));
  for (let i = start; i < e; i++) t += src[i];
  return t / (e - start) / 255;
}

export class SignalEngine {
  private freq = new Uint8Array(128);
  private time = new Uint8Array(256);
  private prevEnergy = 0;
  private lastNow = 0;
  private smooth = { bass: 0, lowMid: 0, highMid: 0, treble: 0 };
  readonly signal: Signal = {
    bass: 0, lowMid: 0, highMid: 0, treble: 0, energy: 0,
    transient: 0, afterglow: 0, live: false, spectrum: new Float32Array(BINS),
    wave: new Float32Array(WAVE),
    bands: { sub: 0, bass: 0, lowmid: 0, mid: 0, highmid: 0, treble: 0 },
  };

  /**
   * @param analyser live analyser or null
   * @param playing whether audio is (supposed to be) playing; drives the idle generator
   * @param now performance.now()
   */
  sample(analyser: AnalyserNode | null, playing: boolean, now: number): Signal {
    let live = false;
    if (analyser) {
      if (this.freq.length !== analyser.frequencyBinCount) this.freq = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(this.freq);
      if (this.time.length !== analyser.fftSize) this.time = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(this.time);
      for (let i = 0; i < this.freq.length; i += 4) if (this.freq[i] > 3) { live = true; break; }
    }
    if (!live) this.synthesize(now, playing);
    const dt = this.lastNow ? Math.min(0.1, Math.max(0.001, (now - this.lastNow) / 1000)) : 1 / 60;
    this.lastNow = now;

    const f = this.freq;
    const n = f.length;
    const raw = {
      bass: avg(f, 0, Math.ceil(n * 0.12)),
      lowMid: avg(f, Math.ceil(n * 0.12), Math.ceil(n * 0.32)),
      highMid: avg(f, Math.ceil(n * 0.32), Math.ceil(n * 0.62)),
      treble: avg(f, Math.ceil(n * 0.62), n),
    };
    // fast attack, slower release so shapes snap on hits and settle after
    for (const k of ["bass", "lowMid", "highMid", "treble"] as const) {
      const a = raw[k] > this.smooth[k] ? 0.55 : 0.12;
      this.smooth[k] += (raw[k] - this.smooth[k]) * a;
    }
    const s = this.signal;
    s.bass = this.smooth.bass;
    s.lowMid = this.smooth.lowMid;
    s.highMid = this.smooth.highMid;
    s.treble = this.smooth.treble;
    s.energy = clamp((s.bass * 1.45 + s.lowMid + s.highMid * 0.8 + s.treble * 0.55) / 3.3);
    const rise = Math.max(0, s.energy - this.prevEnergy);
    this.prevEnergy = s.energy;
    s.transient = clamp(Math.max(rise * 8.5, s.transient * 0.86));
    s.afterglow = clamp(Math.max(s.transient * 0.8, s.afterglow * 0.965));
    s.live = live;

    // log-ish remap of analyser bins onto BINS display bins
    for (let i = 0; i < BINS; i++) {
      const bi = Math.min(n - 1, Math.floor(Math.pow(i / BINS, 1.6) * n * 0.8) + 1);
      const v = f[bi] / 255;
      s.spectrum[i] += (v - s.spectrum[i]) * (v > s.spectrum[i] ? 0.6 : 0.18);
    }
    // V04 six-band smoothers
    for (const b of BAND_NAMES) {
      const [a0, a1] = BAND_EDGES[b];
      const target = clamp(avg(f, Math.floor(n * a0), Math.ceil(n * a1)) * BAND_GAIN[b]);
      const k = 1 - Math.exp(-BAND_SPEED[b] * dt * (target > s.bands[b] ? 1.6 : 0.7));
      s.bands[b] += (target - s.bands[b]) * k;
    }
    // wave, resampled to WAVE points
    const tl = this.time.length;
    for (let i = 0; i < WAVE; i++) s.wave[i] = (this.time[Math.floor((i / WAVE) * tl)] - 128) / 128;
    return s;
  }

  private synthesize(now: number, playing: boolean) {
    const f = this.freq;
    const time = now * 0.001;
    const gain = playing ? 1 : 0.38; // standby: breathing, not dancing
    for (let i = 0; i < f.length; i++) {
      const p = i / f.length;
      const decay = 1 - p;
      const bassBeat = Math.pow(Math.max(0, Math.sin(time * (playing ? 4.3 : 2.15))), 7) * Math.max(0, 1 - p * 8);
      const midSweep = Math.pow(Math.max(0, Math.sin(time * 0.73 + p * 11)), 3) * Math.max(0, 1 - Math.abs(p - 0.34) * 4);
      const treb = Math.pow(Math.max(0, Math.sin(time * 4.6 + i * 0.91)), 10) * p;
      f[i] = Math.min(255, (18 + Math.min(190, bassBeat * 155 + midSweep * 92 + treb * 125 + Math.max(0, Math.sin(time * 1.1 + i * 0.27)) * 24 * decay)) * gain);
    }
    const w = this.time;
    const amp = (playing ? 30 : 14) + Math.sin(time * 0.63) * 10;
    for (let i = 0; i < w.length; i++) w[i] = 128 + Math.sin(time * 1.8 + i * 0.09) * amp + Math.sin(time * 5.1 + i * 0.37) * amp * 0.35;
  }
}
