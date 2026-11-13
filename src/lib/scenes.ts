// Hidden Track scene registry. Ten-plus channels, all reading one Signal.
//
// V01-V08 are Signal Theater's Canvas scenes, re-inked in the Broadcast
// palette set for this site (screenprint yellow, signal red,
// transit blue on black) and pushed by its dials: chroma heat drives
// saturation, grid rupture drives the tear slices, material grit drives
// grain. V02 Black Sun runs on WebGL when it can (see SignalCanvas).
//
// V09-V11 are plate rigs: a web port of the Cathedral Engine V04 state.
// A dark base plate plus up to twenty luminous alpha plates, each wired to
// one of six smoothed bands with its own alpha gain, scale gain, idle
// oscillator and push axis, exactly the param graph the native state builds.

import { BINS, WAVE, type BandName, type Signal } from "@/lib/signal-engine";
import rigs from "@/lib/plate-rigs.json";

export type SceneId =
  | "neon-rift" | "black-sun" | "wave-temple" | "gravity-grid" | "spectral-crown"
  | "wormhole" | "particle-cathedral" | "signal-ghost"
  | "pirate-tower" | "mixing-desk" | "cathedral-v04";

export type SceneMeta = { id: SceneId; code: string; name: string; mood: string; rig?: keyof typeof rigs.rigs };

export const SCENES: SceneMeta[] = [
  { id: "black-sun", code: "V02", name: "Black Sun", mood: "bass corona / molten orbit" },
  { id: "pirate-tower", code: "V09", name: "Pirate Tower", mood: "VZX plate rig / transmitter", rig: "tower" },
  { id: "neon-rift", code: "V01", name: "Neon Rift", mood: "mirrored blades / voltage" },
  { id: "mixing-desk", code: "V10", name: "Mixing Desk", mood: "VZX plate rig / faders", rig: "desk" },
  { id: "spectral-crown", code: "V05", name: "Spectral Crown", mood: "symmetric skyline" },
  { id: "wave-temple", code: "V03", name: "Wave Temple", mood: "stacked oscilloscopes" },
  { id: "cathedral-v04", code: "V11", name: "Cathedral V04", mood: "the VZX state, in a browser", rig: "cathedral" },
  { id: "gravity-grid", code: "V04", name: "Gravity Grid", mood: "low-end singularity" },
  { id: "wormhole", code: "V06", name: "Wormhole", mood: "tempo descent" },
  { id: "particle-cathedral", code: "V07", name: "Dust Choir", mood: "luminous dust / harmonics" },
  { id: "signal-ghost", code: "V08", name: "Signal Ghost", mood: "haunted transmission" },
];

export const DEFAULT_SCENE: SceneId = "black-sun";
export const sceneById = (id: string | null | undefined) => SCENES.find((s) => s.id === id);

// Broadcast direction, dials: type 98, rupture 82, heat 96, grit 84, motion 95, detail 72
export const DIALS = { typeVolume: 98, gridRupture: 82, chromaHeat: 96, materialGrit: 84, motionCharge: 95, detailLoad: 72 } as const;
const HEAT = DIALS.chromaHeat / 100;
const RUPTURE = DIALS.gridRupture / 100;
const GRIT = DIALS.materialGrit / 100;
const CHARGE = 0.6 + DIALS.motionCharge / 100;

const YEL = [244, 215, 24], RED = [228, 61, 47], BLUE = [63, 169, 255], PAPER = [243, 236, 218];
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
/** three-ink ramp: blue (quiet) -> yellow -> red (hot) */
const ink = (v: number, a: number) => rgba(v < 0.5 ? mix(BLUE, YEL, v * 2) : mix(YEL, RED, (v - 0.5) * 2), a);
const TAU = Math.PI * 2;

export type Ctx2D = CanvasRenderingContext2D;
export type Scene2D = {
  draw: (ctx: Ctx2D, W: number, H: number, s: Signal, t: number) => void;
  /** true once any images the scene needs have decoded */
  ready?: () => boolean;
  dispose?: () => void;
};

