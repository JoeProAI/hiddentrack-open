"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import styles from "./embed.module.css";
import type { CathedralStage } from "@/lib/lantern/stage";

// Save my session: records what's on the stage (Black Sun + cathedral + live frames + title) plus the audio, up to 30 s,
// entirely in the browser (MediaRecorder). Nothing is uploaded. Then Save (download / native share sheet) and Share to X
// (X intent with the card link; X intents can't carry a file, so the clip is attached by the listener).

const MAX_S = 30;
const CARD_URL = "https://hiddentrack.fm/listen/x";
// H.264 MP4 first (what X accepts for upload), then WebM (Firefox; X won't take it without converting)
const TYPES = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

type Props = {
  rootRef: RefObject<HTMLElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  getAnalyser: () => AnalyserNode | null;
  title: string;
  lane: string;
  song: string;
};

export default function SessionClip({ rootRef, audioRef, getAnalyser, title, lane, song }: Props) {
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [clip, setClip] = useState<{ url: string; file: File } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const meta = useRef({ title, lane });
  useEffect(() => { meta.current = { title, lane }; }, [title, lane]);
  useEffect(() => () => { stopRef.current?.(); }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  const start = useCallback(() => {
    const root = rootRef.current;
    if (!root || typeof MediaRecorder === "undefined") { setNote("Clips aren't supported in this browser."); return; }
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rect = root.getBoundingClientRect();
    const W = 1280, H = Math.round((1280 * rect.height) / Math.max(1, rect.width)) & ~1;
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const g = out.getContext("2d")!;
    const sx = W / rect.width, sy = H / rect.height;

    const compose = (stageCanvas?: HTMLCanvasElement) => {
      const r0 = root.getBoundingClientRect();
      g.fillStyle = "#090808"; g.fillRect(0, 0, W, H);
      for (const c of Array.from(root.querySelectorAll("canvas"))) {
        if (c === out) continue;
        const cs = getComputedStyle(c); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
        if (c.dataset.stage && c !== stageCanvas) continue; // WebGL canvas: only inside its own render task
        const r = c.getBoundingClientRect();
        try { g.globalAlpha = Number(cs.opacity); g.drawImage(c, (r.left - r0.left) * sx, (r.top - r0.top) * sy, r.width * sx, r.height * sy); } catch { /* tainted or lost */ }
      }
      g.globalAlpha = 1;
      // title card: bottom-left like the player, plus the link
      const grd = g.createLinearGradient(0, H * 0.55, 0, H); grd.addColorStop(0, "rgba(9,8,8,0)"); grd.addColorStop(1, "rgba(9,8,8,.85)");
      g.fillStyle = grd; g.fillRect(0, H * 0.55, W, H * 0.45);
      g.fillStyle = "#f3ecda"; g.font = `900 ${Math.round(H * 0.11)}px system-ui, sans-serif`; g.textBaseline = "alphabetic";
      g.fillText(meta.current.title.toUpperCase(), W * 0.035, H * 0.86, W * 0.7);
      g.font = `700 ${Math.round(H * 0.035)}px ui-monospace, monospace`; g.fillStyle = "rgba(243,236,218,.8)";
      g.fillText(meta.current.lane.toUpperCase(), W * 0.035, H * 0.93, W * 0.6);
      g.fillStyle = "#f5d90a"; g.textAlign = "right"; g.fillText("HIDDENTRACK.FM  /  LIVE CATHEDRAL", W * 0.965, H * 0.93); g.textAlign = "left";
      g.fillStyle = "#e8392b"; g.fillRect(W * 0.035, H * 0.05, H * 0.03, H * 0.03);
      g.fillStyle = "#f3ecda"; g.font = `900 ${Math.round(H * 0.045)}px system-ui, sans-serif`; g.fillText("HIDDEN TRACK", W * 0.035 + H * 0.05, H * 0.08);
    };

    const stageCanvas = root.querySelector<HTMLCanvasElement>("canvas[data-stage]");
    const stage = (stageCanvas as (HTMLCanvasElement & { __stage?: CathedralStage }) | null)?.__stage;
    let raf = 0;
    if (stage) stage.onRendered = (c) => compose(c);
    else { const loop = () => { raf = requestAnimationFrame(loop); compose(); }; loop(); }

    const stream = out.captureStream(30);
    // audio: tap the live Web Audio graph when it's running (never leaves the device), else the element's own stream
    let dest: MediaStreamAudioDestinationNode | null = null; let tap: AnalyserNode | null = null;
    try {
      tap = getAnalyser();
      if (tap) { dest = (tap.context as AudioContext).createMediaStreamDestination(); tap.connect(dest); dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
      else {
        const a = audioRef.current as (HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
        const s = a && !a.muted ? (a.captureStream?.() ?? a.mozCaptureStream?.()) : null;
        s?.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
    } catch { /* video-only clip */ }

    let mr: MediaRecorder;
    try { mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 5_000_000 } : undefined); }
    catch { setNote("Clips aren't supported in this browser."); if (stage) stage.onRendered = null; cancelAnimationFrame(raf); return; }
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const t0 = performance.now();
    const timer = setInterval(() => { const s = (performance.now() - t0) / 1000; setSecs(Math.floor(s)); if (s >= MAX_S) stop(); }, 250);
    let done = false;
    const stop = () => {
      if (done) return; done = true;
      clearInterval(timer); cancelAnimationFrame(raf); if (stage) stage.onRendered = null;
      try { if (tap && dest) tap.disconnect(dest); } catch { /* ignore */ }
      if (mr.state !== "inactive") mr.stop();
      setRec(false); stopRef.current = null;
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = (mr.mimeType || type || "video/webm").split(";")[0];
      if (!chunks.length) { setNote("Nothing recorded."); return; }
      const blob = new Blob(chunks, { type: mime });
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `hiddentrack-${meta.current.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "session"}.${ext}`, { type: mime });
      setClip({ url: URL.createObjectURL(blob), file });
      const used = mr.mimeType || type, h264 = /avc1|h264/i.test(used), aac = /mp4a/i.test(used);
      setNote(`${Math.round(blob.size / 1024)} KB ${ext.toUpperCase()}${h264 && aac ? " / ready for X" : h264 ? " / H.264 (Opus audio)" : " / WebM: X wants MP4, convert first"}`);
    };
    mr.start(1000);
    stopRef.current = stop;
    setClip(null); setNote(null); setSecs(0); setRec(true);
  }, [rootRef, audioRef, getAnalyser]);

  const save = async () => {
    if (!clip) return;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [clip.file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [clip.file], title: meta.current.title, text: `${meta.current.title} / Hidden Track live cathedral`, url: CARD_URL }); return; } catch { /* fall through to download */ }
    }
    const a = document.createElement("a"); a.href = clip.url; a.download = clip.file.name; document.body.appendChild(a); a.click(); a.remove();
    setNote("Saved. If nothing downloaded, open the full player below.");
  };
  const shareX = () => {
    const text = `${meta.current.title}: dreamed live in the Hidden Track cathedral. Free to use.`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(CARD_URL)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button type="button" className={`${styles.ctl} ${rec ? styles.recOn : ""}`} onClick={() => (rec ? stopRef.current?.() : start())}
        aria-pressed={rec} aria-label={rec ? "Stop recording clip" : "Save my session as a clip"} data-clip>
        {rec ? `\u25CF ${secs}s` : "CLIP"}
      </button>
      {(clip || note) && !rec && (
        <div className={styles.clipPanel} role="dialog" aria-label="Your session clip">
          {clip && <video src={clip.url} muted loop autoPlay playsInline />}
          <div>
            <b>SESSION CLIP</b>
            {note && <small>{note}</small>}
            {clip && <button type="button" onClick={() => void save()}>SAVE</button>}
            {clip && <button type="button" onClick={shareX}>SHARE TO X</button>}
            <a href={song ? `https://hiddentrack.fm/embed?song=${encodeURIComponent(song)}` : "https://hiddentrack.fm/lantern"} target="_blank" rel="noopener noreferrer">FULL PLAYER &#8599;</a>
            <button type="button" aria-label="Close" onClick={() => { setClip(null); setNote(null); }}>&#10005;</button>
          </div>
        </div>
      )}
    </>
  );
}
