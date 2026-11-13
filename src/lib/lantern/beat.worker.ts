/// <reference lib="webworker" />
// Play my folder: song map from raw PCM, entirely on-device (Hidden Track, MIT).
// In: { id, sr, ch: Float32Array[] }  Out: { id, tl } where tl matches the frame server's timeline schema:
// { duration, bpm, beats[], kicks[], sections[{start,end,label}], curve_step, energy[], bass[] }

type In = { id: number; sr: number; ch: Float32Array[] };

const SR = 11025, HOP = 256; // ~23 ms frames

function analyze(sr: number, ch: Float32Array[]) {
  // mono + decimate to ~11 kHz with a box filter
  const n = ch[0].length, k = Math.max(1, Math.round(sr / SR)), m = Math.floor(n / k), x = new Float32Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let c = 0; c < ch.length; c++) { const d = ch[c]; for (let j = 0; j < k; j++) s += d[i * k + j]; } x[i] = s / (k * ch.length); }
  const fsr = sr / k, dur = n / sr, F = Math.floor(m / HOP), fps = fsr / HOP;
  // per-frame RMS, bass (one-pole LP ~150 Hz) and high (residual) energy
  const rms = new Float32Array(F), bass = new Float32Array(F), hi = new Float32Array(F);
  const a = Math.exp((-2 * Math.PI * 150) / fsr); let lp = 0;
  for (let f = 0; f < F; f++) {
    let e = 0, b = 0, h = 0;
    for (let j = 0; j < HOP; j++) { const v = x[f * HOP + j]; lp = (1 - a) * v + a * lp; e += v * v; b += lp * lp; h += (v - lp) * (v - lp); }
    rms[f] = Math.sqrt(e / HOP); bass[f] = Math.sqrt(b / HOP); hi[f] = Math.sqrt(h / HOP);
  }
  // onset strength: half-wave rectified log-energy differences
  const L = (v: number) => Math.log(1e-4 + v), on = new Float32Array(F), bon = new Float32Array(F);
  for (let f = 1; f < F; f++) { bon[f] = Math.max(0, L(bass[f]) - L(bass[f - 1])); on[f] = bon[f] + 0.6 * Math.max(0, L(hi[f]) - L(hi[f - 1])); }
  // tempo: autocorrelation of onset envelope over 60..200 BPM with a soft prior around 120
  let best = 0, bestLag = Math.round((fps * 60) / 120);
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (fps * 60) / bpm, li = Math.floor(lag), fr = lag - li; let s = 0;
    for (let f = li + 1; f < F; f++) s += on[f] * (on[f - li] * (1 - fr) + on[f - li - 1] * fr);
    s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (s > best) { best = s; bestLag = lag; }
  }
  let bpm = (60 * fps) / bestLag; while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2;
  const lag = (fps * 60) / bpm;
  // beat phase: offset with the most onset energy on the grid
  let ph = 0, phS = -1;
  for (let p = 0; p < lag; p += 1) { let s = 0; for (let t = p; t < F; t += lag) s += on[Math.round(t)] ?? 0; if (s > phS) { phS = s; ph = p; } }
  const beats: number[] = []; for (let t = ph; t < F; t += lag) beats.push(+(t / fps).toFixed(2));
  // kicks: bass onset peaks over an adaptive threshold, >= 0.2 s apart
  const kicks: number[] = []; let last = -1; const W = Math.round(fps * 1.5);
  const pre = new Float64Array(F + 1); for (let f = 0; f < F; f++) pre[f + 1] = pre[f] + bon[f];
  for (let f = 1; f < F - 1; f++) {
    const lo = Math.max(0, f - W), hiI = Math.min(F, f + W), mean = (pre[hiI] - pre[lo]) / (hiI - lo);
    if (bon[f] > 0.35 && bon[f] > mean * 2.2 && bon[f] >= bon[f - 1] && bon[f] >= bon[f + 1] && f / fps - last > 0.2) { kicks.push(+(f / fps).toFixed(2)); last = f / fps; }
  }
  // curves (normalised to the song's own 5..98th percentile), resampled to `step`
  const step = Math.max(0.25, +(dur / 1400).toFixed(2));
  const norm = (v: Float32Array) => { const s = Array.from(v).sort((p, q) => p - q); const lo = s[Math.floor(s.length * 0.05)] ?? 0, hiV = s[Math.floor(s.length * 0.98)] ?? 1; return (y: number) => Math.min(1, Math.max(0, (y - lo) / Math.max(1e-6, hiV - lo))); };
  const nr = norm(rms), nb = norm(bass);
  const curve = (v: Float32Array, f: (y: number) => number) => { const out: number[] = []; for (let t = 0; t < dur; t += step) { const a0 = Math.floor(t * fps), a1 = Math.min(F, Math.floor((t + step) * fps)); let s = 0; for (let i = a0; i < a1; i++) s += v[i]; out.push(+f(s / Math.max(1, a1 - a0)).toFixed(2)); } return out; };
  const energy = curve(rms, nr), bassC = curve(bass, nb);
  // sections: 8-bar blocks labelled by smoothed energy (quartiles) and slope
  const bar = (4 * 60) / bpm, blk = Math.max(8, bar * 8), sections: { start: number; end: number; label: string }[] = [];
  const at = (t: number) => energy[Math.min(energy.length - 1, Math.max(0, Math.floor(t / step)))];
  const blocks: number[] = []; for (let t = 0; t < dur; t += blk) { let s = 0, c = 0; for (let u = t; u < Math.min(dur, t + blk); u += step) { s += at(u); c++; } blocks.push(s / Math.max(1, c)); }
  const q = [...blocks].sort((p, r) => p - r), q25 = q[Math.floor(q.length * 0.25)] ?? 0.3, q70 = q[Math.floor(q.length * 0.7)] ?? 0.6;
  blocks.forEach((e, i) => {
    const next = blocks[i + 1] ?? e;
    const label = e >= q70 ? "peak" : e <= q25 && (i === 0 || i === blocks.length - 1 || e < 0.35) ? "intro_or_break" : next - e > 0.12 ? "build" : "drive";
    const start = +(i * blk).toFixed(2), end = +Math.min(dur, (i + 1) * blk).toFixed(2);
    const prev = sections[sections.length - 1];
    if (prev && prev.label === label) prev.end = end; else if (end > start) sections.push({ start, end, label });
  });
  return { duration: +dur.toFixed(2), bpm: +bpm.toFixed(2), beats: beats.slice(0, 3000), kicks: kicks.slice(0, 3000), sections: sections.slice(0, 400), curve_step: step, energy, bass: bassC };
}

self.onmessage = (e: MessageEvent<In>) => {
  const { id, sr, ch } = e.data;
  try { (self as unknown as Worker).postMessage({ id, tl: analyze(sr, ch) }); }
  catch (err) { (self as unknown as Worker).postMessage({ id, error: String(err) }); }
};
