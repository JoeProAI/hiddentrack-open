"use client";

import { type RefObject, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Track, songId, primarySrc, fallbackSrc, fmt, slugs, indexForSlug } from "@/lib/fresh-cuts";
import { ensureAudible, ensureRunningGraph, graphIsLive } from "@/lib/audio-graph";
import { pickWeighted } from "@/lib/weighted-pick";
import { BINS, SignalEngine } from "@/lib/signal-engine";
import Theater from "./Theater";
import styles from "./listen.module.css";

type PlayerApi = {
  tracks: Track[];
  index: number | null;
  playing: boolean;
  // Pass a queue (track indexes) to keep auto-advance inside a playlist or filter.
  load: (i: number, queue?: number[]) => Promise<void>;
  toggle: () => Promise<void>;
  error: string | null;
  /** live analyser when Web Audio is running, otherwise null (visuals synthesize) */
  getAnalyser: () => AnalyserNode | null;
  /** the dock's audio element (homepage visualizer syncs its live frames to it) */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** show a track in the dock, ready to play, without starting audio */
  cue: (i: number) => void;
  pause: () => void;
  /** prev/next through the current queue (same as the dock buttons) */
  step: (d: number) => void;
  shuffle: boolean;
  setShuffle: (on: boolean) => void;
  queue: number[] | null;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
};

