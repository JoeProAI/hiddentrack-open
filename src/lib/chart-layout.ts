// The Cobbler's Chart: a floor plan of the catalog. Pure and deterministic so the
// server render and the browser agree on every footprint.
import { tracks, slugs } from "@/lib/fresh-cuts";
import { type Mood, moodsFor } from "@/lib/moods";

export const VIEW = { w: 1200, h: 800 };

export type Room = {
  mood: Mood;
  name: string;
  note: string;
  x: number; y: number; w: number; h: number;
  door: { x: number; y: number };
  kind?: "cellar" | "porch";
};

const top = (x: number, w: number) => ({ y: 60, h: 280, x, w, door: { x: x + w / 2, y: 340 } });
const bottom = (x: number, w: number) => ({ y: 460, h: 280, x, w, door: { x: x + w / 2, y: 460 } });

export const ROOMS: Room[] = [
  { mood: "hard", name: "The Boiler Room", note: "Heavy pipes, hard bars", ...top(60, 300) },
  { mood: "cinematic", name: "The Projection Booth", note: "Reels, rain and getaway vans", ...top(360, 260) },
  { mood: "party", name: "The Dance Hall", note: "Scuffed floor, horns up", ...top(620, 330) },
  { mood: "halloween", name: "The Root Cellar", note: "Mind the third step", x: 975, y: 30, w: 175, h: 330, door: { x: 975, y: 300 }, kind: "cellar" },
  { mood: "funny", name: "The Kitchen", note: "Where the stories get told twice", ...bottom(60, 280) },
  { mood: "love", name: "The Parlor", note: "Good chairs, slow songs", ...bottom(340, 260) },
  { mood: "chill", name: "The Back Porch", note: "Screen door, low volume", ...bottom(600, 300), kind: "porch" },
  { mood: "sad", name: "The Attic", note: "Boxes nobody opens alone", ...bottom(900, 250) },
];

export const roomFor = (m: Mood) => ROOMS.find((r) => r.mood === m)!;

// Small seeded hash and PRNG.
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Print = { x: number; y: number; a: number; left: boolean };
export type Trail = { index: number; slug: string; mood: Mood; from: Mood | null; end: { x: number; y: number }; prints: Print[]; hit: string };

export type Catalog = { index: number; slug: string; moods: Mood[] }[];

// A song lives in its most particular room; the rest of its moods are where its prints come from.
const PRIORITY: Mood[] = ["halloween", "cinematic", "funny", "sad", "love", "chill", "hard", "party"];
const ordered = (ms: Mood[]) => [...ms].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));

export const catalog: Catalog = tracks.map((t, i) => ({ index: i, slug: slugs[i], moods: ordered(moodsFor(t)) }));

export const byRoom = (m: Mood) => catalog.filter((c) => c.moods[0] === m);

const PER_ROOM = 6;
const FRESH = 12; // the newest cuts are on the front page already; trails favor deeper ones

function pick(m: Mood, night: number) {
  const all = byRoom(m);
  const order = (c: Catalog[number]) => hash(`${c.slug}:${night}`);
  const deep = all.filter((c) => c.index >= FRESH).sort((a, b) => order(a) - order(b));
  const fresh = all.filter((c) => c.index < FRESH).sort((a, b) => order(a) - order(b));
  return [...deep, ...fresh].slice(0, PER_ROOM);
}

function walk(start: { x: number; y: number }, end: { x: number; y: number }, r: () => number) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const sway = (r() - 0.5) * Math.min(260, len * 0.7);
  const c1 = { x: start.x + dx * 0.3 + nx * sway, y: start.y + dy * 0.3 + ny * sway };
  const c2 = { x: start.x + dx * 0.7 - nx * sway * 0.6, y: start.y + dy * 0.7 - ny * sway * 0.6 };
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    };
  };
  const prints: Print[] = [];
  const STEP = 24;
  let prev = at(0), acc = STEP, left = r() > 0.5;
  for (let i = 1; i <= 240; i++) {
    const p = at(i / 240);
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    acc += d;
    if (acc >= STEP) {
      acc = 0;
      const a = Math.atan2(p.y - prev.y, p.x - prev.x);
      const off = left ? -5 : 5;
      prints.push({ x: +(p.x + Math.cos(a + Math.PI / 2) * off).toFixed(1), y: +(p.y + Math.sin(a + Math.PI / 2) * off).toFixed(1), a: +((a * 180) / Math.PI + 90).toFixed(1), left });
      left = !left;
    }
    prev = p;
  }
  return { prints };
}

export function trailsFor(night: number): Trail[] {
  const out: Trail[] = [];
  for (const room of ROOMS) {
    const chosen = pick(room.mood, night);
    const cols = 3, rows = 2, pad = 46;
    chosen.forEach((c, k) => {
      const r = rng(hash(`${c.slug}#${night}`));
      const cw = (room.w - pad * 2) / cols, rh = (room.h - pad * 2 - 20) / rows;
      const col = k % cols, row = Math.floor(k / cols) % rows;
      const end = {
        x: room.x + pad + cw * col + cw * (0.25 + r() * 0.5),
        y: room.y + pad + 26 + rh * row + rh * (0.25 + r() * 0.5),
      };
      const from = c.moods.find((m) => m !== room.mood) ?? null;
      const door = from ? roomFor(from).door : { x: 120 + r() * 960, y: 400 + (r() - 0.5) * 60 };
      const start = { x: door.x + (r() - 0.5) * 60, y: door.y + (r() - 0.5) * 30 };
      // Only the last stretch shows; long walks fade out somewhere in the hall.
      const prints = walk(start, end, r).prints.slice(-24);
      const hit = "M" + [...prints.map((p) => `${p.x} ${p.y}`), `${end.x.toFixed(1)} ${end.y.toFixed(1)}`].join(" L");
      out.push({ index: c.index, slug: c.slug, mood: room.mood, from, end, prints, hit });
    });
  }
  return out;
}
