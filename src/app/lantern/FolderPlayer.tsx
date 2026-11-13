"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../embed/embed.module.css";
import f from "./folder.module.css";
import LiveLayer, { type LiveState, type LocalSong } from "../embed/LiveLayer";
import SessionClip from "../embed/SessionClip";
import { ensureAudible, ensureRunningGraph, graphIsLive } from "@/lib/audio-graph";
import { fmt } from "@/lib/fresh-cuts";

// Play my folder: the listener's own files play from disk inside the cathedral. Tags (ID3/Vorbis/MP4 via music-metadata, MIT)
// and a beat map (Web Worker, on-device) are the only things sent to the GPU; the audio is never uploaded.

type Item = { file: File; path: string; title: string; artist: string; comment: string; genre: string };
const AUDIO = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm)$/i;

// Suno puts the style prompt in the comment: split it into scene seeds the frame server can dream
function seeds(it: Item): string[] {
  const raw = [it.comment, it.genre].filter(Boolean).join(", ");
  const parts = raw.split(/[,;|\n]+/).map((s) => s.replace(/https?:\S+/g, "").replace(/\b(made with suno|suno\.com|bpm)\b/gi, "").trim()).filter((s) => s.length >= 3 && s.length <= 80);
  const uniq = [...new Set(parts.map((s) => s.toLowerCase()))].slice(0, 10);
  const subject = it.title ? [`${it.title}, as a place`, `${it.title}, as a creature`] : [];
  return [...subject, ...uniq.map((s) => `${s} world`)].slice(0, 24);
}

