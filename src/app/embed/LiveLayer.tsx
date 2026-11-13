"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import styles from "./embed.module.css";
import { CathedralStage, bandsFrom } from "@/lib/lantern/stage";

// Lantern Slide LIVE: frames dreamed on a GPU in real time, steered by the song and the listener.
// Sync rides the audio element's playhead (no analyser needed, so it works inside X's player).
// Any failure (not configured, PC off, full, dropped) quietly hands the stage back to SignalCanvas.

export type LiveState = "off" | "connecting" | "warming" | "live";

type Props = {
  song: string;
  active: boolean; // connect now (hover, focus, touch or play)
  started: boolean; // playback (muted autoplay or play) has begun
  freeClock?: number; // performance.now() origin when media autoplay was blocked: drive frames off this clock
  audioRef: RefObject<HTMLAudioElement | null>;
  onState: (s: LiveState) => void;
  getAnalyser?: () => AnalyserNode | null; // live bands for the cathedral when the Web Audio graph is running
  local?: LocalSong | null; // Play my folder: on-device song map + tags (the audio itself never leaves the device)
  classes?: Partial<Record<"live" | "dream" | "chips" | "dreamNote" | "toast" | "steer" | "retry", string>>; // host page skin (homepage)
};

export type LocalSong = { key: string; tl: Record<string, unknown>; scenes: string[]; lane: string; hook: string };

const FADE_MS = 140;
const CHIP_BANK: Record<string, string[]> = {
  peak: ["supernova rave", "lava city", "laser storm", "fireworks ocean", "neon dragon", "lightning cathedral"],
  drive: ["neon tiger", "night highway", "chrome horses", "city of mirrors", "rocket train", "electric desert"],
  build: ["storm rising", "galaxy forming", "glass tsunami", "aurora tunnel", "crystal volcano", "rising moon"],
  intro_or_break: ["jellyfish galaxy", "underwater rave", "foggy lighthouse", "paper lanterns", "snow garden", "koi nebula"],
};
const ACK_MS = 3000;
const STALL_MS = 5000;
const MAX_RECONNECTS = 4;
const WARM_WINDOW_MS = 90_000; // patience for a cold cloud GPU before handing the stage back to the shader
const WARM_NOTE_MS = 2500; // still connecting after this long: show the calm "warming up" state
const WAKE_EVERY_MS = 60_000;
const WAKE_KEY = "ht:lanternWake";
// Early wake: nudge the cloud GPU awake when a live-capable page loads (or a track is picked), before anyone presses play.
// Fire and forget, at most once a minute across tabs and frames, only from a visible tab.
function wakeLantern() {
  try {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    const now = Date.now();
    let last = 0;
    try { last = Number(localStorage.getItem(WAKE_KEY)) || 0; } catch { /* storage blocked */ }
    if (now - last < WAKE_EVERY_MS && now >= last) return;
    try { localStorage.setItem(WAKE_KEY, String(now)); } catch { /* storage blocked */ }
    void fetch("/api/lantern/wake", { cache: "no-store", keepalive: true }).catch(() => {});
  } catch { /* never block the page */ }
}
// rotate through the section's bank: after a chip is used, the row moves on past it
const pickChips = (label: string, used?: string) => {
  const bank = CHIP_BANK[label] ?? CHIP_BANK.drive;
  const k = used ? bank.indexOf(used) + 1 : 0;
  return [...bank.slice(k), ...bank.slice(0, k)].filter((c) => c !== used).slice(0, 4);
};

