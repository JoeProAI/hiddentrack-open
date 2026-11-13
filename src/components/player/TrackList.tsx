"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { slugs } from "@/lib/fresh-cuts";
import { GENRES, GENRE_LABEL, MOODS, MOOD_LABEL, type Genre, type Mood, genresFor, moodsFor } from "@/lib/moods";
import { usePlayer } from "./PlayerProvider";
import styles from "./listen.module.css";

function setParam(key: string, value: string | null) {
  const sp = new URLSearchParams(window.location.search);
  if (value) sp.set(key, value);
  else sp.delete(key);
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

export type ShelfFilter = { mood?: string; genre?: string; q?: string };

const asMood = (v?: string | null) => ((MOODS as readonly string[]).includes(v ?? "") ? (v as Mood) : null);
const asGenre = (v?: string | null) => ((GENRES as readonly string[]).includes(v ?? "") ? (v as Genre) : null);

export default function TrackList({ initial = {} }: { initial?: ShelfFilter }) {
  const { tracks, index, playing, load, toggle } = usePlayer();
  const [copied, setCopied] = useState<number | null>(null);
  const [shareFail, setShareFail] = useState<number | null>(null);

  // Filters live in the URL (?mood=hard&genre=rap&q=ghost) so a filtered shelf can be shared.
  const [mood, setMood] = useState<Mood | null>(asMood(initial.mood));
  const [genre, setGenre] = useState<Genre | null>(asGenre(initial.genre));
  const [q, setQ] = useState(initial.q ?? "");
  const pickMood = (m: Mood | null) => { setMood(m); setParam("mood", m); };
  const pickGenre = (g: Genre | null) => { setGenre(g); setParam("genre", g); };

  useEffect(() => {
    const id = window.setTimeout(() => {
      const cur = new URLSearchParams(window.location.search).get("q") ?? "";
      if (cur !== q.trim()) setParam("q", q.trim() || null);
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  const facts = useMemo(() => tracks.map((t) => ({ moods: moodsFor(t), genres: genresFor(t), text: `${t.title} ${t.lane} ${t.hook}`.toLowerCase() })), [tracks]);
  const counts = useMemo(() => {
    const m = Object.fromEntries(MOODS.map((x) => [x, 0])) as Record<Mood, number>;
    const g = Object.fromEntries(GENRES.map((x) => [x, 0])) as Record<Genre, number>;
    facts.forEach((f) => { f.moods.forEach((x) => m[x]++); f.genres.forEach((x) => g[x]++); });
    return { m, g };
  }, [facts]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => tracks.map((_, i) => i).filter((i) => (!mood || facts[i].moods.includes(mood)) && (!genre || facts[i].genres.includes(genre)) && (!needle || needle.split(/\s+/).every((w) => facts[i].text.includes(w)))),
    [tracks, facts, mood, genre, needle],
  );
  const filtered = Boolean(mood || genre || needle);
  const playFrom = (i: number) => load(i, filtered ? shown : undefined);
  const clear = () => {
    setQ("");
    setMood(null);
    setGenre(null);
    const sp = new URLSearchParams(window.location.search);
    ["mood", "genre", "q"].forEach((k) => sp.delete(k));
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };

  const share = async (i: number) => {
    const url = `${window.location.origin}/?t=${slugs[i]}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareFail(null);
      setCopied(i);
      window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 1800);
    } catch {
      setShareFail(i);
      window.prompt("Copy this link", url);
    }
  };

  if (!tracks.length) {
    return <p className={styles.hook} style={{ padding: "3rem 10vw" }}>No cuts on the shelf yet. The next batch lands soon.</p>;
  }

  return (
    <>
    <section className={styles.filters} aria-label="Filter Fresh Cuts">
      <div className={styles.searchRow}>
        <label className={styles.searchLabel} htmlFor="cut-search">Search the shelf</label>
        <input
          id="cut-search"
          className={styles.search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try ghost, wedding, trumpet, Detroit"
          autoComplete="off"
          enterKeyHint="search"
        />
        <span className={styles.found} aria-live="polite">
          {filtered ? `${shown.length} of ${tracks.length} cuts` : `${tracks.length} cuts`}
        </span>
        {filtered && <button type="button" className={styles.clear} onClick={clear}>Clear</button>}
      </div>
      <div className={styles.chipRow} role="group" aria-label="Mood">
        <span className={styles.chipHead}>Mood</span>
        {MOODS.map((m) => (
          <button key={m} type="button" className={styles.chip} aria-pressed={mood === m} disabled={!counts.m[m]} onClick={() => pickMood(mood === m ? null : m)}>
            {MOOD_LABEL[m]} <span>{counts.m[m]}</span>
          </button>
        ))}
      </div>
      <div className={styles.chipRow} role="group" aria-label="Genre">
        <span className={styles.chipHead}>Genre</span>
        {GENRES.map((g) => (
          <button key={g} type="button" className={styles.chip} aria-pressed={genre === g} disabled={!counts.g[g]} onClick={() => pickGenre(genre === g ? null : g)}>
            {GENRE_LABEL[g]} <span>{counts.g[g]}</span>
          </button>
        ))}
      </div>
    </section>

    {shown.length === 0 && (
      <div className={styles.noMatch}>
        <p>Nothing on the shelf matches{needle ? <> &ldquo;{q.trim()}&rdquo;</> : null}{mood ? ` in ${MOOD_LABEL[mood].toLowerCase()}` : ""}{genre ? ` in ${GENRE_LABEL[genre].toLowerCase()}` : ""}.</p>
        <button type="button" className={styles.clear} onClick={clear}>Show every cut</button>
      </div>
    )}

    <ol className={styles.list}>
      {shown.map((i, pos) => {
        const t = tracks[i];
        const active = i === index;
        const slug = slugs[i];
        return (
          <li id={`t-${slug}`} key={t.href} className={`${styles.row} ${active ? styles.rowActive : ""}`} style={{ ["--i" as string]: Math.min(pos, 20) }}>
            <span className={styles.num} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <div className={styles.body}>
              <button
                type="button"
                className={styles.title}
                aria-pressed={active && playing}
                onClick={() => void (active ? toggle() : playFrom(i))}
              >
                {t.title}
                <span className={styles.srOnly}>{active && playing ? " (pause)" : " (play here)"}</span>
              </button>
              <p className={styles.hook}>{t.hook}</p>
            </div>
            <span className={styles.lane}>{t.lane}</span>
            <span className={styles.actions}>
              <span className={styles.play} aria-hidden="true">{active && playing ? "PLAYING" : "PLAY"}</span>
              <span className={styles.rowTools}>
                <button type="button" className={styles.tool} onClick={() => void share(i)} aria-live="polite">
                  {copied === i ? "COPIED" : shareFail === i ? "COPY BELOW" : "SHARE"}
                  <span className={styles.srOnly}> link to {t.title}</span>
                </button>
                <Link className={styles.tool} href={`/song/${slug}`}>
                  PAGE<span className={styles.srOnly}> for {t.title}</span>
                </Link>
                <a className={styles.tool} href={`/api/download/${slug}`} download>
                  DOWNLOAD<span className={styles.srOnly}> {t.title}</span>
                </a>
                <a className={styles.tool} href={t.href} target="_blank" rel="noopener noreferrer">
                  SUNO &#8599;<span className={styles.srOnly}> {t.title} on Suno, new tab</span>
                </a>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
    </>
  );
}
