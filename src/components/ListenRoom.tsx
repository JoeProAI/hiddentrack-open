import Link from "next/link";
import TrackList, { type ShelfFilter } from "@/components/player/TrackList";
import { TipLink } from "@/components/album/StoreLinks";
import HeroSignal from "@/components/HeroSignal";
import HomeStage from "@/components/home/HomeStage";
import styles from "@/components/player/listen.module.css";

export function Wordmark() {
  return (
    <Link className={styles.wordmark} href="/" aria-label="Hidden Track home">
      HIDDEN<em>TRACK</em>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span>HIDDEN TRACK / FRESH CUTS / <Link className={styles.freeLink} href="/map">THE COBBLER&apos;S CHART</Link> / <Link className={styles.freeLink} href="/halloween">HALLOWEEN</Link> / <Link className={styles.freeLink} href="/license">FREE TO USE</Link></span>
      <span><Link className={styles.freeLink} href="/album/counting-house">COUNTING HOUSE</Link> / <Link className={styles.freeLink} href="/album/the-back-lot">THE BACK LOT</Link><TipLink className={styles.freeLink} prefix=" / " /> / AUDIO STREAMED FROM SUNO / NO STRINGS</span>
    </footer>
  );
}

export default function ListenRoom({ filter, lantern = false }: { filter?: ShelfFilter; lantern?: boolean }) {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Wordmark />
        <span className={styles.label}><span className={styles.labelDate}>FRESH CUTS / OCT 2026 / </span><Link className={styles.freeLink} href="/map">FOLLOW THE FOOTPRINTS</Link> / <Link className={styles.freeLink} href="/license">FREE TO USE</Link></span>
      </header>

      {lantern ? <HomeStage /> : <HeroSignal />}

      <div className={styles.listHead}>
        <h2>Fresh<br /><em>cuts.</em></h2>
        <p>Newest on top. Tap a title and it plays right here, then rolls straight into the next one. Share a cut, download it, or take it to your edit. The deep cuts left footprints on <Link className={styles.freeLink} href="/map">the chart</Link>, and the spooky ones are down in <Link className={styles.freeLink} href="/halloween">the October shelf</Link>.</p>
      </div>

      <TrackList initial={filter} />

      <SiteFooter />
    </main>
  );
}
