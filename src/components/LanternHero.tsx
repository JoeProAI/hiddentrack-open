"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/components/player/PlayerProvider";
import styles from "./lantern-hero.module.css";

// Homepage hero: the live Lantern Slide card itself (same engine as the X card: flat stage, live frames,
// prompt box + rotating chips, TAP FOR SOUND, fallback shader), framed same-origin so it stays identical.
// TV: fills the screen above the player dock, auto-advances random high-energy cuts, controls auto-hide.
export default function LanternHero() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [tv, setTv] = useState(false);
  const tvRef = useRef(false);
  useEffect(() => { tvRef.current = tv; }, [tv]);
  const [dockH, setDockH] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const { playing, toggle } = usePlayer();

  const post = useCallback((msg: object) => {
    try { frameRef.current?.contentWindow?.postMessage(msg, window.location.origin); } catch { /* ignore */ }
  }, []);

  const setTvMode = useCallback((on: boolean) => {
    setTv(on);
    post({ type: "ht:tvmode", on });
    try {
      if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
      if (!on && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    } catch { /* ignore */ }
  }, [post]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const deep = q.get("tv") === "1";
    const song = q.get("song");
    const t = setTimeout(() => {
      setSrc(`/embed?hero=1${deep ? "&tv=1" : ""}${song ? `&song=${encodeURIComponent(song)}` : ""}`);
      if (deep) setTv(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // messages from the card + the dock's TV button
  const playingRef = useRef(playing);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data !== "object") return;
      if (e.data.type === "ht:tv") setTvMode(Boolean(e.data.on));
      if (e.data.type === "ht:herosound" && playingRef.current) void toggle(); // hero sound on: pause the dock
    };
    const onDockTv = () => setTvMode(!tvRef.current);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && tvRef.current) setTvMode(false); };
    const onFs = () => { if (!document.fullscreenElement && tvRef.current) setTvMode(false); };
    window.addEventListener("message", onMsg);
    window.addEventListener("ht:tv", onDockTv);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("message", onMsg); window.removeEventListener("ht:tv", onDockTv);
      window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs);
    };
  }, [setTvMode, toggle]);

  // dock starts playing: the hero card goes quiet (TAP FOR SOUND comes back)
  useEffect(() => { if (playing) post({ type: "ht:mute" }); }, [playing, post]);

  useEffect(() => {
    if (!tv) return;
    const dock = document.querySelector<HTMLElement>('[role="region"][aria-label="Hidden Track player"]');
    if (!dock) return;
    const ro = new ResizeObserver(() => setDockH(dock.offsetHeight));
    ro.observe(dock);
    return () => ro.disconnect();
  }, [tv]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-hero-tv-on", tv);
    return () => document.documentElement.removeAttribute("data-hero-tv-on");
  }, [tv]);

  return (
    <section className={styles.hero} data-hero-tv data-tv={tv || undefined} style={dockH ? ({ ["--ht-dock-h" as string]: `${dockH}px` }) : undefined} aria-label="Lantern Slide: live visuals painted to the beat">
      {src && (
        <iframe ref={frameRef} className={styles.frame} src={src} title="Lantern Slide live visualizer"
          allow="autoplay; fullscreen; clipboard-write" onLoad={() => tvRef.current && post({ type: "ht:tvmode", on: true })} />
      )}
    </section>
  );
}
