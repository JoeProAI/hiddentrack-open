"use client";

import { type RefObject, useEffect, useState } from "react";
import styles from "./embed.module.css";

// Song translator caption: each sung line has a precomputed scene prompt (public/lantern/tracks/<id>.json).
// The caption follows the playhead (or the free-run clock when autoplay is blocked) and shows the line
// becoming its scene. No track file means no caption; nothing else changes.

export type Cue = [number, number, string, string, string]; // start s, end s, lyric, scene, energy label
type Track = { v: number; id: string; cues: Cue[] };

const cache = new Map<string, Promise<Track | null>>();
export function loadTrack(song: string): Promise<Track | null> {
  if (!/^[0-9a-f-]{36}$/.test(song)) return Promise.resolve(null);
  let p = cache.get(song);
  if (!p) {
    p = fetch(`/lantern/tracks/${song}.json`).then((r) => (r.ok ? (r.json() as Promise<Track>) : null)).catch(() => null);
    cache.set(song, p);
  }
  return p;
}

export function cueAt(cues: Cue[], t: number): Cue | null {
  let lo = 0, hi = cues.length - 1, hit = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m][0] <= t) { hit = m; lo = m + 1; } else hi = m - 1; }
  if (hit < 0) return null;
  const c = cues[hit];
  return t <= Math.max(c[1], c[0] + 2.5) + 1.2 ? c : null; // hold briefly past the line so it can be read
}

type Props = { song: string; on: boolean; audioRef: RefObject<HTMLAudioElement | null>; freeClock?: number };

export default function LyricCue({ song, on, audioRef, freeClock = 0 }: Props) {
  const [track, setTrack] = useState<Track | null>(null);
  const [cue, setCue] = useState<Cue | null>(null);

  useEffect(() => {
    let dead = false;
    loadTrack(song).then((t) => { if (!dead) setTrack(t && t.id === song ? t : null); });
    return () => { dead = true; setTrack(null); setCue(null); };
  }, [song]);

  useEffect(() => {
    if (!on || !track?.cues.length) return;
    const tick = () => {
      const a = audioRef.current;
      const t = freeClock && (!a || a.paused) ? (performance.now() - freeClock) / 1000 : a?.currentTime ?? 0;
      const c = cueAt(track.cues, t);
      setCue((prev) => (prev === c ? prev : c));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [on, track, audioRef, freeClock]);

  if (!on || !cue || !cue[3]) return null;
  return (
    <p className={styles.cue} aria-live="off" data-cue>
      <span className={styles.cueLyric}>&ldquo;{cue[2]}&rdquo;</span>
      <span className={styles.cueScene} key={cue[0]}>{cue[3]}</span>
    </p>
  );
}
