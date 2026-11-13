"use client";

import Image from "next/image";
import Link from "next/link";
import { usePlayer } from "@/components/player/PlayerProvider";
import styles from "./album.module.css";

type Row = {
  index: number;
  slug: string;
  title: string;
  lane: string;
  hook?: string;
  art?: { src: string; alt: string };
};

export function PlayAlbum({ queue, label = "Play the album" }: { queue: number[]; label?: string }) {
  const first = queue[0];
  const { index, playing, load, toggle } = usePlayer();
  const mine = index === first;
  return (
    <button type="button" className={styles.playAll} onClick={() => void (mine ? toggle() : load(first, queue))} aria-pressed={mine && playing}>
      <span aria-hidden="true">{mine && playing ? "\u275A\u275A" : "\u25B6"}</span>
      {mine && playing ? "Pause" : label}
    </button>
  );
}

export default function AlbumTracks({ rows, markExplicit = true }: { rows: Row[]; markExplicit?: boolean }) {
  const { index, playing, load, toggle } = usePlayer();
  // Album order, so auto-advance stays inside this set instead of falling back into Fresh Cuts.
  const queue = rows.map((r) => r.index);
  const withArt = rows.some((r) => r.art);
  const ledgerClass = [styles.ledger, withArt ? styles.ledgerArt : "", markExplicit ? "" : styles.ledgerPlain].filter(Boolean).join(" ");
  return (
    <ol className={ledgerClass}>
      {rows.map((r, n) => {
        const mine = index === r.index;
        return (
          <li key={r.slug} className={`${styles.entry} ${mine ? styles.entryOn : ""}`}>
            <span className={styles.entryNo}>{String(n + 1).padStart(2, "0")}</span>
            {r.art && <Image className={styles.entryCover} src={r.art.src} alt={r.art.alt} width={1200} height={1200} loading="lazy" sizes="76px" />}
            <span className={styles.entryMain}>
              <Link className={styles.entryTitle} href={`/song/${r.slug}`}>{r.title}</Link>
              <span className={styles.entryLane}>{r.lane}</span>
              {r.hook ? <span className={styles.entryHook}>{r.hook}</span> : null}
            </span>
            {markExplicit && <span className={styles.entryE} title="Explicit">E</span>}
            <button
              type="button"
              className={styles.entryPlay}
              onClick={() => void (mine ? toggle() : load(r.index, queue))}
              aria-label={`${mine && playing ? "Pause" : "Play"} ${r.title}`}
              aria-pressed={mine && playing}
            >
              {mine && playing ? "\u275A\u275A" : "\u25B6"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