function fade(ctx: Ctx2D, W: number, H: number, a: number) {
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(9,8,8,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function polygon(ctx: Ctx2D, x: number, y: number, r: number, sides: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i / sides) * TAU;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}

/** Broadcast finish: rupture tears on hits, scanlines, grain. Shared by every 2D scene. */
export function finish(ctx: Ctx2D, W: number, H: number, s: Signal, t: number, cache: { grain?: HTMLCanvasElement }) {
  const canvas = ctx.canvas;
  if (s.transient > 0.3) {
    const slices = 1 + Math.floor(s.transient * 4 * RUPTURE);
    for (let i = 0; i < slices; i++) {
      const y = ((Math.sin(t * 91.7 + i * 13.1) + 1) / 2) * H;
      const h = H * (0.015 + ((i * 37) % 7) * 0.008);
      const dx = (Math.sin(t * 57 + i * 3.3)) * W * 0.06 * s.transient * RUPTURE;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  if (!cache.grain) {
    const g = document.createElement("canvas");
    g.width = 160; g.height = 160;
    const gc = g.getContext("2d");
    if (gc) {
      const img = gc.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() < 0.5 ? 0 : 40;
      }
      gc.putImageData(img, 0, 0);
      cache.grain = g;
    }
  }
  if (cache.grain) {
    ctx.globalAlpha = 0.25 * GRIT;
    const ox = (t * 977) % 160, oy = (t * 613) % 160;
    const pat = ctx.createPattern(cache.grain, "repeat");
    if (pat) {
      ctx.save(); ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(ox, oy, W, H); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  const step = Math.max(2, Math.round(H / 220));
  for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
}

// ---------- Signal Theater scenes (V01-V08), Broadcast inks ----------

function neonRift(center: [number, number], size: number): Scene2D {
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.17);
      const mn = Math.min(W, H);
      const r = mn * (0.1 + s.bass * 0.12) * size;
      ctx.save();
      ctx.translate(center[0] * W, center[1] * H);
      ctx.rotate(t * 0.035 * CHARGE);
      ctx.globalCompositeOperation = "lighter";
      const n = BINS;
      for (let i = 0; i < n; i++) {
        const v = s.spectrum[i];
        const ang = (i / n) * Math.PI;
        const len = mn * (0.03 + v * 0.42 * HEAT) * size;
        for (const m of [-1, 1]) {
          const c = Math.cos(ang * m), sn = Math.sin(ang * m);
          ctx.beginPath(); ctx.moveTo(c * r, sn * r); ctx.lineTo(c * (r + len), sn * (r + len));
          ctx.strokeStyle = ink(Math.min(1, v * 0.7 + s.treble * 0.5), 0.2 + v * 0.75);
          ctx.lineWidth = (1 + v * 4) * (mn / 600);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = rgba(YEL, 0.3 + s.bass);
      ctx.lineWidth = 2 * (mn / 600);
      polygon(ctx, 0, 0, r * 0.72, 6, t * -0.15);
      ctx.stroke();
      ctx.restore();
    },
  };
}

function blackSun2D(center: [number, number], size: number): Scene2D {
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.22 + (1 - s.energy) * 0.2);
      const mn = Math.min(W, H);
      const base = mn * (0.15 + s.bass * 0.075) * size;
      ctx.save();
      ctx.translate(center[0] * W, center[1] * H);
      ctx.globalCompositeOperation = "lighter";
      const n = 72;
      for (let i = 0; i < n; i++) {
        const v = s.spectrum[Math.floor((i / n) * BINS)];
        const ang = (i / n) * Math.PI + t * 0.02;
        const len = mn * (0.04 + v * v * 0.95 * (0.6 + s.energy * 0.9)) * size;
        for (const mir of [-1, 1]) {
          const ca = Math.cos(ang * mir + Math.PI), sa = Math.sin(ang * mir + Math.PI);
          ctx.beginPath(); ctx.moveTo(ca * base * 1.04, sa * base * 1.04); ctx.lineTo(ca * (base + len), sa * (base + len));
          ctx.strokeStyle = v > 0.6 ? rgba(RED, 0.35 + v * 0.6) : rgba(YEL, 0.25 + v * 0.6);
          ctx.lineWidth = (1 + v * 3.2) * (mn / 600);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = rgba(RED, 0.4 + s.bass * 0.6);
      ctx.lineWidth = (2 + s.bass * 4) * (mn / 600);
      ctx.beginPath(); ctx.arc(0, 0, base, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#050404";
      ctx.beginPath(); ctx.arc(0, 0, base * 0.94, 0, TAU); ctx.fill();
      ctx.restore();
    },
  };
}

function waveTemple(): Scene2D {
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.24);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const lines = 11;
      const k = Math.min(W, H) / 600;
      for (let b = 0; b < lines; b++) {
        const p = b / (lines - 1);
        const cy = H * (0.16 + p * 0.68);
        const amp = H * (0.02 + p * 0.07) * (0.35 + s.energy * 1.4 * CHARGE);
        ctx.beginPath();
        for (let x = 0; x <= W; x += Math.max(3, W / 240)) {
          const wi = Math.floor((x / W) * (WAVE - 1));
          const y = cy + s.wave[(wi + b * 7) % WAVE] * amp + Math.sin(x * 0.008 / k + t * (0.3 + p)) * 5 * k;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ink(p, 0.18 + p * 0.5 + s.transient * 0.2);
        ctx.lineWidth = (1 + p * 2.4) * k;
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(PAPER, 0.07);
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += W / 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      ctx.restore();
    },
  };
}

function gravityGrid(): Scene2D {
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.3);
      const k = Math.min(W, H) / 600;
      const horizon = H * 0.42;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(BLUE, 0.16 + s.highMid * 0.5);
      ctx.lineWidth = 1 * k;
      for (let l = -14; l <= 14; l++) { ctx.beginPath(); ctx.moveTo(W / 2 + l * 8 * k, horizon); ctx.lineTo(W / 2 + l * W * 0.11, H); ctx.stroke(); }
      for (let r = 0; r < 24; r++) {
        const ph = (r / 24 + t * (0.045 + s.bass * 0.12) * CHARGE) % 1;
        const y = horizon + ph * ph * (H - horizon);
        ctx.strokeStyle = rgba(ph > 0.7 ? RED : BLUE, 0.1 + ph * 0.4 + s.bass * 0.2);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.fillStyle = rgba(YEL, 0.9);
      ctx.beginPath(); ctx.arc(W / 2, horizon, (6 + s.bands.sub * 40) * k, 0, TAU); ctx.fill();
      const orbs = 18;
      for (let i = 0; i < orbs; i++) {
        const v = s.spectrum[(i * 3) % BINS];
        const orbit = Math.min(W, H) * (0.16 + i * 0.018);
        const a = t * (0.12 + i * 0.002) * CHARGE + i * 2.4;
        ctx.fillStyle = ink(v, 0.25 + v * 0.7);
        ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * orbit * 1.6, horizon + Math.sin(a) * orbit * 0.38, (2 + v * 13) * k, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
  };
}

function spectralCrown(): Scene2D {
  return {
    draw(ctx, W, H, s) {
      fade(ctx, W, H, 0.22);
      const bars = BINS;
      const bw = W / (bars * 2);
      ctx.save();
      ctx.translate(W / 2, H * 0.55);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < bars; i++) {
        const v = s.spectrum[i];
        const bh = H * (0.01 + v * 0.62 * HEAT);
        ctx.fillStyle = ink(Math.min(1, v * 1.1), 0.22 + v * 0.75);
        const x = i * bw;
        ctx.fillRect(x, -bh * 0.7, Math.max(1, bw - 2), bh);
        ctx.fillRect(-x - bw, -bh * 0.7, Math.max(1, bw - 2), bh);
      }
      ctx.strokeStyle = rgba(RED, 0.35 + s.bass * 0.65);
      ctx.lineWidth = Math.max(2, H / 260);
      ctx.beginPath(); ctx.moveTo(-W / 2, 0); ctx.lineTo(W / 2, 0); ctx.stroke();
      ctx.restore();
    },
  };
}

function wormhole(): Scene2D {
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.14);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.globalCompositeOperation = "lighter";
      const maxR = Math.hypot(W, H) * 0.55;
      const k = Math.min(W, H) / 600;
      for (let r = 0; r < 42; r++) {
        const ph = (r / 42 + t * (0.035 + s.bass * 0.09) * CHARGE) % 1;
        const rad = 12 * k + ph * ph * maxR;
        const v = s.spectrum[(r * 2) % BINS];
        polygon(ctx, Math.sin(t * 0.19) * W * 0.04 * ph, Math.cos(t * 0.13) * H * 0.04 * ph, rad * (1 + v * 0.15), 4 + (r % 3) * 2, t * 0.08 + r * 0.15);
        ctx.strokeStyle = ink((r % 6) / 5, 0.1 + (1 - ph) * 0.55 + v * 0.2);
        ctx.lineWidth = (0.8 + v * 2.4) * k;
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function dustChoir(): Scene2D {
  type P = { x: number; y: number; z: number; sp: number; c: number; sz: number };
  const ps: P[] = [];
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.14);
      const k = Math.min(W, H) / 600;
      const target = Math.min(420, Math.round(120 + (W * H) / 9000));
      while (ps.length < target) ps.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), sp: 0.15 + Math.random() * 0.7, c: Math.random(), sz: 0.5 + Math.random() * 2.5 });
      ps.length = target;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const v = s.spectrum[i % BINS];
        p.y -= p.sp * (0.5 + s.energy * 6 * CHARGE) * k;
        p.x += Math.sin(t * 0.4 + p.y * 0.006 + p.z * 10) * (0.15 + s.lowMid) * k;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        ctx.fillStyle = ink(p.c, 0.2 + v * 0.7);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (0.7 + v * 3) * k, 0, TAU); ctx.fill();
      }
      const cols = 9;
      for (let i = 0; i < cols; i++) {
        const x = ((i + 0.5) * W) / cols;
        const v = s.spectrum[Math.floor((i / cols) * BINS)];
        const g = ctx.createLinearGradient(x, H, x, H * 0.12);
        g.addColorStop(0, rgba(YEL, 0.1 + v * 0.4)); g.addColorStop(1, rgba(RED, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - (2 + v * 7) * k, H * 0.18, (4 + v * 14) * k, H * 0.82);
      }
      ctx.restore();
    },
  };
}

