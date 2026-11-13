"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/player/PlayerProvider";
import SignalCanvas from "@/components/viz/SignalCanvas";
import LiveLayer, { type LiveState, type LocalSong } from "@/app/embed/LiveLayer";
import { songId, indexForSlug } from "@/lib/fresh-cuts";
import { ensureAudible, ensureRunningGraph, graphIsLive } from "@/lib/audio-graph";
import type { Signal } from "@/lib/signal-engine";
import { hotIndexes, orderByRecency, pickWeighted } from "@/lib/weighted-pick";
import s from "./home-stage.module.css";

// Homepage Lantern Slide: its own full-bleed stage (not the X card). Live frames + CUTLIGHT motion fill the screen,
// the dock is the one audio source, and "Play my folder" swaps in the listener's own files (audio never leaves the device).

const AUDIO = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|webm)$/i;

type Item = { file: File; path: string; title: string; artist: string; comment: string; genre: string };
function seeds(it: Item): string[] {
  const raw = [it.comment, it.genre].filter(Boolean).join(", ");
  const parts = raw.split(/[,;|\n]+/).map((x) => x.replace(/https?:\S+/g, "").replace(/\b(made with suno|suno\.com|bpm)\b/gi, "").trim()).filter((x) => x.length >= 3 && x.length <= 80);
  const uniq = [...new Set(parts.map((x) => x.toLowerCase()))].slice(0, 10);
  const subject = it.title ? [`${it.title}, as a place`, `${it.title}, as a creature`] : [];
  return [...subject, ...uniq.map((x) => `${x} world`)].slice(0, 24);
}

const skin = { live: s.live, dream: s.dream, chips: s.chips, dreamNote: s.note, toast: s.toast, steer: s.steer, retry: s.retry };

