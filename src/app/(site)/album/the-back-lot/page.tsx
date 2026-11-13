import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Wordmark, SiteFooter } from "@/components/ListenRoom";
import AlbumTracks, { PlayAlbum } from "@/components/album/AlbumTracks";
import { backLot, backLotIndexes, backLotTracks } from "@/lib/back-lot";
import { OG_SIZE } from "@/lib/song-art";
import { SITE, songUrl } from "@/lib/song-meta";
import base from "@/components/player/listen.module.css";
import styles from "@/components/album/album.module.css";

const title = "The Back Lot / Hidden Track";
const description = "The Back Lot. Six songs from the places nobody films.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: `/album/${backLot.slug}` },
  openGraph: {
    title,
    description,
    siteName: "Hidden Track",
    type: "music.album",
    url: `/album/${backLot.slug}`,
    images: [{ url: backLot.og, ...OG_SIZE, alt: backLot.heroAlt }],
  },
  twitter: { card: "summary_large_image", title, description, images: [backLot.og] },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MusicAlbum",
  name: backLot.title,
  description: backLot.intro,
  url: `${SITE}/album/${backLot.slug}`,
  image: `${SITE}${backLot.og}`,
  numTracks: backLotTracks.length,
  byArtist: { "@type": "MusicGroup", name: "Hidden Track", url: SITE },
  track: {
    "@type": "ItemList",
    numberOfItems: backLotTracks.length,
    itemListElement: backLotTracks.map((t, n) => ({ "@type": "ListItem", position: n + 1, item: { "@type": "MusicRecording", name: t.title, url: songUrl(t.slug) } })),
  },
};

export default function BackLotPage() {
  return (
    <main className={base.shell}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className={base.header}>
        <Wordmark />
        <Link className={base.label} href="/">ALL FRESH CUTS</Link>
      </header>

      <figure className={styles.banner}>
        <Image src={backLot.hero} alt={backLot.heroAlt} width={1920} height={1080} priority sizes="100vw" />
      </figure>

      <section className={styles.intro} aria-labelledby="album-title">
        <p className={styles.eyebrow}>Collection</p>
        <h1 id="album-title" className={styles.quietTitle}>{backLot.title}</h1>
        <p className={styles.summary}>{backLot.intro}</p>
        <div className={styles.heroActions}>
          {backLotIndexes.length > 0 && <PlayAlbum queue={backLotIndexes} label="Play the set" />}
        </div>
      </section>

      <section className={styles.tracks} aria-labelledby="tracks-title">
        <h2 id="tracks-title" className={styles.tracksHead}>The <em>set.</em></h2>
        <AlbumTracks
          markExplicit={false}
          rows={backLotTracks.map(({ index, slug, title: trackTitle, lane, hook, art }) => ({ index, slug, title: trackTitle, lane, hook, art }))}
        />
      </section>

      <SiteFooter />
    </main>
  );
}
