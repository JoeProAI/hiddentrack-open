"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Track, songId, primarySrc, fallbackSrc, fmt, indexForSlug } from "@/lib/fresh-cuts";
import { ensureAudible, ensureRunningGraph, graphIsLive } from "@/lib/audio-graph";
import { hotIndexes, pickWeighted } from "@/lib/weighted-pick";
import SignalCanvas from "@/components/viz/SignalCanvas";
import ChannelDial from "@/components/viz/ChannelDial";
import SessionClip from "./SessionClip";
import LiveLayer, { type LiveState } from "./LiveLayer";
import LyricCue from "./LyricCue";
import { useScene } from "@/lib/scene-store";
import type { Signal } from "@/lib/signal-engine";
import styles from "./embed.module.css";

const LISTEN_URL = "https://hiddentrack.fm/";
const LAST_KEY = "ht_embed_last";

// Fresh song per card load: ?song= / ?t= (slug or Suno id) wins. Otherwise the same
// weighted-recency draw as the homepage, skipping whatever this browser played last.
function pickStart(tracks: Track[]): number {
  try {
    const params = new URLSearchParams(window.location.search);
    const song = params.get("song");
    const slug = song ?? params.get("t");
    if (slug) {
      const bySlug = indexForSlug(slug);
      if (bySlug >= 0) return bySlug;
    }
    if (song) {
      const byId = tracks.findIndex((t) => songId(t.href) === song);
      if (byId >= 0) return byId;
    }
  } catch { /* ignore */ }
  let last = -1;
  try {
    const id = localStorage.getItem(LAST_KEY) ?? "";
    if (id) last = tracks.findIndex((t) => songId(t.href) === id);
  } catch { /* storage blocked in some iframes */ }
  const hot = hotIndexes(tracks);
  return pickWeighted(tracks, { avoid: last >= 0 ? last : null, candidates: hot.length ? hot : undefined });
}