function signalGhost(): Scene2D {
  const ghosts: { pts: Float32Array; c: number }[] = [];
  return {
    draw(ctx, W, H, s, t) {
      fade(ctx, W, H, 0.06);
      const pts = new Float32Array(WAVE);
      for (let i = 0; i < WAVE; i++) pts[i] = H / 2 + s.wave[i] * H * (0.12 + s.energy * 0.3 * CHARGE);
      ghosts.unshift({ pts, c: (t * 0.12) % 1 });
      if (ghosts.length > 18) ghosts.pop();
      const k = Math.min(W, H) / 600;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ghosts.forEach((g, gi) => {
        const drift = gi * 5 * k;
        ctx.beginPath();
        for (let i = 0; i < WAVE; i++) {
          const x = (i / (WAVE - 1)) * W;
          const y = g.pts[i] + Math.sin(i * 0.31 + t) * drift * 0.22 + drift;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ink((g.c + gi * 0.04) % 1, (1 - gi / ghosts.length) * 0.32);
        ctx.lineWidth = (1 + (1 - gi / ghosts.length) * 3) * k;
        ctx.stroke();
      });
      ctx.restore();
    },
  };
}

// ---------- Cathedral Engine V04, web port ----------

type Plate = { file: string; name: string; band: string; rect: number[]; alpha: number[]; scale: number[]; cycle: number[]; push: (string | number)[] };

type RigTune = { fit: "cover" | "contain"; motion: number; alpha: number; hueCycle: boolean };
const RIG_TUNE: Record<keyof typeof rigs.rigs, RigTune> = {
  // the transmitter keeps its yellow ink; plates breathe and push on the low end
  tower: { fit: "cover", motion: 1, alpha: 0.9, hueCycle: false },
  // fine fader detail ghosts if it moves like architecture, so it moves less and flashes harder
  desk: { fit: "cover", motion: 0.45, alpha: 0.7, hueCycle: false },
  // the native V04 cathedral, including its hue jump on section cuts
  cathedral: { fit: "cover", motion: 1, alpha: 1, hueCycle: true },
};

function plateRig(rigName: keyof typeof rigs.rigs): Scene2D {
  const tune = RIG_TUNE[rigName];
  const fit = tune.fit;
  const rig = rigs.rigs[rigName] as { base: string; plates: Plate[] };
  const dir = `/rigs/${rigName}/`;
  const load = (f: string) => { const i = new Image(); i.decoding = "async"; i.src = dir + f; return i; };
  const base = load(rig.base);
  const plates = rig.plates.map((p) => ({ ...p, img: load(p.file) }));
  let cutHue = 0, prevE = 0, pulse = 0;
  const ok = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;
  return {
    ready: () => ok(base),
    draw(ctx, W, H, s, t) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.fillStyle = "#050404";
      ctx.fillRect(0, 0, W, H);
      if (!ok(base)) return;
      // frame: cover on wide screens, nudge right so the type keeps the left field
      const ar = 16 / 9;
      let dw = W, dh = W / ar;
      if (fit === "cover" ? dh < H : dh > H) { dh = H; dw = H * ar; }
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      const bump = 1 + s.bands.sub * 0.03;
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.scale(bump, bump); ctx.translate(-W / 2, -H / 2);
      ctx.globalAlpha = 0.72 + s.bands.bass * 0.2;
      ctx.drawImage(base, dx, dy, dw, dh);
      ctx.restore();
      // cut detection from the V04 cut pulse: hue jumps on section changes
      if (s.energy - prevE > 0.05) { pulse = 1; cutHue = (cutHue + 41 + Math.round(s.treble * 60)) % 360; }
      prevE = s.energy;
      pulse *= 0.9;
      const B = s.bands as Record<BandName, number>;
      ctx.globalCompositeOperation = "screen";
      for (const p of plates) {
        if (!ok(p.img)) continue;
        const v = B[p.band as BandName] ?? s.energy;
        const [amp, freq, phase] = p.cycle;
        const osc = Math.sin((t * freq * TAU + phase * TAU));
        const alpha = Math.min(1, p.alpha[0] + v * p.alpha[1] + amp * 0.8 * Math.sin(t * freq * 1.37 * TAU + phase * TAU));
        const scale = 1 + (p.scale[0] + v * p.scale[1] * CHARGE + amp * osc - 1) * tune.motion;
        const axis = p.push[0], gain = Number(p.push[1]);
        const push = (v * gain * CHARGE + pulse * gain * 0.25) * tune.motion;
        const [rx, ry, rw, rh] = p.rect;
        const cx = dx + (rx + rw / 2) * dw, cy = dy + (ry + rh / 2) * dh;
        ctx.save();
        ctx.translate(cx + (axis === "x" ? push * dw : 0), cy - (axis === "y" ? push * dh : 0));
        ctx.scale(scale, scale);
        ctx.globalAlpha = Math.max(0, alpha * tune.alpha);
        ctx.filter = pulse > 0.2 ? (tune.hueCycle ? `hue-rotate(${Math.round(cutHue * pulse)}deg) saturate(${1 + HEAT * 0.6})` : `brightness(${(1 + pulse * 0.45).toFixed(2)}) saturate(${(1 + HEAT * 0.5).toFixed(2)})`) : "none";
        ctx.drawImage(p.img, -(rw * dw) / 2, -(rh * dh) / 2, rw * dw, rh * dh);
        ctx.restore();
      }
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // signal red flash on the hit, screenprint style
      if (s.transient > 0.25) { ctx.fillStyle = rgba(RED, s.transient * 0.12 * HEAT); ctx.fillRect(0, 0, W, H); }
    },
  };
}

export function makeScene2D(id: SceneId, center: [number, number], size: number): Scene2D {
  switch (id) {
    case "neon-rift": return neonRift(center, size);
    case "wave-temple": return waveTemple();
    case "gravity-grid": return gravityGrid();
    case "spectral-crown": return spectralCrown();
    case "wormhole": return wormhole();
    case "particle-cathedral": return dustChoir();
    case "signal-ghost": return signalGhost();
    case "pirate-tower": return plateRig("tower");
    case "mixing-desk": return plateRig("desk");
    case "cathedral-v04": return plateRig("cathedral");
    case "black-sun":
    default: return blackSun2D(center, size);
  }
}

