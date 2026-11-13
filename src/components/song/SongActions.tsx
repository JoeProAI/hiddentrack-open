"use client";

import { useState } from "react";
import { usePlayer } from "@/components/player/PlayerProvider";
import styles from "./song.module.css";

export default function SongActions({ index, slug, title, sunoHref }: { index: number; slug: string; title: string; sunoHref: string }) {
  const { index: current, playing, load, toggle, error } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const mine = current === index;

  const play = () => {
    if (mine) return void toggle();
    setBusy(true);
    void load(index).finally(() => setBusy(false));
  };

  const share = async () => {
    const url = `${window.location.origin}/song/${slug}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${title} / Hidden Track`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied("ok");
      window.setTimeout(() => setCopied(null), 1800);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setCopied("fail");
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.play} onClick={play} disabled={busy} aria-busy={busy} aria-pressed={mine && playing}>
        <span aria-hidden="true">{mine && playing ? "\u275A\u275A" : "\u25B6"}</span>
        {busy ? "Cueing it up" : mine && playing ? "Pause" : mine ? "Keep playing" : "Play here"}
      </button>
      <a className={styles.btn} href={`/api/download/${slug}`} download>
        Download free<span className={styles.srOnly}> {title}</span>
      </a>
      <button type="button" className={styles.btn} onClick={() => void share()}>
        {copied === "ok" ? "Link copied" : copied === "fail" ? "Copy below" : "Share"}
      </button>
      <a className={styles.btnQuiet} href={sunoHref} target="_blank" rel="noopener noreferrer">
        On Suno &#8599;<span className={styles.srOnly}> (new tab)</span>
      </a>
      {mine && error && <p className={styles.err} role="alert">{error}</p>}
    </div>
  );
}
