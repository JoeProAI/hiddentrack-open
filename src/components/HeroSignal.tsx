"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import SignalCanvas from "@/components/viz/SignalCanvas";
import { usePlayer } from "@/components/player/PlayerProvider";
import ChannelDial from "@/components/viz/ChannelDial";
import { BAND_NAMES, type Signal } from "@/lib/signal-engine";
import { useScene } from "@/lib/scene-store";
import styles from "./hero.module.css";

// The signature: the wordmark is a meter. Its width axis rides the bass, its
// shadow jumps on transients, and the Black Sun behind it is the same signal.
export default function HeroSignal() {
  const { tracks, index, playing, load, toggle, getAnalyser } = usePlayer();
  const heroRef = useRef<HTMLElement>(null);
  const last = useRef({ b: -1, h: -1, m: "" });
  const scene = useScene();

  const onFrame = useCallback((s: Signal) => {
    const el = heroRef.current;
    if (!el) return;
    const b = Math.round(s.bass * 50) / 50;
    const h = Math.round(s.transient * 20) / 20;
    if (b !== last.current.b) { el.style.setProperty("--bass", String(b)); last.current.b = b; }
    if (h !== last.current.h) { el.style.setProperty("--hit", String(h)); last.current.h = h; }
    // Broadcast signature: a live six-band signal meter (the VZX V04 bands)
    const m = BAND_NAMES.map((n) => Math.round(s.bands[n] * 12)).join();
    if (m !== last.current.m) {
      last.current.m = m;
      BAND_NAMES.forEach((n) => el.style.setProperty(`--m-${n}`, String(Math.round(s.bands[n] * 12) / 12)));
    }
  }, []);

  const lead = tracks[index ?? 0];
  const press = () => void (index === null ? load(0) : toggle());

  return (
    <section ref={heroRef} className={styles.hero} aria-labelledby="listen-title" data-playing={playing || undefined}>
      <SignalCanvas scene={scene} className={styles.sun} getAnalyser={getAnalyser} playing={playing} center={[0.7, 0.44]} centerNarrow={[0.62, 0.3]} size={1.25} quality={0.75} onFrame={onFrame} />
      <div className={styles.scan} aria-hidden="true" />

      <p className={styles.freq} aria-hidden="true">
        <span>PIRATE FEED</span><span>{String(tracks.length).padStart(2, "0")} CUTS</span><span>0 STRINGS</span><span className={styles.onAir}>{playing ? "ON AIR" : "STANDBY"}</span>
      </p>

      <div className={styles.meter} aria-hidden="true">
        {BAND_NAMES.map((n) => (
          <span key={n} style={{ ["--v" as string]: `var(--m-${n}, 0)` }}><i /><b>{n === "highmid" ? "HMID" : n === "lowmid" ? "LMID" : n.toUpperCase()}</b></span>
        ))}
      </div>

      <div className={styles.channel}><ChannelDial /></div>

      <h1 id="listen-title" className={styles.word}>
        <span className={styles.w1}>Hidden</span>
        <span className={styles.w2}>Track<i aria-hidden="true">.fm</i></span>
      </h1>

      <div className={styles.manifesto}>
        <p className={styles.shout}>Stream it.<br />Put it in your videos.<br /><em>Call it your own.</em></p>
        <p className={styles.small}>
          No strings, no credits, no permission. New tracks, newest first. Tap any title to play it right here, and it keeps rolling into the next cut. Every song is <Link className={styles.inline} href="/license">free to use</Link>.
        </p>
      </div>

      <button type="button" className={styles.press} onClick={press} aria-pressed={playing} aria-label={playing ? `Pause ${lead.title}` : `Play ${lead.title}`}>
        <span className={styles.pressIcon} aria-hidden="true">{playing ? "\u275A\u275A" : "\u25B6"}</span>
        <span className={styles.pressText}>
          <small>{playing ? "NOW PLAYING" : "PRESS PLAY"} / {String((index ?? 0) + 1).padStart(2, "0")}</small>
          <strong>{lead.title}</strong>
        </span>
      </button>

      <Link className={styles.stamp} href="/license">FREE<br />TO<br />TAKE</Link>

      <div className={styles.tape} aria-hidden="true">
        <div className={styles.tapeRun}>
          {[0, 1].map((k) => (
            <span key={k}>
              {tracks.slice(0, 12).map((t) => (
                <b key={t.href}>{t.title}<i>/</i></b>
              ))}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
