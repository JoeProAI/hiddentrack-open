import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark, SiteFooter } from "@/components/ListenRoom";
import LedgerCover from "@/components/album/LedgerCover";
import AlbumTracks, { PlayAlbum } from "@/components/album/AlbumTracks";
import { CdBlock } from "@/components/album/StoreLinks";
import { album, albumIndexes, albumTracks } from "@/lib/album";
import { SITE, songUrl } from "@/lib/song-meta";
import base from "@/components/player/listen.module.css";
import styles from "@/components/album/album.module.css";

const description = "Counting House, Hidden Track's debut album. 14 hard rap tracks, all explicit. Stream and download every song free, or pre-order the CD.";

export const metadata: Metadata = {
  title: { absolute: "Counting House / Hidden Track" },
  description,
  alternates: { canonical: `/album/${album.slug}` },
  openGraph: { title: "Counting House / Hidden Track", description, siteName: "Hidden Track", type: "music.album", url: `/album/${album.slug}` },
  twitter: { card: "summary_large_image", title: "Counting House / Hidden Track", description },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MusicAlbum",
  name: album.title,
  url: `${SITE}/album/${album.slug}`,
  datePublished: album.date,
  numTracks: albumTracks.length,
  byArtist: { "@type": "MusicGroup", name: "Hidden Track", url: SITE },
  isAccessibleForFree: true,
  license: `${SITE}/license`,
  track: {
    "@type": "ItemList",
    numberOfItems: albumTracks.length,
    itemListElement: albumTracks.map((t, n) => ({ "@type": "ListItem", position: n + 1, item: { "@type": "MusicRecording", name: t.title, url: songUrl(t.slug) } })),
  },
};

export default function CountingHousePage() {
  return (
    <main className={base.shell}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className={base.header}>
        <Wordmark />
        <Link className={base.label} href="/">ALL FRESH CUTS</Link>
      </header>

      <section className={styles.hero} aria-labelledby="album-title">
        <LedgerCover count={albumTracks.length} />
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Debut album / {album.dateLabel}</p>
          <h1 id="album-title" className={styles.title}>Counting<br /><em>house.</em></h1>
          <p className={styles.summary}>
            Fourteen hard rap songs about keeping score. A bank job told on the vault clock, a nurse counting compressions at 2:40 a.m., a man who comes back to collect with interest, and a kid who learns to keep his own tally when nobody claps. All explicit, about 42 minutes, start to finish.
          </p>
          <div className={styles.heroActions}>
            {albumIndexes.length > 0 && <PlayAlbum queue={albumIndexes} />}
            <Link className={styles.quiet} href="/license">FREE TO USE</Link>
          </div>
          <CdBlock />
        </div>
      </section>

      <section className={styles.tracks} aria-labelledby="tracks-title">
        <h2 id="tracks-title" className={styles.tracksHead}>The <em>ledger.</em></h2>
        <AlbumTracks rows={albumTracks.map(({ index, slug, title, lane }) => ({ index, slug, title, lane }))} />
      </section>

      <section className={styles.promise}>
        <p className={styles.promiseBig}>Every song stays free. <em>The CD is for the shelf.</em></p>
        <p>
          All fourteen tracks play and download free on this site, and you can use them in your videos, streams and podcasts, commercial work included. Buying the CD doesn&apos;t unlock anything. It just puts the record in your hands and keeps the lights on here. <Link href="/license">Read the terms</Link>.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
