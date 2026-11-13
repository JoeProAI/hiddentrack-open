"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/player/PlayerProvider";
import { slugs, indexForSlug } from "@/lib/fresh-cuts";
import { ROOMS, VIEW, type Room, byRoom, catalog, roomFor, trailsFor } from "@/lib/chart-layout";
import styles from "./chart.module.css";

const OPEN_KEY = "ht-chart-open";
const NIGHTS = ["First night", "Second night", "Third night", "Fourth night", "Fifth night", "Sixth night", "Seventh night"];

// Walls with a gap where the door is, drawn as one path per room.
function wallPath(r: Room) {
  const gap = 26;
  const { x, y, w, h, door } = r;
  const pts: string[] = [];
  if (door.y === y + h) {
    pts.push(`M${door.x - gap} ${y + h} L${x} ${y + h} L${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${door.x + gap} ${y + h}`);
  } else if (door.y === y) {
    pts.push(`M${door.x + gap} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} L${x} ${y} L${door.x - gap} ${y}`);
  } else {
    pts.push(`M${x} ${door.y + gap} L${x} ${y + h} L${x + w} ${y + h} L${x + w} ${y} L${x} ${y} L${x} ${door.y - gap}`);
  }
  return pts.join(" ");
}

export default function CobblersChart() {
  const { tracks, index, playing, load, toggle, error } = usePlayer();
  const [night, setNight] = useState(0);
  const trails = useMemo(() => trailsFor(night), [night]);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const [origin, setOrigin] = useState({ x: "16%", y: "80%" });
  const [lit, setLit] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [wander, setWander] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [offline, setOffline] = useState(false);
  const [settled, setSettled] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<HTMLHeadingElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // On narrow screens the chart scrolls sideways; bring the picked trail into view.
  useEffect(() => {
    const el = scrollerRef.current;
    const t = trails.find((x) => x.index === chosen);
    if (!el || !t || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: (t.end.x / VIEW.w) * el.scrollWidth - el.clientWidth / 2, behavior: "auto" });
  }, [chosen, trails]);

  // Arrive already open from a shared link or a second visit this session.
  useEffect(() => {
    const t = indexForSlug(new URLSearchParams(window.location.search).get("t"));
    let again = false;
    try { again = sessionStorage.getItem(OPEN_KEY) === "1"; } catch {}
    const raf = requestAnimationFrame(() => {
      if (t >= 0) setChosen(t);
      if (t >= 0 || again) { setInstant(true); setOpen(true); }
      setOffline(!navigator.onLine);
    });
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // After the ink blooms in, hover fades switch to quick timings.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setSettled(true), instant ? 0 : 1900);
    return () => { window.clearTimeout(id); setSettled(false); };
  }, [open, instant]);

  // While nobody is touching the chart, one trail at a time walks itself in, faintly.
  useEffect(() => {
    if (!open || lit !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setWander(trails[Math.floor(Math.random() * trails.length)]?.index ?? null), 3400);
    return () => window.clearInterval(id);
  }, [open, lit, trails]);

  const unfold = (e: React.MouseEvent<HTMLButtonElement>) => {
    const f = frameRef.current?.getBoundingClientRect();
    const b = e.currentTarget.getBoundingClientRect();
    if (f && b.width) setOrigin({ x: `${((b.left + b.width / 2 - f.left) / f.width) * 100}%`, y: `${((b.top + b.height / 2 - f.top) / f.height) * 100}%` });
    setInstant(false);
    setOpen(true);
    try { sessionStorage.setItem(OPEN_KEY, "1"); } catch {}
  };

  const fold = () => {
    setOpen(false);
    setLit(null);
    try { sessionStorage.removeItem(OPEN_KEY); } catch {}
  };

  const choose = useCallback((i: number, focusSlip = false) => {
    setChosen(i);
    setCopied(null);
    window.history.replaceState(null, "", `/map?t=${slugs[i]}`);
    if (focusSlip) requestAnimationFrame(() => slipRef.current?.focus());
    if (index === i) return void toggle();
    setPending(true);
    void load(i).finally(() => setPending(false));
  }, [index, load, toggle]);

  const share = async () => {
    if (chosen === null) return;
    const url = `${window.location.origin}/map?t=${slugs[chosen]}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied("fail");
      window.prompt("Copy this link", url);
    }
  };

  const shown = chosen ?? lit;
  const shownTrack = shown === null ? null : tracks[shown];
  const shownRoom = shown === null ? null : roomFor(catalog[shown].moods[0]);
  const isCurrent = chosen !== null && index === chosen;

  return (
    <div className={styles.chart}>
      <section className={styles.head} aria-labelledby="chart-title">
        <p className={styles.eyebrow}>Hidden Track / a floor plan of the catalog</p>
        <h1 id="chart-title">The Cobbler&apos;s<br /><em>Chart.</em></h1>
        <p className={styles.lede}>
          Every song here walked in from somewhere. This is the house they wander, room by room, mood by mood. Follow a set of prints to where it stops and you&apos;ll find a cut that never made the front page.
        </p>
      </section>

      <div className={styles.stage}>
        <div ref={frameRef} className={`${styles.frame} ${open ? styles.open : ""} ${instant ? styles.instant : ""} ${settled ? styles.settled : ""}`} style={{ ["--ox" as string]: origin.x, ["--oy" as string]: origin.y }}>
          <div ref={scrollerRef} className={styles.scroller}>
            <div className={styles.sheet} inert={!open}>
              <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className={styles.svg} role="group" aria-label="The Cobbler's Chart. Each set of footprints leads to a song.">
                <defs>
                  <filter id="ht-wobble" x="-2%" y="-2%" width="104%" height="104%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
                    <feDisplacementMap in="SourceGraphic" scale="3.2" />
                  </filter>
                  <symbol id="ht-print" viewBox="-5 -9 10 19" overflow="visible">
                    <path d="M0 -7.5C3.2 -7.5 3.8 -3.2 3.3 0C2.9 2.4 2.3 3 2.3 3.8L-2.3 3.8C-2.3 3 -2.9 2.4 -3.3 0C-3.8 -3.2 -3.2 -7.5 0 -7.5Z" />
                    <path d="M-2.1 5.2H2.1V7.6C2.1 9 -2.1 9 -2.1 7.6Z" />
                  </symbol>
                  <pattern id="ht-stairs" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
                    <path d="M0 11.5H12" stroke="currentColor" strokeWidth="1.2" />
                  </pattern>
                </defs>

                <g className={styles.plan} aria-hidden="true" filter="url(#ht-wobble)">
                  <rect x="40" y="40" width="1080" height="720" className={styles.outer} />
                  {ROOMS.map((r) => (
                    <g key={r.mood} className={styles.room} style={{ ["--r" as string]: ROOMS.indexOf(r) }}>
                      <path d={wallPath(r)} className={`${styles.wall} ${r.kind === "cellar" ? styles.wallCellar : ""} ${r.kind === "porch" ? styles.wallPorch : ""}`} />
                      {r.kind === "cellar" && <rect x={r.x + 8} y={r.door.y - 40} width="52" height="80" fill="url(#ht-stairs)" className={styles.stairs} />}
                    </g>
                  ))}
                  <path d="M60 400 Q600 386 1140 404" className={styles.hall} />
                </g>

                <g aria-hidden="true">
                  {ROOMS.map((r) => (
                    <g key={r.mood} className={styles.roomLabel} style={{ ["--r" as string]: ROOMS.indexOf(r) }}>
                      <text x={r.x + 16} y={r.y + 32} className={styles.roomName}>{r.name}</text>
                      <text x={r.x + 16} y={r.y + 50} className={styles.roomNote}>{r.note.toUpperCase()} / {byRoom(r.mood).length}</text>
                    </g>
                  ))}
                  <text x="600" y="430" textAnchor="middle" className={styles.hallLabel}>THE LONG HALL</text>
                  <g className={styles.compass} transform="translate(1072 400)">
                    <circle r="26" />
                    <path d="M0 -34L5 0L0 34L-5 0Z" />
                    <text y="-40" textAnchor="middle">N</text>
                  </g>
                </g>

                <g className={styles.trails}>
                  {trails.map((t, n) => {
                    const track = tracks[t.index];
                    const state = chosen === t.index ? styles.trailChosen : lit === t.index ? styles.trailLit : wander === t.index ? styles.trailWander : "";
                    return (
                      <g
                        key={`${t.slug}-${night}`}
                        className={`${styles.trail} ${state}`}
                        tabIndex={open ? 0 : -1}
                        role="button"
                        aria-label={`${track.title}, ${track.lane}. In ${roomFor(t.mood).name}. Play it.`}
                        aria-pressed={chosen === t.index && playing}
                        style={{ ["--r" as string]: ROOMS.findIndex((r) => r.mood === t.mood), ["--n" as string]: n % 6 }}
                        onMouseEnter={() => setLit(t.index)}
                        onMouseLeave={() => setLit((l) => (l === t.index ? null : l))}
                        onFocus={() => setLit(t.index)}
                        onBlur={() => setLit((l) => (l === t.index ? null : l))}
                        onClick={() => choose(t.index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(t.index, true); }
                          if (e.key === "Escape") (e.currentTarget as SVGGElement).blur();
                        }}
                      >
                        <path d={t.hit} className={styles.hit} />
                        {t.prints.map((p, k) => (
                          <use
                            key={k}
                            href="#ht-print"
                            x={-5}
                            y={-9}
                            width={10}
                            height={19}
                            className={styles.print}
                            style={{ ["--k" as string]: k }}
                            transform={`translate(${p.x} ${p.y}) rotate(${p.a})${p.left ? " scale(-1 1)" : ""} scale(.78)`}
                          />
                        ))}
                        <g transform={`translate(${t.end.x.toFixed(1)} ${t.end.y.toFixed(1)})`}>
                          <path d="M-6 -6L6 6M6 -6L-6 6" className={styles.mark} />
                          <circle r="11" className={styles.ring} />
                          <text y="27" textAnchor="middle" className={styles.reveal}>{track.title}</text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>

          <div className={styles.seal} aria-hidden={open} inert={open}>
            <div className={styles.sealCard}>
              <p className={styles.sealTag}>FOLDED / KEEP DRY / 8 ROOMS</p>
              <p className={styles.sealLine}>The prints only show for people who mean it.</p>
              <button type="button" className={styles.sealBtn} onClick={unfold}>I came to listen</button>
              <p className={styles.sealHint}>Opens the chart. Nothing plays until you pick a trail.</p>
            </div>
          </div>
        </div>

        <aside className={styles.slip} aria-live="polite">
          <div className={styles.slipTop}>
            <span>{NIGHTS[night % NIGHTS.length].toUpperCase()}</span>
            <span>{trails.length} TRAILS</span>
          </div>

          {shownTrack && shownRoom && shown !== null ? (
            <div className={styles.slipBody}>
              <p className={styles.slipRoom}>{chosen === null ? "Prints lead to" : "Found in"} {shownRoom.name}</p>
              <h2 ref={slipRef} tabIndex={-1} className={styles.slipTitle}>{shownTrack.title}</h2>
              <p className={styles.slipLane}>{shownTrack.lane}</p>
              <p className={styles.slipHook}>{shownTrack.hook}</p>
              {offline && <p className={styles.slipWarn}>No signal right now. The chart still reads, but songs need a connection to play.</p>}
              {isCurrent && error && <p className={styles.slipWarn} role="alert">{error}</p>}
              <div className={styles.slipTools}>
                <button
                  type="button"
                  className={styles.btnMain}
                  onClick={() => choose(shown)}
                  disabled={pending && isCurrent}
                  aria-busy={pending && isCurrent}
                >
                  {pending && isCurrent ? "Lacing up..." : isCurrent && playing ? "Pause" : isCurrent ? "Play again" : "Play here"}
                </button>
                <button type="button" className={styles.btn} onClick={() => void share()} disabled={chosen === null}>
                  {copied === "ok" ? "Link copied" : copied === "fail" ? "Copy below" : "Share"}
                </button>
                <a className={styles.btn} href={`/api/download/${slugs[shown]}`} download aria-disabled={chosen === null}>
                  Download
                </a>
              </div>
              <p className={styles.slipFine}>Free to use, no credit needed. <a href={`/song/${slugs[shown]}`}>Song page</a> / <a href="/license">The terms</a>.</p>
            </div>
          ) : (
            <div className={styles.slipBody}>
              <p className={styles.slipRoom}>No trail picked yet</p>
              <p className={styles.slipEmpty}>
                {open
                  ? "Run a finger or a cursor across the floor. The prints darken as you go, and wherever they stop, there's a song waiting."
                  : "The chart is still folded. Open it and the rooms ink themselves in."}
              </p>
            </div>
          )}

          <div className={styles.slipFoot}>
            <button type="button" className={styles.btn} onClick={() => { setNight((n) => n + 1); setLit(null); }} disabled={!open}>
              Walk another night
            </button>
            {open && <button type="button" className={styles.btnQuiet} onClick={fold}>Fold the chart</button>}
          </div>
        </aside>
      </div>

      <p className={styles.dragHint}>Drag the chart sideways to see every room.</p>

      <section className={styles.notes} aria-labelledby="notes-title">
        <h2 id="notes-title" className={styles.notesTitle}>Field notes <em>every room, every song</em></h2>
        <div className={styles.notesGrid}>
          {ROOMS.map((r) => {
            const songs = byRoom(r.mood);
            return (
              <div key={r.mood} className={styles.noteRoom}>
                <h3>{r.name}</h3>
                <p className={styles.noteSub}>{r.note}</p>
                {songs.length ? (
                  <ul>
                    {songs.map((c) => (
                      <li key={c.slug}>
                        <button
                          type="button"
                          className={`${styles.noteSong} ${index === c.index ? styles.noteOn : ""}`}
                          aria-pressed={index === c.index && playing}
                          onClick={() => { if (!open) { setInstant(true); setOpen(true); } choose(c.index); }}
                        >
                          {tracks[c.index].title}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.noteSub}>No prints in here yet. The next batch might wander in.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
