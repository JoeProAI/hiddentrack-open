import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark, SiteFooter } from "@/components/ListenRoom";
import SongActions from "@/components/song/SongActions";
import RelatedRow from "@/components/song/RelatedRow";
import { tracks, slugs, indexForSlug } from "@/lib/fresh-cuts";
import { MOOD_LABEL, GENRE_LABEL, genresFor, moodsFor, lanePhrase } from "@/lib/moods";
import { related, seoLine, shortHook, songJsonLd } from "@/lib/song-meta";
import { OG_SIZE, artFor } from "@/lib/song-art";
import base from "@/components/player/listen.module.css";
import styles from "@/components/song/song.module.css";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const i = indexForSlug((await params).slug);
  if (i < 0) return {};
  const t = tracks[i];
  const title = `${t.title}: free ${lanePhrase(t.lane)} for videos / Hidden Track`;
  const description = `${shortHook(t, 120)} ${seoLine(t)}`;
  const art = artFor(slugs[i]);
  const images = art ? [{ url: art.og, ...OG_SIZE, alt: art.alt }] : undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/song/${slugs[i]}` },
    openGraph: { title: `${t.title} / Hidden Track`, description, siteName: "Hidden Track", type: "music.song", url: `/song/${slugs[i]}`, ...(images ? { images } : {}) },
    twitter: { card: "summary_large_image", title: `${t.title} / Hidden Track`, description, ...(art ? { images: [art.og] } : {}) },
  };
}

export default async function SongPage({ params }: Props) {
  const i = indexForSlug((await params).slug);
  if (i < 0) notFound();
  const t = tracks[i];
  const moods = moodsFor(t);
  const genres = genresFor(t);
  const rel = related(i);
  const slug = slugs[i];
  const art = artFor(slug);

  return (
    <main className={base.shell}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(songJsonLd(i)).replace(/</g, "\\u003c") }} />
      <header className={base.header}>
        <Wordmark />
        <Link className={base.label} href="/">ALL FRESH CUTS</Link>
      </header>

      {art?.hero && (
        <figure className={styles.banner}>
          <Image src={art.hero} alt={art.alt} width={1920} height={1080} priority sizes="100vw" />
        </figure>
      )}

      <article className={styles.song}>
        <p className={styles.num} aria-hidden="true">{String(i + 1).padStart(3, "0")}</p>
        <div className={styles.titleBlock}>
          <p className={styles.lane}>{t.lane}</p>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.seo}>{seoLine(t)}</p>
        </div>

        {art && !art.hero && (
          <figure className={styles.art}>
            <Image src={art.square} alt={art.alt} width={1200} height={1200} priority sizes="(max-width: 1000px) 88vw, 28rem" />
          </figure>
        )}

        <blockquote className={styles.hook}>
          <p>{t.hook}</p>
        </blockquote>

        <div className={styles.side}>
          <SongActions index={i} slug={slugs[i]} title={t.title} sunoHref={t.href} />
          <dl className={styles.facts}>
            <div><dt>Mood</dt><dd>{moods.map((m) => <Link key={m} className={styles.chip} href={`/?mood=${m}`}>{MOOD_LABEL[m]}</Link>)}</dd></div>
            <div><dt>Genre</dt><dd>{genres.map((g) => <Link key={g} className={styles.chip} href={`/?genre=${g}`}>{GENRE_LABEL[g]}</Link>)}</dd></div>
            <div><dt>Cut</dt><dd>No. {i + 1} of {tracks.length}, newest first</dd></div>
          </dl>
          <div className={styles.license}>
            <p className={styles.licenseHead}>Yours to use</p>
            <p>
              Put {t.title} in your videos, streams, podcasts, games or ads, including commercial work. No credit needed, no sign up. Just don&apos;t resell it as your own song or register it with Content ID. <Link href="/license">Read the full terms</Link>.
            </p>
          </div>
        </div>
      </article>

      {rel.length > 0 && (
        <section className={styles.related} aria-labelledby="related-title">
          <h2 id="related-title">If this one lands, <em>try these.</em></h2>
          <ol className={styles.relList}>
            {rel.map((j) => (
              <RelatedRow key={slugs[j]} index={j} slug={slugs[j]} title={tracks[j].title} lane={tracks[j].lane} />
            ))}
          </ol>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}