export default function FolderPlayer() {
  const frameRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wiredRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(-1);
  const [local, setLocal] = useState<LocalSong | null>(null);
  const [status, setStatus] = useState("");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [live, setLive] = useState<LiveState>("off");
  const [dirOk, setDirOk] = useState(true);
  const cache = useRef(new Map<string, LocalSong>());
  const seqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDirOk("webkitdirectory" in document.createElement("input")), 0);
    return () => { clearTimeout(t); workerRef.current?.terminate(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, []);

  const getAnalyser = useCallback(() => (graphIsLive(ctxRef.current, analyserRef.current) ? analyserRef.current : null), []);

  const onFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((x) => AUDIO.test(x.name) || x.type.startsWith("audio/"));
    if (!files.length) { setStatus("No audio files in that folder."); return; }
    files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
    const base = files.slice(0, 500).map((file) => ({ file, path: file.webkitRelativePath || file.name, title: file.name.replace(/\.[^.]+$/, ""), artist: "", comment: "", genre: "" }));
    setItems(base); setStatus(`${base.length} tracks. Reading tags on this device...`);
    try {
      const { parseBlob } = await import("music-metadata");
      const out = [...base];
      for (let i = 0; i < out.length; i++) {
        try {
          const m = await parseBlob(out[i].file, { skipCovers: true, duration: false });
          const c = m.common;
          // COMM (common.comment), plus TXXX:comment / Vorbis DESCRIPTION / iTunes desc, where taggers and Suno exports differ
          const extra = Object.values(m.native).flat().filter((t) => /^(TXXX:(comment|description)|DESCRIPTION|COMMENT|desc|©cmt)$/i.test(t.id)).map((t) => (typeof t.value === "string" ? t.value : ""));
          const comment = [...(c.comment ?? []).map((x) => (typeof x === "string" ? x : x?.text ?? "")), ...extra].filter(Boolean).filter((v, k, arr) => arr.indexOf(v) === k).join(", ");
          out[i] = { ...out[i], title: c.title || out[i].title, artist: c.artist || "", comment: comment.slice(0, 600), genre: (c.genre ?? []).join(", ").slice(0, 120) };
        } catch { /* untagged: keep the filename */ }
        if (i % 20 === 19 || i === out.length - 1) setItems([...out]);
      }
      setStatus(`${out.length} tracks ready. Tap one, or press play.`);
    } catch { setStatus(`${base.length} tracks (tags unavailable).`); }
  }, []);

  const analyze = useCallback(async (it: Item): Promise<LocalSong> => {
    const key = `${it.path}:${it.file.size}:${it.file.lastModified}`;
    const hit = cache.current.get(key); if (hit) return hit;
    const ctx = ctxRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    ctxRef.current = ctx;
    const buf = await ctx.decodeAudioData(await it.file.arrayBuffer());
    const ch = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c).slice());
    const w = (workerRef.current ??= new Worker(new URL("../../lib/lantern/beat.worker.ts", import.meta.url), { type: "module" }));
    const id = ++seqRef.current;
    const tl = await new Promise<Record<string, unknown>>((res, rej) => {
      const on = (e: MessageEvent) => { if (e.data?.id !== id) return; w.removeEventListener("message", on); if (e.data.error) rej(new Error(e.data.error)); else res(e.data.tl); };
      w.addEventListener("message", on);
      w.postMessage({ id, sr: buf.sampleRate, ch }, ch.map((x) => x.buffer));
    });
    const song: LocalSong = { key: `local-${id}`, tl, scenes: seeds(it), lane: (it.genre || it.comment.split(",")[0] || "your folder").slice(0, 60), hook: it.title.slice(0, 200) };
    cache.current.set(key, song);
    return song;
  }, []);

  const play = useCallback(async (i: number) => {
    const a = audioRef.current, it = items[i];
    if (!a || !it) return;
    setIdx(i); setLocal(null); setTime(0); setDuration(0);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(it.file);
    a.src = urlRef.current;
    await ensureRunningGraph(a, { ctxRef, analyserRef, wiredRef });
    ensureAudible(a);
    try { await a.play(); } catch { setPlaying(false); }
    setStatus("Mapping the beat on this device...");
    const t0 = performance.now();
    try {
      const s = await analyze(it);
      if (audioRef.current?.src !== urlRef.current) return; // skipped meanwhile
      setLocal(s);
      const tl = s.tl as { bpm: number; sections: unknown[] };
      setStatus(`${Math.round(tl.bpm)} BPM, ${tl.sections.length} sections, mapped in ${((performance.now() - t0) / 1000).toFixed(1)}s. Audio stays here.`);
    } catch { setStatus("Couldn't map this file; the cathedral still dances to it."); }
  }, [items, analyze]);

  const toggle = async () => {
    const a = audioRef.current; if (!a) return;
    if (idx < 0) return void play(0);
    await ensureRunningGraph(a, { ctxRef, analyserRef, wiredRef });
    if (a.paused) await a.play().catch(() => {}); else a.pause();
  };
  const next = (d: number) => { if (items.length) void play((idx + d + items.length) % items.length); };
  const cur = items[idx];
  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <main ref={frameRef} className={styles.frame} data-state={playing ? "playing" : idx >= 0 ? "paused" : "idle"} data-live={live === "live" || undefined}>
      <div className={styles.viz} aria-hidden="true" />
      <LiveLayer song={local?.key ?? ""} local={local} active={!!local} started={idx >= 0} audioRef={audioRef} onState={setLive} getAnalyser={getAnalyser} />
      <div className={styles.scan} aria-hidden="true" />

      <header className={styles.top}>
        <span className={styles.mark}>HIDDEN<em>TRACK</em></span>
        <span className={styles.air} aria-hidden="true">{live === "live" ? "LIVE" : live === "warming" ? "WARMING UP" : playing ? "ON AIR" : "STANDBY"}</span>
        <a className={styles.out} href="/listen" target="_blank" rel="noopener noreferrer">FRESH CUTS &#8599;</a>
      </header>
      <span className={f.privacy}>Your audio never leaves this device</span>

      {idx < 0 && (
        <div className={f.pick}>
          <h2>Play my folder</h2>
          <p>Your music plays from your disk inside the cathedral. Only a beat map and the tags (title, genre, the Suno style prompt in the comment) go to the GPU that dreams the windows.</p>
          <div className={f.btns}>
            {dirOk && (
              <label className={f.btn}>CHOOSE FOLDER
                <input type="file" multiple onChange={(e) => void onFiles(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} aria-label="Choose a music folder" />
              </label>
            )}
            <label className={`${f.btn} ${dirOk ? f.alt : ""}`}>PICK FILES
              <input type="file" multiple accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus" onChange={(e) => void onFiles(e.target.files)} aria-label="Choose music files" />
            </label>
            {items.length > 0 && <button type="button" className={f.btn} onClick={() => void play(0)}>PLAY</button>}
          </div>
          {status && <p>{status}</p>}
        </div>
      )}

      {idx >= 0 && (
        <section className={styles.now} aria-live="polite">
          <span className={styles.num}>{String(idx + 1).padStart(2, "0")}<i>/{String(items.length).padStart(2, "0")}</i></span>
          <h1 className={styles.title}>{cur?.title}</h1>
          <p className={styles.lane}>{cur?.artist ? `${cur.artist} / ` : ""}{status}</p>
        </section>
      )}

      {items.length > 0 && idx >= 0 && (
        <ol className={f.list} aria-label="Your tracks">
          {items.map((it, i) => (
            <li key={it.path}><button type="button" aria-current={i === idx} onClick={() => void play(i)}><i>{String(i + 1).padStart(2, "0")}</i><span>{it.title}</span><i>{it.genre.split(",")[0]}</i></button></li>
          ))}
        </ol>
      )}

      <div className={styles.scrub}>
        <span>{fmt(time)}</span>
        <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration || 0)} aria-label="Seek" disabled={!duration}
          onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = Number(e.target.value); }} style={{ ["--pct" as string]: `${pct}%` }} />
        <span>{fmt(duration)}</span>
      </div>
      <nav className={styles.controls} aria-label="Player controls">
        <button type="button" className={styles.ctl} onClick={() => next(-1)} aria-label="Previous track" disabled={!items.length}>&#9664;&#9664;</button>
        <button type="button" className={`${styles.ctl} ${styles.main}`} onClick={() => void toggle()} aria-label={playing ? "Pause" : "Play"} disabled={!items.length}>{playing ? "\u275A\u275A" : "\u25B6"}</button>
        <button type="button" className={styles.ctl} onClick={() => next(1)} aria-label="Next track" disabled={!items.length}>&#9654;&#9654;</button>
        <SessionClip rootRef={frameRef} audioRef={audioRef} getAnalyser={getAnalyser} title={cur?.title ?? "My folder"} lane={cur?.genre || "Play my folder"} song="" />
      </nav>
      <audio ref={audioRef} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} onEnded={() => next(1)} />
    </main>
  );
}