export default function HomeStage() {
  const { tracks, index, playing, load, toggle, getAnalyser, audioRef, cue, pause, step, shuffle, setShuffle, queue } = usePlayer();
  const rootRef = useRef<HTMLElement>(null);
  const [hero, setHero] = useState<number | null>(null);
  const [mounted, setMounted] = useState(0); // performance.now() at mount: timeline clock before anyone presses play
  const [everPlayed, setEverPlayed] = useState(false);
  const [live, setLive] = useState<LiveState>("off");
  const [watching, setWatching] = useState(false);
  const [tv, setTv] = useState(false);
  const tvRef = useRef(false);
  useEffect(() => { tvRef.current = tv; }, [tv]);
  const [idle, setIdle] = useState(false);
  const [dockH, setDockH] = useState(0);

  // folder mode
  const [mode, setMode] = useState<"site" | "folder">("site");
  const [sheet, setSheet] = useState(false);
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [fi, setFi] = useState(-1);
  const [local, setLocal] = useState<LocalSong | null>(null);
  const [fStatus, setFStatus] = useState("");
  const [fPlaying, setFPlaying] = useState(false);
  const [dirOk, setDirOk] = useState(true);
  const fAudio = useRef<HTMLAudioElement>(null);
  const fCtx = useRef<AudioContext | null>(null);
  const fAn = useRef<AnalyserNode | null>(null);
  const fWired = useRef(false);
  const worker = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const cache = useRef(new Map<string, LocalSong>());
  const seq = useRef(0);

  const hot = useMemo(() => hotIndexes(tracks), [tracks]);

  // Opening cut: ?song= / ?t= (slug or Suno id) wins. Otherwise weighted recency
  // inside the high-energy pool, so a new hard cut lands much more often than a deep cut.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let i = indexForSlug(q.get("song") ?? q.get("t"));
    if (i < 0) { const id = q.get("song"); if (id) i = tracks.findIndex((t) => songId(t.href) === id); }
    if (i < 0) i = pickWeighted(tracks, { candidates: hot.length ? hot : undefined });
    const t = setTimeout(() => {
      setHero(i); cue(i); setMounted(performance.now());
      if (q.get("tv") === "1") setTv(true);
      setDirOk("webkitdirectory" in document.createElement("input"));
    }, 0);
    return () => clearTimeout(t);
  }, [tracks, hot, cue]);

  useEffect(() => { if (playing && !everPlayed) { const t = setTimeout(() => setEverPlayed(true), 0); return () => clearTimeout(t); } }, [playing, everPlayed]);

  const siteIdx = index ?? hero ?? 0;
  const track = tracks[siteIdx];

  // only hold a GPU slot while the stage is on screen in a visible tab (or in TV)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let inView = false;
    const update = () => setWatching(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting && e.intersectionRatio >= 0.3; update(); }, { threshold: [0, 0.3, 1] });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  // ---------- TV ----------
  const setTvMode = useCallback((on: boolean) => {
    setTv(on);
    try {
      if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
      if (!on && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    } catch { /* ignore */ }
    if (on && mode === "site" && !playing && hot.length) {
      const rest = orderByRecency(tracks, hot.filter((i) => i !== siteIdx));
      const first = hot.includes(siteIdx) ? siteIdx : rest[0];
      void load(first, [first, ...rest.filter((x) => x !== first)]);
    }
  }, [mode, playing, hot, siteIdx, load, tracks]);
  useEffect(() => {
    const onDockTv = () => setTvMode(!tvRef.current);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && tvRef.current) setTvMode(false); };
    const onFs = () => { if (!document.fullscreenElement && tvRef.current) setTvMode(false); };
    window.addEventListener("ht:tv", onDockTv); window.addEventListener("keydown", onKey); document.addEventListener("fullscreenchange", onFs);
    return () => { window.removeEventListener("ht:tv", onDockTv); window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); };
  }, [setTvMode]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-hero-tv-on", tv);
    if (!tv) { const t = setTimeout(() => setIdle(false), 0); return () => { clearTimeout(t); document.documentElement.removeAttribute("data-hero-tv-on"); }; }
    let timer = setTimeout(() => setIdle(true), 3000);
    const wake = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 3000); };
    window.addEventListener("pointermove", wake); window.addEventListener("pointerdown", wake); window.addEventListener("keydown", wake);
    return () => { clearTimeout(timer); window.removeEventListener("pointermove", wake); window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); document.documentElement.removeAttribute("data-hero-tv-on"); };
  }, [tv]);
  useEffect(() => {
    if (!tv) return;
    const dock = document.querySelector<HTMLElement>('[role="region"][aria-label="Hidden Track player"]');
    if (!dock) return;
    const ro = new ResizeObserver(() => setDockH(dock.offsetHeight));
    ro.observe(dock);
    return () => ro.disconnect();
  }, [tv]);

  // ---------- folder ----------
  const fGetAnalyser = useCallback(() => (graphIsLive(fCtx.current, fAn.current) ? fAn.current : null), []);
  useEffect(() => () => { worker.current?.terminate(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const onFiles = useCallback(async (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list).filter((x) => AUDIO.test(x.name) || x.type.startsWith("audio/"));
    if (!files.length) { setFStatus("No audio files there. Try MP3, M4A, WAV, FLAC or OGG."); setSheet(true); return; }
    files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
    const base = files.slice(0, 500).map((file) => ({ file, path: file.webkitRelativePath || file.name, title: file.name.replace(/\.[^.]+$/, ""), artist: "", comment: "", genre: "" }));
    setItems(base); setMode("folder"); setSheet(false); setFStatus(`${base.length} tracks. Reading tags on this device...`);
    try {
      const { parseBlob } = await import("music-metadata");
      const out = [...base];
      for (let i = 0; i < out.length; i++) {
        try {
          const m = await parseBlob(out[i].file, { skipCovers: true, duration: false });
          const c = m.common;
          const extra = Object.values(m.native).flat().filter((t) => /^(TXXX:(comment|description)|DESCRIPTION|COMMENT|desc|©cmt)$/i.test(t.id)).map((t) => (typeof t.value === "string" ? t.value : ""));
          const comment = [...(c.comment ?? []).map((x) => (typeof x === "string" ? x : x?.text ?? "")), ...extra].filter(Boolean).filter((v, k, arr) => arr.indexOf(v) === k).join(", ");
          out[i] = { ...out[i], title: c.title || out[i].title, artist: c.artist || "", comment: comment.slice(0, 600), genre: (c.genre ?? []).join(", ").slice(0, 120) };
        } catch { /* untagged: keep the filename */ }
        if (i % 20 === 19 || i === out.length - 1) setItems([...out]);
      }
      setFStatus(`${out.length} tracks ready. Your audio stays on this device.`);
    } catch { setFStatus(`${base.length} tracks ready.`); }
  }, []);

  const analyze = useCallback(async (it: Item): Promise<LocalSong> => {
    const key = `${it.path}:${it.file.size}:${it.file.lastModified}`;
    const hit = cache.current.get(key); if (hit) return hit;
    const ctx = fCtx.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    fCtx.current = ctx;
    const buf = await ctx.decodeAudioData(await it.file.arrayBuffer());
    const ch = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c).slice());
    const w = (worker.current ??= new Worker(new URL("../../lib/lantern/beat.worker.ts", import.meta.url), { type: "module" }));
    const id = ++seq.current;
    const tl = await new Promise<Record<string, unknown>>((res, rej) => {
      const on = (e: MessageEvent) => { if (e.data?.id !== id) return; w.removeEventListener("message", on); if (e.data.error) rej(new Error(e.data.error)); else res(e.data.tl); };
      w.addEventListener("message", on);
      w.postMessage({ id, sr: buf.sampleRate, ch }, ch.map((x) => x.buffer));
    });
    const song: LocalSong = { key: `local-${id}`, tl, scenes: seeds(it), lane: (it.genre || it.comment.split(",")[0] || "your folder").slice(0, 60), hook: it.title.slice(0, 200) };
    cache.current.set(key, song);
    return song;
  }, []);

  const playLocal = useCallback(async (i: number) => {
    const a = fAudio.current, it = items[i];
    if (!a || !it) return;
    pause();
    setFi(i); setLocal(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(it.file);
    a.src = urlRef.current;
    await ensureRunningGraph(a, { ctxRef: fCtx, analyserRef: fAn, wiredRef: fWired });
    ensureAudible(a);
    try { await a.play(); } catch { setFPlaying(false); }
    setFStatus("Mapping the beat on this device...");
    try {
      const sg = await analyze(it);
      if (fAudio.current?.src !== urlRef.current) return;
      setLocal(sg);
      const tl = sg.tl as { bpm: number; sections: unknown[] };
      setFStatus(`${Math.round(tl.bpm)} BPM / ${tl.sections.length} sections / audio stays on this device`);
    } catch { setFStatus("Couldn't map this file's beat; the visuals still ride it."); }
  }, [items, analyze, pause]);

  const fToggle = async () => {
    const a = fAudio.current; if (!a) return;
    if (fi < 0) return void playLocal(0);
    await ensureRunningGraph(a, { ctxRef: fCtx, analyserRef: fAn, wiredRef: fWired });
    if (a.paused) { pause(); await a.play().catch(() => {}); } else a.pause();
  };
  const fNext = (d: number) => { if (items.length) void playLocal((Math.max(fi, 0) + d + items.length) % items.length); };
  const leaveFolder = () => { fAudio.current?.pause(); setMode("site"); setLocal(null); setFi(-1); };
  // the dock starts playing a Hidden Track cut: folder audio steps aside
  useEffect(() => { if (playing && mode === "folder" && fAudio.current && !fAudio.current.paused) fAudio.current.pause(); }, [playing, mode]);

  const folder = mode === "folder";
  const fItem = items[fi];

  // the title breathes with the bass
  const onFrame = useCallback((sig: Signal) => {
    const el = rootRef.current; if (!el) return;
    el.style.setProperty("--bass", String(Math.round(sig.bass * 40) / 40));
    el.style.setProperty("--hit", String(Math.round(sig.transient * 10) / 10));
  }, []);

  // one shared player: the hero transport drives the dock (same track, queue, position, shuffle)
  const sitePlay = () => void (index === null ? load(siteIdx) : toggle());
  // what the shared player will actually play next (its queue, else the list order)
  const upNext = useMemo(() => {
    const order = queue && queue.includes(siteIdx) ? queue : tracks.map((_, i) => i);
    const at = order.indexOf(siteIdx);
    const out: number[] = [];
    for (let k = 1; out.length < 4 && k < order.length; k++) out.push(order[(at + k) % order.length]);
    return out;
  }, [queue, tracks, siteIdx]);

  const onAir = live === "live" ? "LIVE" : live === "warming" ? "WARMING UP" : (folder ? fPlaying : playing) ? "ON AIR" : "TUNING IN";
  const anyPlaying = folder ? fPlaying : playing;
  const ready = hero !== null && mounted > 0;

  return (
    <section ref={rootRef} className={s.stage} data-hero-tv data-tv={tv || undefined} data-idle={(tv && idle) || undefined} data-live={live === "live" || undefined} data-folder={folder || undefined} data-drag={drag || undefined}
      style={dockH ? ({ ["--ht-dock-h" as string]: `${dockH}px` }) : undefined} aria-label="Lantern Slide: live visuals painted to the beat"
      onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void onFiles(Array.from(e.dataTransfer.files)); }}>
      <SignalCanvas className={s.under} getAnalyser={folder ? fGetAnalyser : getAnalyser} playing={anyPlaying} center={[0.72, 0.42]} centerNarrow={[0.6, 0.34]} size={1.3} quality={0.85} onFrame={onFrame} />
      {ready && !folder && (
        <LiveLayer song={songId(track.href)} active={watching || tv} started audioRef={audioRef} onState={setLive}
          freeClock={everPlayed ? 0 : mounted} getAnalyser={getAnalyser} classes={skin} />
      )}
      {ready && folder && (
        <LiveLayer song={local?.key ?? ""} local={local} active={!!local && (watching || tv)} started audioRef={fAudio} onState={setLive} getAnalyser={fGetAnalyser} classes={skin} />
      )}
      <div className={s.grain} aria-hidden="true" />

      <div className={s.top}>
        <span className={s.kicker}><b data-on={live === "live" || undefined}>{onAir}</b> LANTERN SLIDE / PAINTED LIVE TO THE BEAT</span>
      </div>

      <div className={s.now} aria-live="polite">
        <span className={s.num}>{folder ? `YOUR FOLDER / ${String(fi + 1).padStart(2, "0")} OF ${String(items.length).padStart(2, "0")}` : `CUT ${String(siteIdx + 1).padStart(2, "0")} OF ${tracks.length}`}</span>
        <h1 className={s.title}>{folder ? fItem?.title ?? "Your folder" : track?.title}</h1>
        <p className={s.lane}>{folder ? (fItem?.artist ? `${fItem.artist} / ` : "") + fStatus : track?.lane}</p>
      </div>

      {!anyPlaying && ready && (
        <button type="button" className={s.play} onClick={() => (folder ? void fToggle() : sitePlay())} aria-label={`Play ${folder ? fItem?.title ?? "your folder" : track?.title}`}>
          <span aria-hidden="true">&#9654;</span><em>PRESS PLAY</em>
        </button>
      )}

      <div className={s.actions}>
        {folder ? (
          <>
            <button type="button" className={s.btn} onClick={() => fNext(-1)} aria-label="Previous track">&#9664;&#9664;</button>
            <button type="button" className={`${s.btn} ${s.main}`} onClick={() => void fToggle()} aria-label={fPlaying ? "Pause" : "Play"}>{fPlaying ? "\u275A\u275A" : "\u25B6"}</button>
            <button type="button" className={s.btn} onClick={() => fNext(1)} aria-label="Next track">&#9654;&#9654;</button>
            <button type="button" className={s.btn} onClick={leaveFolder}>HIDDEN TRACK</button>
          </>
        ) : (
          <>
            <button type="button" className={s.btn} onClick={() => step(-1)} aria-label="Previous cut">&#9664;&#9664;</button>
            <button type="button" className={`${s.btn} ${s.main}`} onClick={sitePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? "\u275A\u275A" : "\u25B6"}</button>
            <button type="button" className={s.btn} onClick={() => step(1)} aria-label="Next cut">&#9654;&#9654;</button>
            <button type="button" className={`${s.btn} ${s.shuf}`} aria-pressed={shuffle} onClick={() => setShuffle(!shuffle)} title={shuffle ? "Shuffle on" : "Shuffle off"}>SHUF</button>
            <button type="button" className={`${s.btn} ${s.folderBtn}`} onClick={() => setSheet(true)}>&#9776; PLAY MY FOLDER</button>
          </>
        )}
        <button type="button" className={`${s.btn} ${s.tvBtn}`} aria-pressed={tv} onClick={() => setTvMode(!tv)}>{tv ? "EXIT TV" : "\u25A3 TV"}</button>
      </div>

      {folder ? (
        items.length > 0 && (
          <ol className={s.rail} aria-label="Your tracks">
            {items.map((it, i) => (
              <li key={it.path}><button type="button" aria-current={i === fi} onClick={() => void playLocal(i)}><i>{String(i + 1).padStart(2, "0")}</i><span>{it.title}</span></button></li>
            ))}
          </ol>
        )
      ) : (
        <ol className={s.rail} aria-label="Up next">
          <li className={s.railHead}>{shuffle ? "UP NEXT (SHUFFLE IS ON)" : "UP NEXT"}</li>
          {upNext.map((i) => (
            <li key={i}><button type="button" onClick={() => void load(i)}><i>{String(i + 1).padStart(2, "0")}</i><span>{tracks[i].title}</span></button></li>
          ))}
        </ol>
      )}

      {(sheet || drag) && (
        <div className={s.sheet} role="dialog" aria-label="Play my folder">
          <h2>{drag ? "Drop it here" : "Play my folder"}</h2>
          <p>Your songs play straight from your disk, painted live by the same visualizer. Nothing uploads: only a beat map and the tags leave the page.</p>
          {!drag && (
            <div className={s.sheetBtns}>
              {dirOk && (
                <label className={`${s.btn} ${s.main}`}>CHOOSE FOLDER
                  <input type="file" multiple onChange={(e) => void onFiles(e.target.files)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} aria-label="Choose a music folder" />
                </label>
              )}
              <label className={`${s.btn} ${dirOk ? "" : s.main}`}>PICK FILES
                <input type="file" multiple accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus" onChange={(e) => void onFiles(e.target.files)} aria-label="Choose music files" />
              </label>
              <button type="button" className={s.btn} onClick={() => setSheet(false)}>CLOSE</button>
            </div>
          )}
          {!drag && <small>or drag files onto the visuals</small>}
          {fStatus && !drag && <small>{fStatus}</small>}
        </div>
      )}

      <audio ref={fAudio} preload="auto" onPlay={() => setFPlaying(true)} onPause={() => setFPlaying(false)} onEnded={() => fNext(1)} />
    </section>
  );
}
