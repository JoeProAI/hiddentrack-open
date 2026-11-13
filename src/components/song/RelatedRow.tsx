"use client";

import Link from "next/link";
import { usePlayer } from "@/components/player/PlayerProvider";
import styles from "./song.module.css";

export default function RelatedRow({ index, slug, title, lane }: { index: number; slug: string; title: string; lane: string }) {
  const { index: current, playing, load, toggle } = usePlayer();
  const mine = current === index;
  return (
    <li className={`${styles.relRow} ${mine ? styles.relOn : ""}`}>
      <button
        type="button"
        className={styles.relPlay}
        onClick={() => void (mine ? toggle() : load(index))}
        aria-label={`${mine && playing ? "Pause" : "Play"} ${title}`}
        aria-pressed={mine && playing}
      >
        {mine && playing ? "\u275A\u275A" : "\u25B6"}
      </button>
      <Link className={styles.relTitle} href={`/song/${slug}`}>{title}</Link>
      <span className={styles.relLane}>{lane}</span>
    </li>
  );
}
