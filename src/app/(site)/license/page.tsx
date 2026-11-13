import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark, SiteFooter } from "@/components/ListenRoom";
import styles from "@/components/player/listen.module.css";
import { TipLink } from "@/components/album/StoreLinks";
import { store } from "@/lib/store";

export const metadata: Metadata = {
  title: { absolute: "Free to use / Hidden Track" },
  description: "Every song on Hidden Track is free to use, including commercially.",
  openGraph: { title: "Free to use / Hidden Track", description: "Every song on Hidden Track is free to use, including commercially.", siteName: "Hidden Track", url: "/license" },
};

export default function LicensePage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Wordmark />
        <Link className={styles.label} href="/">BACK TO FRESH CUTS</Link>
      </header>

      <article className={styles.legal}>
        <h2>Use it. It&apos;s yours to play.</h2>
        <p>
          Every song on Hidden Track is free to use, including commercially. Put it in your videos, streams, podcasts, games, ads, apps or live shows. No credit is needed, though we always like hearing where a song ended up.
        </p>

        <h2>The only rules</h2>
        <ul>
          <li>Don&apos;t sell or re-upload the songs on their own as your music, whether on streaming services, stock music sites or in sample packs.</li>
          <li>Don&apos;t register them with Content ID or any other fingerprinting service. That would trigger claims against everyone else using them.</li>
          <li>Don&apos;t claim you wrote or own the original songs.</li>
        </ul>

        <h2>Fine print</h2>
        <p>
          The songs are provided as-is, with no warranty. You don&apos;t need to ask, email or sign up. Just press play and use what you love.
        </p>

        {store.tipUrl && (
          <>
            <h2>Keep it free</h2>
            <p>
              Nothing here costs a thing, and it won&apos;t. If a song carried your video or your drive home, you can chip in whatever feels right, a dollar or more. <TipLink className={styles.freeLink} />
            </p>
          </>
        )}
      </article>

      <SiteFooter />
    </main>
  );
}