export default function EmbedPlayer({ tracks }: { tracks: Track[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const lastBass = useRef(-1);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wiredRef = useRef(false);
  const triedFallback = useRef(false);

  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<LiveState>("off");
  const [warm, setWarm] = useState(false);
  const [muted, setMuted] = useState(false); // autoplaying silently until the first tap
  const [freeRun, setFreeRun] = useState(false); // media autoplay blocked: visuals run off the timeline clock
  const [watching, setWatching] = useState(false); // card on screen in a visible tab
  const [freeAt, setFreeAt] = useState(0); // pre-connect the live stream on hover/focus/touch so frames are ready at play
  const [cc, setCc] = useState(false); // lyric/scene caption is off by default; opt in with ?cc=1
  const [hero, setHero] = useState(false); // ?hero=1: homepage hero (same card engine, TV button instead of FULL LIST)
  const [tv, setTv] = useState(false); // lean-back: weighted high-energy auto-advance, controls auto-hide
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const t = setTimeout(() => { setCc(q.get("cc") === "1"); setHero(q.get("hero") === "1"); setTv(q.get("tv") === "1"); }, 0);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, []);

  const current = tracks[index];
  const scene = useScene();

  const armGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    await ensureRunningGraph(audio, { ctxRef, analyserRef, wiredRef });
  }, []);

  const load = useCallback(async (i: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    await armGraph();
    ensureAudible(audio);
    triedFallback.current = false;
    setMuted(false);
    setFreeRun(false);
    setStarted(true);
    setError(null);
    setLoading(true);
    setIndex(i);
    setTime(0);
    setDuration(0);
    audio.src = primarySrc(songId(tracks[i].href));
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      setLoading(false);
    }
  }, [armGraph, tracks]);

  // On load: random song, muted autoplay so the card is alive before anyone taps.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = setTimeout(() => {
      const i = pickStart(tracks);
      try { localStorage.setItem(LAST_KEY, songId(tracks[i].href)); } catch { /* ignore */ }
      setIndex(i);
      setStarted(true);
      setMuted(true);
      audio.muted = true;
      audio.src = primarySrc(songId(tracks[i].href));
      audio.play().catch(() => { setFreeAt(performance.now()); setFreeRun(true); setPlaying(true); });
    }, 0);
    return () => clearTimeout(t);
  }, [tracks]);

  // Only claim a GPU slot while the card is actually on screen in a visible tab.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    let inView = false;
    const update = () => setWatching(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting && e.intersectionRatio >= 0.5; update(); }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  // First tap: sound on, same position, no restart.
  const unmute = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setMuted(false);
    if (freeRun) {
      setFreeRun(false);
      const t = (performance.now() - freeAt) / 1000;
      audio.currentTime = Number.isFinite(audio.duration) ? Math.min(t, audio.duration - 1) : t;
    }
    await armGraph();
    ensureAudible(audio);
    try { if (audio.paused) await audio.play(); } catch { setPlaying(false); }
  }, [armGraph, freeRun, freeAt]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!started) return load(index);
    if (muted || freeRun) return unmute();
    await armGraph();
    ensureAudible(audio);
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setPlaying(false);
      setLoading(false);
    }
  }, [started, index, load, armGraph, muted, freeRun, unmute]);

  const next = useCallback((d: number) => {
    const n = tracks.length;
    if (tv && d > 0 && n > 1) {
      const hot = hotIndexes(tracks);
      return void load(pickWeighted(tracks, { avoid: index, candidates: hot.length ? hot : undefined }));
    }
    if (shuffle && d > 0 && n > 1) {
      return void load(pickWeighted(tracks, { avoid: index }));
    }
    void load((index + d + n) % n);
  }, [index, load, shuffle, tracks, tv]);

  // Homepage hero <-> page: TV toggles, and only one thing makes sound at a time.
  useEffect(() => {
    if (!hero) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "ht:tvmode") setTv(Boolean(e.data.on));
      if (e.data.type === "ht:mute") { const a = audioRef.current; if (a && !a.muted) { a.muted = true; setMuted(true); } }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { try { window.parent.postMessage({ type: "ht:tv", on: false }, window.location.origin); } catch { /* ignore */ } } };
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey); };
  }, [hero]);
  useEffect(() => {
    if (!hero || !playing || muted || freeRun) return;
    try { window.parent.postMessage({ type: "ht:herosound" }, window.location.origin); } catch { /* ignore */ }
  }, [hero, playing, muted, freeRun]);
  useEffect(() => {
    if (!tv) { const t = setTimeout(() => setIdle(false), 0); return () => clearTimeout(t); }
    let timer = setTimeout(() => setIdle(true), 3000);
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 3000); };
    window.addEventListener("pointermove", wake); window.addEventListener("pointerdown", wake); window.addEventListener("keydown", wake);
    return () => { clearTimeout(timer); window.removeEventListener("pointermove", wake); window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); };
  }, [tv]);

  const onError = () => {
    const audio = audioRef.current;
    if (!audio || !started) return;
    if (!triedFallback.current) {
      triedFallback.current = true;
      ensureAudible(audio);
      audio.src = fallbackSrc(songId(tracks[index].href));
      void audio.play().catch(() => setPlaying(false));
      return;
    }
    setPlaying(false);
    setLoading(false);
    setError("This cut will not load here. Try it on Suno.");
  };

  const getAnalyser = useCallback(
    () => (graphIsLive(ctxRef.current, analyserRef.current) ? analyserRef.current : null),
    [],
  );

  // The title is a meter: bass widens it, hits kick the red/ice split.
  const onFrame = useCallback((sig: Signal) => {
    const el = frameRef.current;
    if (!el) return;
    const b = Math.round(sig.bass * 40) / 40;
    if (b === lastBass.current) return;
    lastBass.current = b;
    el.style.setProperty("--bass", String(b));
    el.style.setProperty("--hit", String(Math.round(sig.transient * 10) / 10));
  }, []);

  const pct = duration ? (time / duration) * 100 : 0;

  const status = error ?? (loading ? "Tuning in" : current.lane);

  return (
    <main ref={frameRef} className={styles.frame} data-state={error ? "error" : loading ? "loading" : playing ? "playing" : started ? "paused" : "idle"} data-live={(live === "live" && started) || undefined} data-hero={hero || undefined} data-tv={tv || undefined} data-idle={(tv && idle) || undefined}
      onPointerEnter={() => setWarm(true)} onPointerDown={() => setWarm(true)} onFocus={() => setWarm(true)} onTouchStart={() => setWarm(true)}>
      <SignalCanvas scene={scene} className={styles.viz} getAnalyser={getAnalyser} playing={playing} center={[0.8, 0.42]} centerNarrow={[0.75, 0.36]} size={1.15} quality={0.9} onFrame={onFrame} />
      <LiveLayer song={songId(current.href)} active={((watching && started) || warm || (started && !muted)) && !error} started={started} audioRef={audioRef} onState={setLive} freeClock={freeRun ? freeAt : 0} getAnalyser={getAnalyser} />
      <div className={styles.scan} aria-hidden="true" />

      <header className={styles.top}>
        <span className={styles.mark}>HIDDEN<em>TRACK</em></span>
        <span className={styles.air} aria-hidden="true">{live === "live" && started ? "LIVE" : live === "warming" ? "WARMING UP" : playing ? "ON AIR" : loading ? "TUNING" : "STANDBY"}</span>
        <span className={styles.ch}><ChannelDial variant="embed" /></span>
        {hero ? (
          <button type="button" className={styles.out} aria-pressed={tv} onClick={() => { try { window.parent.postMessage({ type: "ht:tv", on: !tv }, window.location.origin); } catch { setTv(!tv); } }}>
            {tv ? "EXIT TV" : "\u25A3 TV"}
          </button>
        ) : (
          <a className={styles.out} href={LISTEN_URL} target="_blank" rel="noopener noreferrer">
            FULL LIST &#8599;
          </a>
        )}
      </header>

      <section className={styles.now} aria-live="polite">
        <span className={styles.num}>{String(index + 1).padStart(2, "0")}<i>/{String(tracks.length).padStart(2, "0")}</i></span>
        <h1 className={styles.title}>{current.title}</h1>
        <p className={styles.lane}>{status}{!started && !error ? <b> / free to use</b> : null}</p>
        {cc && started && !error && <LyricCue song={songId(current.href)} on={cc} audioRef={audioRef} freeClock={freeRun ? freeAt : 0} />}
      </section>

      {started && (muted || freeRun) && !error && (
        <button type="button" className={styles.sound} onClick={() => void unmute()} aria-label="Turn sound on">
          <span aria-hidden="true">&#128266;</span> TAP FOR SOUND
        </button>
      )}

      {!started && (
        <button type="button" className={styles.poster} onClick={() => void toggle()} aria-label={`Play ${current.title}`}>
          <span className={styles.posterIcon} aria-hidden="true">&#9654;</span>
          <span className={styles.posterText}>PRESS PLAY<small>STREAM IT / USE IT / CALL IT YOUR OWN</small></span>
        </button>
      )}

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
          style={{ ["--pct" as string]: `${pct}%` }}
        />
        <span>{fmt(duration)}</span>
      </div>

      <nav className={styles.controls} aria-label="Player controls">
        <button type="button" className={`${styles.ctl} ${shuffle ? styles.on : ""}`} aria-pressed={shuffle} onClick={() => setShuffle((s) => !s)}>
          SHUF
        </button>
        <button type="button" className={styles.ctl} onClick={() => next(-1)} aria-label="Previous cut">&#9664;&#9664;</button>
        <button type="button" className={`${styles.ctl} ${styles.main}`} onClick={() => void toggle()} aria-label={playing ? "Pause" : "Play"} aria-busy={loading || undefined}>
          {playing ? "\u275A\u275A" : "\u25B6"}
        </button>
        <button type="button" className={styles.ctl} onClick={() => next(1)} aria-label="Next cut">&#9654;&#9654;</button>
        <SessionClip rootRef={frameRef} audioRef={audioRef} getAnalyser={getAnalyser} title={current.title} lane={current.lane} song={songId(current.href)} />
        <a className={styles.ctl} href={current.href} target="_blank" rel="noopener noreferrer" aria-label={`${current.title} on Suno`}>
          SUNO
        </a>
      </nav>

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="none"
        onPlay={() => setPlaying(true)}
        onPlaying={() => setLoading(false)}
        onWaiting={() => setLoading(true)}
        onPause={() => { setPlaying(false); setLoading(false); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => next(1)}
        onError={onError}
      />
    </main>
  );
}