// Lives in the shared layout so the audio keeps playing while people move around the site.
export default function PlayerProvider({ tracks, children }: { tracks: Track[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wiredRef = useRef(false);
  const triedFallback = useRef(false);

  const [index, setIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [queue, setQueue] = useState<number[] | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [theater, setTheater] = useState(false);
  const closeTheater = useCallback(() => setTheater(false), []);

  const current = index === null ? null : tracks[index];

  const armGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    await ensureRunningGraph(audio, { ctxRef, analyserRef, wiredRef });
  }, []);

  const shareTo = useCallback((i: number) => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname === "/listen" ? "/listen" : window.location.pathname === "/" ? "/" : null;
    if (!path) return;
    // Keep any ?mood, ?genre or ?q filters in the URL alongside the share slug.
    const sp = new URLSearchParams(window.location.search);
    sp.set("t", slugs[i]);
    window.history.replaceState(null, "", `${path}?${sp.toString()}`);
  }, []);

  const play = useCallback(async (i: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    await armGraph();
    ensureAudible(audio);
    triedFallback.current = false;
    setError(null);
    setIndex(i);
    setTime(0);
    setDuration(0);
    shareTo(i);
    audio.src = primarySrc(songId(tracks[i].href));
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, [armGraph, shareTo, tracks]);

  const load = useCallback((i: number, q?: number[]) => {
    setQueue(q && q.length > 1 && q.includes(i) ? q : null);
    return play(i);
  }, [play]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (index === null) return play(0);
    if (!audio.currentSrc && !audio.src) return play(index);
    await armGraph();
    ensureAudible(audio);
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setPlaying(false);
    }
  }, [index, play, armGraph]);

  const step = useCallback((d: number) => {
    const order = queue ?? null;
    const n = order ? order.length : tracks.length;
    const at = (k: number) => (order ? order[k] : k);
    const pos = index === null ? null : order ? order.indexOf(index) : index;
    // Shuffle draws with the same recency curve as the opening cut, and never
    // repeats the cut that is on. A playlist or filter queue stays inside itself
    // (recency only); an open catalog shuffle also prefers hard / party.
    if (shuffle && d > 0 && n > 1) {
      return void play(pickWeighted(tracks, { candidates: order ?? undefined, avoid: index, energy: !order }));
    }
    void play(at(((pos ?? -d) + d + n) % n));
  }, [index, play, queue, shuffle, tracks]);

  // Share links: /?t=<slug> cues that track (browsers need a tap before audio can start).
  useEffect(() => {
    const i = indexForSlug(new URLSearchParams(window.location.search).get("t"));
    if (i < 0) return;
    const raf = requestAnimationFrame(() => {
      setIndex(i);
      document.getElementById(`t-${slugs[i]}`)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const onError = () => {
    const audio = audioRef.current;
    if (!audio || index === null) return;
    if (!triedFallback.current) {
      triedFallback.current = true;
      ensureAudible(audio);
      audio.src = fallbackSrc(songId(tracks[index].href));
      void audio.play().catch(() => setPlaying(false));
      return;
    }
    setPlaying(false);
    setError("This cut will not load here. Try it on Suno.");
  };

  const getAnalyser = useCallback(
    () => (graphIsLive(ctxRef.current, analyserRef.current) ? analyserRef.current : null),
    [],
  );
  const cue = useCallback((i: number) => { setIndex((cur) => (cur === null ? i : cur)); }, []);
  const pause = useCallback(() => { audioRef.current?.pause(); }, []);

  // Dock strip: Signal Theater's mirrored Neon Rift blades, laid flat. Bars grow
  // out from the centre line; hot red marks peaks, acid is the body.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const engine = new SignalEngine();
    let raf = 0;
    const draw = (now: number) => {
      raf = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) { if (!reduce) raf = requestAnimationFrame(draw); return; }
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const sig = engine.sample(playing ? getAnalyser() : null, playing && !reduce, reduce ? 4200 : now);
      const cols = Math.max(32, Math.floor(w / 7));
      const bw = w / cols;
      const mid = cols / 2;
      for (let c = 0; c < cols; c++) {
        const d = Math.abs(c - mid) / mid; // 0 centre, 1 edges
        const v = playing ? sig.spectrum[Math.min(BINS - 1, Math.floor(d * BINS))] : 0.05 + 0.03 * Math.abs(Math.sin(c * 0.7));
        const bh = Math.max(2, v * h);
        g.fillStyle = v > 0.66 ? "#e43d2f" : "#f4d718";
        g.globalAlpha = 0.35 + v * 0.65;
        g.fillRect(c * bw, h - bh, Math.max(1, bw - 2), bh);
      }
      g.globalAlpha = 1;
      if (sig.transient > 0.25 && playing) { g.fillStyle = `rgba(228,61,47,${sig.transient * 0.35})`; g.fillRect(0, 0, w, h); }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onVis = () => { if (!document.hidden && !raf) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
  }, [playing, getAnalyser]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (index === null || e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "A") return;
      e.preventDefault();
      void toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, toggle]);

  const hideDock = pathname === "/listen/x";
  const dockClass = [styles.dock, hideDock ? styles.dockHidden : styles.dockOn].join(" "); // visible from page load everywhere (play ready on the newest cut)

  return (
    <PlayerContext.Provider value={{ tracks, index, playing, load, toggle, error, getAnalyser, audioRef, cue, pause, step, shuffle, setShuffle, queue }}>
      {children}
      <div className={dockClass} role="region" aria-label="Hidden Track player">
        <canvas ref={canvasRef} className={styles.viz} aria-hidden="true" />
        <div className={styles.dockRow}>
          <div className={styles.controls}>
            <button type="button" className={styles.ctl} onClick={() => step(-1)} aria-label="Previous cut">&#9664;&#9664;</button>
            <button type="button" className={`${styles.ctl} ${styles.ctlMain}`} onClick={() => void toggle()} aria-label={playing ? "Pause" : "Play"}>
              {playing ? "\u275A\u275A" : "\u25B6"}
            </button>
            <button type="button" className={styles.ctl} onClick={() => step(1)} aria-label="Next cut">&#9654;&#9654;</button>
            <button
              type="button"
              className={`${styles.ctl} ${shuffle ? styles.ctlOn : ""}`}
              aria-pressed={shuffle}
              aria-label="Shuffle"
              title={shuffle ? "Shuffle on" : "Shuffle off"}
              onClick={() => setShuffle((s) => !s)}
            >
              SHUF
            </button>
            <button type="button" className={`${styles.ctl} ${styles.ctlTv}`} aria-haspopup="dialog" aria-label="Open Signal Theater" title="Signal Theater: full screen visuals" onClick={() => { if (document.querySelector("[data-hero-tv]")) window.dispatchEvent(new Event("ht:tv")); else setTheater(true); }}>
              TV
            </button>
          </div>
          <div className={styles.now}>
            <span className={styles.nowNum}>{String((index ?? 0) + 1).padStart(2, "0")}</span>
            <span className={styles.nowText}>
              <strong>{(current ?? tracks[0])?.title ?? "Pick a cut"}</strong>
              <span>{error ?? (current ? (playing || time > 0 ? current.lane : `${current.lane} / tap play`) : tracks[0] ? `${tracks[0].lane} / tap play` : "Press play for the newest cut")}</span>
            </span>
          </div>
          <div className={styles.scrub}>
            <span>{fmt(time)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              aria-label="Seek"
              disabled={!duration}
              onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = Number(e.target.value); }}
              style={{ ["--pct" as string]: duration ? `${(time / duration) * 100}%` : "0%" }}
            />
            <span>{fmt(duration)}</span>
          </div>
          <Link className={styles.dockFree} href="/license">FREE TO USE</Link>
        </div>
        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => step(1)}
          onError={onError}
        />
      </div>
      <Theater open={theater} onClose={closeTheater} getAnalyser={getAnalyser} playing={playing} track={current} num={index} toggle={() => void toggle()} step={step} />
    </PlayerContext.Provider>
  );
}
