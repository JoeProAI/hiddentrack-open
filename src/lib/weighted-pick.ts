// Weighted recency for the opening cut, shuffle, and TV.
//
// The catalog is newest-first, so index 0 is the newest track. Weight is
// exponential decay by that index: 2^(-index / 48). The newest cut is the most
// likely, a cut 48 places older is half as likely, 96 places older is a
// quarter, and the oldest cuts stay in the draw as a thin tail.
// Hard, party, and high-energy lanes keep the full weight. Opening play and TV
// draw only from that pool. An open-catalog shuffle uses the same decay on
// every track, with other moods multiplied by 0.2 so they can still come up.
// Pass `avoid` to skip the track that just played.

import type { Track } from "@/lib/fresh-cuts";
import { moodsFor } from "@/lib/moods";

/** A cut this many places older is half as likely as the one at the front. */
export const RECENCY_HALF_LIFE = 48;
/** Share of its recency weight that a non-energy track keeps. */
export const SOFT_MOOD_WEIGHT = 0.2;

const ENERGY = /drill|trap|rave|dance|club|edm|punk|metal|hype|anthem|bounce|phonk|hard/i;

export function isEnergy(track: Track): boolean {
  const moods = moodsFor(track);
  return moods.includes("hard") || moods.includes("party") || ENERGY.test(track.lane);
}

/** Catalog indexes of hard / party / high-energy cuts, newest first. */
export function hotIndexes(tracks: readonly Track[]): number[] {
  return tracks.map((_, i) => i).filter((i) => isEnergy(tracks[i]));
}

/** Decay for `index` (0 = newest). Pass `full` false to apply the soft-mood scale. */
export function recencyWeight(index: number, full = true): number {
  const decay = Math.pow(2, -Math.max(0, index) / RECENCY_HALF_LIFE);
  return full ? decay : decay * SOFT_MOOD_WEIGHT;
}

type Rng = () => number;

type PickOptions = {
  /** Catalog indexes to draw from. Defaults to the whole catalog. */
  candidates?: readonly number[];
  /** Skip this catalog index (the cut that just played). */
  avoid?: number | null;
  /**
   * Keep hard/party/high-energy at full weight. Turn this off inside a
   * playlist or filter queue so that queue is not pushed back onto hard tracks.
   * Defaults to true.
   */
  energy?: boolean;
  random?: Rng;
};

function weightOf(tracks: readonly Track[], index: number, energyBias: boolean): number {
  const track = tracks[index];
  if (!track) return 0;
  return recencyWeight(index, !energyBias || isEnergy(track));
}

/** One catalog index, weighted toward newer high-energy cuts. */
export function pickWeighted(tracks: readonly Track[], options: PickOptions = {}): number {
  const rand = options.random ?? Math.random;
  const energyBias = options.energy ?? true;
  let pool = options.candidates ? [...options.candidates] : tracks.map((_, i) => i);
  const avoid = options.avoid;
  if (avoid != null && pool.length > 1) pool = pool.filter((i) => i !== avoid);
  if (!pool.length) return avoid ?? 0;
  if (pool.length === 1) return pool[0];

  const weights = pool.map((i) => weightOf(tracks, i, energyBias));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return pool[Math.floor(rand() * pool.length)] ?? pool[0];

  let roll = rand() * total;
  for (let k = 0; k < pool.length; k++) {
    roll -= weights[k];
    if (roll <= 0) return pool[k];
  }
  return pool[pool.length - 1];
}

/**
 * Weighted random order (sampling without replacement) so a TV queue starts
 * on newer cuts and only later reaches the tail. Same weights as `pickWeighted`.
 */
export function orderByRecency(tracks: readonly Track[], candidates: readonly number[], options: PickOptions = {}): number[] {
  const rand = options.random ?? Math.random;
  const energyBias = options.energy ?? true;
  const keyed = candidates.map((index) => {
    const w = Math.max(weightOf(tracks, index, energyBias), 1e-12);
    const u = Math.max(rand(), Number.EPSILON);
    return { index, key: -Math.log(u) / w };
  });
  keyed.sort((a, b) => a.key - b.key);
  return keyed.map((row) => row.index);
}
