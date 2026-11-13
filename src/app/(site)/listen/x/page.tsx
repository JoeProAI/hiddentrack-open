import type { Metadata } from "next";
import Link from "next/link";
import styles from "./card.module.css";

const SITE = "https://hiddentrack.fm";
const TITLE = "Hidden Track LIVE: the song paints the screen";
const DESC = "Live AI visuals painted to the beat. Type an idea and it takes over.";
const IMAGE = `${SITE}/listen/x-card-live.png`; // real Lantern Slide live frames + LIVE / TAP TO STEER badge

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  openGraph: {
    siteName: "Hidden Track",
    title: TITLE,
    description: DESC,
    url: `${SITE}/listen/x`,
    type: "website",
    images: [{ url: IMAGE, width: 1200, height: 628, alt: "Live Lantern Slide frames: an ice dragon, neon flowers and a ring of fire, with a LIVE / TAP TO STEER badge" }],
  },
  twitter: {
    card: "player",
    title: TITLE,
    description: DESC,
    images: [IMAGE],
    players: [{ playerUrl: `${SITE}/embed`, streamUrl: `${SITE}/embed`, width: 480, height: 270 }],
  },
};

export default function ListenCardPage() {
  return (
    <main className={styles.stage}>
      <p className={styles.kicker}>HIDDEN TRACK / X PLAYER</p>
      <h1 className={styles.big}>Press<br /><em>play.</em></h1>
      <div className={styles.screen}>
        <iframe src="/embed" title="Hidden Track player" width={480} height={270} allow="autoplay; encrypted-media" />
      </div>
      <Link className={styles.open} href="/">OPEN HIDDEN TRACK &#8599;</Link>
    </main>
  );
}
