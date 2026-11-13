"use client";

import Link from "next/link";
import { slugs } from "@/lib/fresh-cuts";
import { usePlayer } from "@/components/player/PlayerProvider";
import styles from "./playlist.module.css";

// A playlist that keeps auto-advance inside itself.
export default function PlaylistRows({ indexes, empty }: { indexes: number[]; empty: string }) {
  const { tracks, index, playing, load, toggle, error } = usePlayer();

  if (!indexes.length) return <p className={styles.empty}>{empty}</p>;

  const inList = index !== null && indexes.includes(index);

  return (
    <>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.all}
          onClick={() => void (inList ? toggle() : load(indexes[0], indexes))}
          aria-pressed={inList && playing}
        >
          <span aria-hidden="true">{inList && playing ? "\u275A\u275A" : "\u25B6"}</span>
          {inList && playing ? "Pause the playlist" : inList ? "Keep going" : `Play all ${indexes.length}`}
        </button>
        <span className={styles.count}>{indexes.length} {indexes.length === 1 ? "CUT" : "CUTS"} / PLAYS IN ORDER, THEN LOOPS</span>
        {inList && error && <p className={styles.err} role="alert">{error}</p>}
      </div>
      <ol className={styles.rows}>
        {indexes.map((i, k) => {
          const t = tracks[i];
          const mine = index === i;
          return (
            <li key={t.href} className={`${styles.row} ${mine ? styles.on : ""}`} style={{ ["--k" as string]: Math.min(k, 16) }}>
              <span className={styles.num} aria-hidden="true">{String(k + 1).padStart(2, "0")}</span>
              <div className={styles.body}>
                <button type="button" className={styles.title} onClick={() => void (mine ? toggle() : load(i, indexes))} aria-pressed={mine && playing}>
                  {t.title}
                  <span className={styles.srOnly}>{mine && playing ? " (pause)" : " (play here)"}</span>
                </button>
                <p className={styles.hook}>{t.hook}</p>
              </div>
              <span className={styles.lane}>{t.lane}</span>
              <span className={styles.tools}>
                <span className={styles.state} aria-hidden="true">{mine && playing ? "PLAYING" : "PLAY"}</span>
                <Link className={styles.tool} href={`/song/${slugs[i]}`}>PAGE<span className={styles.srOnly}> for {t.title}</span></Link>
                <a className={styles.tool} href={`/api/download/${slugs[i]}`} download>DOWNLOAD<span className={styles.srOnly}> {t.title}</span></a>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
