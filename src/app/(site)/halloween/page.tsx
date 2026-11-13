import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark, SiteFooter } from "@/components/ListenRoom";
import PlaylistRows from "@/components/playlist/PlaylistRows";
import { tracks, slugs } from "@/lib/fresh-cuts";
import { moodsFor } from "@/lib/moods";
import base from "@/components/player/listen.module.css";
import styles from "./halloween.module.css";

const TITLE = "Free Halloween and horror music for videos / Hidden Track";
const DESC = "Spooky, dark and horror songs for Halloween edits, haunted house tours, horror shorts and October streams. Royalty-free, free to download, no credit needed.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/halloween" },
  openGraph: { title: TITLE, description: DESC, siteName: "Hidden Track", url: "/halloween", type: "music.playlist" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

const picks = tracks.map((t, i) => ({ t, i })).filter(({ t }) => moodsFor(t).includes("halloween")).map(({ i }) => i);

export default function HalloweenPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    name: "Free Halloween and horror music",
    url: "https://hiddentrack.fm/halloween",
    description: DESC,
    numTracks: picks.length,
    track: picks.map((i) => ({ "@type": "MusicRecording", name: tracks[i].title, genre: tracks[i].lane, url: `https://hiddentrack.fm/song/${slugs[i]}` })),
  };

  return (
    <main className={`${base.shell} ${styles.night}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <header className={`${base.header} ${styles.header}`}>
        <Wordmark />
        <Link className={styles.back} href="/">BACK TO FRESH CUTS</Link>
      </header>

      <section className={styles.hero} aria-labelledby="hw-title">
        <p className={styles.eyebrow}>The October shelf / restocked as new cuts land</p>
        <h1 id="hw-title">Free Halloween <span>and horror music</span> <em>for videos.</em></h1>
        <div className={styles.copy}>
          <p>
            Songs with something under the floorboards: funerals that go wrong, ghosts on pawnshop tapes, cities that watch you at 3:15 a.m. Use them in Halloween edits, haunted house walkthroughs, horror shorts, true crime and October streams.
          </p>
          <p className={styles.fine}>
            Royalty-free. Download any of them, drop them in, monetize the video. No credit needed. <Link href="/license">The terms</Link> fit in a paragraph.
          </p>
        </div>
      </section>

      <PlaylistRows indexes={picks} empty="The cellar is empty this week. New October cuts are on their way down the stairs." />

      <section className={styles.more}>
        <p>Want it darker? Walk down to <Link href="/map">the Root Cellar on the chart</Link>, or dig through <Link href="/?mood=hard">the hard cuts</Link>.</p>
      </section>

      <div className={styles.foot}><SiteFooter /></div>
    </main>
  );
}
