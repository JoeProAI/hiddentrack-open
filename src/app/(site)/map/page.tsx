import type { Metadata } from "next";
import { IM_Fell_English } from "next/font/google";
import { Wordmark, SiteFooter } from "@/components/ListenRoom";
import CobblersChart from "@/components/chart/CobblersChart";
import Link from "next/link";
import styles from "@/components/player/listen.module.css";

const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell" });

const TITLE = "The Cobbler's Chart / Hidden Track";
const DESC = "A floor plan of every room the songs wander through. Follow the footprints to deep cuts, play them here, and use any of them free.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/map" },
  openGraph: { title: TITLE, description: DESC, siteName: "Hidden Track", url: "/map", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

export default function MapPage() {
  return (
    <main className={`${styles.shell} ${styles.parchment} ${fell.variable}`}>
      <header className={styles.header}>
        <Wordmark />
        <Link className={styles.label} href="/">BACK TO FRESH CUTS</Link>
      </header>
      <CobblersChart />
      <SiteFooter />
    </main>
  );
}
