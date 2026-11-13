"use client";

import { useEffect, useRef } from "react";
import SignalCanvas from "@/components/viz/SignalCanvas";
import ChannelDial from "@/components/viz/ChannelDial";
import { stepScene, useScene } from "@/lib/scene-store";
import type { Track } from "@/lib/fresh-cuts";
import styles from "./theater.module.css";

// Signal Theater, Hidden Track edition: the player goes full screen and the
// channel dial flips through every scene. Arrow keys change channel, Esc leaves.
export default function Theater({ open, onClose, getAnalyser, playing, track, num, toggle, step }: {
  open: boolean; onClose: () => void; getAnalyser: () => AnalyserNode | null; playing: boolean;
  track: Track | null; num: number | null; toggle: () => void; step: (d: number) => void;
}) {
  const scene = useScene();
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement)) stepScene(1);
      else if (e.key === "ArrowLeft" && !(e.target instanceof HTMLInputElement)) stepScene(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.theater} role="dialog" aria-modal="true" aria-label="Signal Theater">
      <SignalCanvas scene={scene} className={styles.viz} getAnalyser={getAnalyser} playing={playing} center={[0.5, 0.46]} size={1.35} quality={0.85} label="Audio-reactive visual" />
      <div className={styles.top}>
        <span className={styles.mark}>SIGNAL THEATER <em>/ HIDDEN TRACK</em></span>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close theater">CLOSE &#10005;</button>
      </div>
      <div className={styles.bottom}>
        <div className={styles.track}>
          <small>{playing ? "ON AIR" : "STANDBY"} / {num === null ? "--" : String(num + 1).padStart(2, "0")}</small>
          <strong>{track ? track.title : "Pick a cut"}</strong>
          <span>{track?.lane ?? "Press play for the newest cut"}</span>
        </div>
        <div className={styles.transport}>
          <button type="button" onClick={() => step(-1)} aria-label="Previous cut">&#9664;&#9664;</button>
          <button type="button" className={styles.main} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? "\u275A\u275A" : "\u25B6"}</button>
          <button type="button" onClick={() => step(1)} aria-label="Next cut">&#9654;&#9654;</button>
        </div>
        <ChannelDial variant="theater" />
      </div>
    </div>
  );
}