export default function LiveLayer({ song, active, started, audioRef, onState, freeClock = 0, getAnalyser, local = null, classes }: Props) {
  const cx = { ...styles, ...classes } as Record<string, string>;
  const localRef = useRef(local);
  useEffect(() => { localRef.current = local; }, [local]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [live, setLive] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [steering, setSteering] = useState<string | null>(null);
  const [steerLeft, setSteerLeft] = useState(0); // seconds the active steer still holds (from the frame stream)
  const [toast, setToast] = useState<string | null>(null);
  const [retry, setRetry] = useState<string | null>(null);
  const [, setLabel] = useState("intro_or_break");
  const [chips, setChips] = useState<string[]>(() => CHIP_BANK.intro_or_break.slice(0, 4));
  const [nonce, setNonce] = useState(0);
  const pending = useRef<{ id: string; text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const reconnects = useRef(0);
  const lastFrame = useRef(0);
  const seq = useRef(0);
  const labelRef = useRef("intro_or_break");
  const startedRef = useRef(started);
  const clockRef = useRef(freeClock);
  useEffect(() => { clockRef.current = freeClock; }, [freeClock]);
  const parked = useRef(false);
  // Live stage (WebGL2), on from the first play. Default is flat: the live frames fill the card, blended at display rate.
  // The Astral Cathedral (layers + stained glass + portal) is opt-in with ?stage=cathedral.
  const stageRef = useRef<CathedralStage | null>(null);
  const hint = useRef({ e: 0, b: 0, k: 0, at: 0 });
  const analyserFn = useRef(getAnalyser);
  useEffect(() => { analyserFn.current = getAnalyser; }, [getAnalyser]);
  const [stageOn, setStageOn] = useState(false);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !started) return;
    const cathedral = typeof location !== "undefined" && new URLSearchParams(location.search).get("stage") === "cathedral";
    const stage = CathedralStage.create(c, undefined, cathedral);
    if (!stage) return;
    stageRef.current = stage;
    const buf = { data: new Uint8Array(128) };
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      try { stage.render(bandsFrom(analyserFn.current?.() ?? null, buf, hint.current, performance.now())); } catch { /* keep going */ }
    };
    raf = requestAnimationFrame(loop);
    const t = setTimeout(() => setStageOn(true), 0);
    (c as HTMLCanvasElement & { __stage?: CathedralStage }).__stage = stage;
    return () => { clearTimeout(t); cancelAnimationFrame(raf); stageRef.current = null; stage.dispose(); setStageOn(false); };
  }, [started]);

  useEffect(() => { reconnects.current = 0; }, [song]);

  // wake the GPU on load, on track change and when the tab comes back (debounced in wakeLantern)
  useEffect(() => {
    wakeLantern();
    const onVis = () => { if (document.visibilityState === "visible") wakeLantern(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [song]);

  // pressing play after a parked pre-connect opens a fresh session right away
  useEffect(() => {
    startedRef.current = started;
    if (started && parked.current) {
      parked.current = false; reconnects.current = 0;
      const t = setTimeout(() => setNonce((n) => n + 1), 0);
      return () => clearTimeout(t);
    }
  }, [started]);

  useEffect(() => {
    if (!active || !song) return;
    let dead = false;
    let ws: WebSocket | null = null;
    let tick: ReturnType<typeof setInterval> | undefined;
    let raf = 0;
    let cur: ImageBitmap | null = null;
    let prev: ImageBitmap | null = null;
    let fadeStart = 0;
    const audio = audioRef.current;

    const set = (s: LiveState) => { if (!dead) { onState(s); setLive(s === "live"); } };
    const reconnect = () => {
      if (dead) return;
      dead = true; // this socket is finished
      ws?.close();
      if (!startedRef.current) { parked.current = true; onState("off"); setLive(false); return; } // pre-play session ended: reconnect on play
      if (reconnects.current < MAX_RECONNECTS) { reconnects.current += 1; setTimeout(() => setNonce((n) => n + 1), 1200); }
      else { onState("off"); setLive(false); }
    };
    let stall: ReturnType<typeof setInterval> | undefined;
    const send = () => {
      const a = audioRef.current;
      if (ws?.readyState !== WebSocket.OPEN || !a) return;
      const free = clockRef.current && a.paused;
      ws.send(JSON.stringify({ type: "tick", t: free ? (performance.now() - clockRef.current) / 1000 : a.currentTime, playing: free ? true : !a.paused }));
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      if (!c || !cur) return;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext("2d");
      if (!g) return;
      const cover = (img: ImageBitmap, alpha: number) => {
        const s = Math.max(w / img.width, h / img.height);
        g.globalAlpha = alpha;
        g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      };
      const k = Math.min(1, (performance.now() - fadeStart) / FADE_MS);
      if (prev && k < 1) cover(prev, 1);
      cover(cur, prev ? k : 1);
      g.globalAlpha = 1;
    };

    let warmNote: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      set("connecting");
      // a slow answer means the cloud GPU is booting: say so calmly instead of looking broken
      warmNote = setTimeout(() => set("warming"), WARM_NOTE_MS);
      try {
        // Cloud GPU may be cold: the session route answers reason:"warming" and we keep asking for up to WARM_WINDOW_MS
        // (network blips and gateway timeouts count as warming too). Only after that does the shader keep the stage.
        let s: { live?: boolean; ws?: string; reason?: string; retryMs?: number } = {};
        const until = Date.now() + WARM_WINDOW_MS;
        while (true) {
          try {
            const r = await fetch(localRef.current ? "/api/lantern/session?mode=local" : `/api/lantern/session?song=${encodeURIComponent(song)}`, { cache: "no-store" });
            s = (await r.json().catch(() => ({ reason: "warming" }))) as typeof s;
          } catch {
            s = { reason: "warming" };
          }
          if (dead) return;
          if (s.live && s.ws) break;
          if (s.reason !== "warming" && s.reason !== "rate") break;
          if (Date.now() >= until) break;
          await new Promise((res) => setTimeout(res, Math.min(8000, Math.max(1500, s.retryMs ?? 2500))));
          if (dead) return;
        }
        if (!s.live || !s.ws) { clearTimeout(warmNote); return set("off"); }
        ws = new WebSocket(s.ws);
        ws.binaryType = "blob";
        wsRef.current = ws;
        let started = false;
        ws.onopen = () => { send(); tick = setInterval(send, 400); };
        ws.onmessage = async (e) => {
          if (typeof e.data !== "string") {
            const bmp = await createImageBitmap(e.data as Blob);
            if (dead) return bmp.close();
            const st = stageRef.current;
            if (st) { st.push(bmp); bmp.close(); }
            else { prev?.close(); prev = cur; cur = bmp; fadeStart = performance.now(); }
            lastFrame.current = performance.now();
            if (!started) {
              started = true; reconnects.current = 0; clearTimeout(warmNote); set("live"); if (!stageRef.current) raf = requestAnimationFrame(draw);
              stall = setInterval(() => {
                const a = audioRef.current;
                if (a && (!a.paused || clockRef.current) && performance.now() - lastFrame.current > STALL_MS) reconnect();
              }, 1000);
            }
            return;
          }
          const m = JSON.parse(e.data) as { type: string; e?: number; b?: number; k?: number; ok?: boolean; reason?: string; text?: string; scene?: string; takeover?: boolean; label?: string; id?: string; wait?: number; steer?: string | null; steer_left?: number };
          if (m.type === "frame") {
            if (typeof m.e === "number") hint.current = { e: m.e, b: m.b ?? 0, k: m.k ?? 0, at: performance.now() };
            setSteering(m.steer ?? (m.takeover && m.scene ? m.scene : null));
            setSteerLeft(m.steer ? Math.ceil(m.steer_left ?? 0) : 0);
            if (m.label && m.label !== labelRef.current) { // new section: fresh chips
              const next = m.label;
              labelRef.current = next; setLabel(next); setChips(pickChips(next));
            }
          } else if (m.type === "need_timeline") {
            const L = localRef.current;
            if (L && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "timeline", tl: L.tl, scenes: L.scenes.slice(0, 24), lane: L.lane.slice(0, 60), hook: L.hook.slice(0, 400) }));
          } else if (m.type === "busy") reconnect();
          else if (m.type === "bye") { if (m.reason === "idle") reconnect(); else set("off"); }
          else if (m.type === "prompt") {
            const pend = pending.current;
            if (pend && (!m.id || m.id === pend.id)) { clearTimeout(pend.timer); pending.current = null; }
            setNote(null);
            if (m.ok) { setToast(null); setRetry(null); if (m.text) setSteering(m.text); }
            else setToast(
              m.reason === "slow down" ? `One idea every 8 seconds. Try again in ${Math.ceil(m.wait ?? 8)}s.`
              : m.reason === "pg13" || m.reason === "pg" || m.reason === "not allowed" ? "Keep it PG-13. Try another idea."
              : m.reason === "blocked" ? "Can't make that one. Try another idea."
              : m.reason === "steering off" ? "Steering is paused right now."
              : "Try another idea");
          }
        };
        ws.onclose = () => { if (!dead) reconnect(); };
        ws.onerror = () => { if (!dead) reconnect(); };
      } catch {
        clearTimeout(warmNote);
        set("off");
      }
    })();

    const events = ["play", "pause", "seeked"] as const;
    events.forEach((ev) => audio?.addEventListener(ev, send));
    return () => {
      dead = true;
      clearTimeout(warmNote);
      events.forEach((ev) => audio?.removeEventListener(ev, send));
      clearInterval(tick);
      clearInterval(stall);
      cancelAnimationFrame(raf);
      ws?.close();
      wsRef.current = null;
      cur?.close(); prev?.close();
      stageRef.current?.clearDream();
      onState("off");
      setLive(false);
      setNote(null);
      setSteering(null);
      setSteerLeft(0);
      setToast(null);
    };
  }, [active, song, audioRef, onState, nonce]);


  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // No <form>: X loads the card in a sandboxed iframe without allow-forms, so form submits are blocked.
  const sendIdea = (raw: string) => {
    const ws = wsRef.current;
    const v = raw.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!v) return;
    if (ws?.readyState !== WebSocket.OPEN) { setToast("Reconnecting to the visuals..."); setRetry(v); setNonce((n) => n + 1); return; }
    if (pending.current) clearTimeout(pending.current.timer);
    seq.current += 1;
    const id = `p${seq.current}`;
    const timer = setTimeout(() => {
      pending.current = null;
      setNote(null);
      setToast("Didn't reach the visuals.");
      setRetry(v);
      if (wsRef.current === ws) { reconnects.current = 0; ws?.close(); }
    }, ACK_MS);
    pending.current = { id, text: v, timer };
    ws.send(JSON.stringify({ type: "prompt", id, text: v }));
    setNote(`Sending: ${v}`);
    setToast(null);
    setRetry(null);
    setText("");
  };

  const sendChip = (c: string) => {
    sendIdea(c);
    setChips((cur) => [c, ...cur.filter((x) => x !== c)].slice(0, 4)); // lit chip stays in the row while it holds
  };
  const activeSteer = steering && steerLeft > 0 ? steering.toLowerCase() : null;
  const prevActive = useRef<string | null>(null);
  useEffect(() => { // steer ended: rotate the row past the chip that was used
    const was = prevActive.current;
    prevActive.current = activeSteer;
    if (was && !activeSteer) { const t = setTimeout(() => setChips(pickChips(labelRef.current, was)), 0); return () => clearTimeout(t); }
  }, [activeSteer]);

  return (
    <>
      <canvas ref={canvasRef} className={cx.live} data-on={live || stageOn || undefined} data-stage={stageOn || undefined} aria-hidden="true" />
      {live && started && (
        <div className={cx.dream} role="group" aria-label="Steer the live visuals" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
          <input
            value={text}
            maxLength={140}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); sendIdea(text); } }}
            onPointerDown={(e) => e.currentTarget.focus()}
            placeholder="Type anything..."
            aria-label="Steer the live visuals"
            enterKeyHint="send"
            autoComplete="off"
          />
          <button type="button" onClick={() => sendIdea(text)} aria-label="Send idea">GO</button>
          <div className={cx.chips}>
            {chips.map((c) => (
              <button key={c} type="button" data-chip data-active={activeSteer === c.toLowerCase() || undefined} aria-pressed={activeSteer === c.toLowerCase()} onClick={() => sendChip(c)}>
                {c}{activeSteer === c.toLowerCase() ? ` ${steerLeft}s` : ""}
              </button>
            ))}
          </div>
          {toast ? (
            <span className={`${cx.dreamNote} ${cx.toast}`} data-note role="alert">
              {toast}
              {retry && <button type="button" className={cx.retry} onClick={() => sendIdea(retry)}>RETRY</button>}
            </span>
          ) : steering ? (
            <span className={`${cx.dreamNote} ${cx.steer}`} data-note aria-live="polite"><b>STEERING:</b> {steering}{steerLeft > 0 ? ` · ${steerLeft}s` : ""}</span>
          ) : note ? (
            <span className={cx.dreamNote} data-note aria-live="polite">{note}</span>
          ) : null /* no ambient scene/lyric text over the visuals (Joe, 2026-10-21) */}
        </div>
      )}
    </>
  );
}
