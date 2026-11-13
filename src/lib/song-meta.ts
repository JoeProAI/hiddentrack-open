import { tracks, slugs, type Track } from "@/lib/fresh-cuts";
import { type Mood, MOOD_LABEL, genresFor, lanePhrase, moodsFor } from "@/lib/moods";
import { artFor } from "@/lib/song-art";

export const SITE = "https://hiddentrack.fm";

export const songUrl = (slug: string) => `${SITE}/song/${slug}`;

// "Free cinematic hard rap music for videos, royalty-free, no credit needed."
export const seoLine = (t: Track) => `Free ${lanePhrase(t.lane)} music for videos, royalty-free, no credit needed.`;

export const shortHook = (t: Track, max = 155) => {
  if (t.hook.length <= max) return t.hook;
  const cut = t.hook.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.]$/, "")}...`;
};

export function related(i: number, n = 6) {
  const me = tracks[i];
  const moods = new Set<Mood>(moodsFor(me));
  const genres = new Set(genresFor(me));
  return tracks
    .map((t, j) => {
      if (j === i) return { j, score: -1 };
      const m = moodsFor(t).filter((x) => moods.has(x)).length;
      const g = genresFor(t).filter((x) => genres.has(x)).length;
      // Nearby batches get a small nudge so related lists feel current but still dig.
      return { j, score: m * 2 + g * 3 + (Math.abs(j - i) < 12 ? 0.5 : 0) + ((j * 7 + i) % 5) / 10 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.j);
}

export function songJsonLd(i: number) {
  const t = tracks[i];
  const art = artFor(slugs[i]);
  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: t.title,
    url: songUrl(slugs[i]),
    ...(art ? { image: `${SITE}${art.square}` } : {}),
    description: t.hook,
    genre: t.lane,
    keywords: [...moodsFor(t).map((m) => MOOD_LABEL[m]), "royalty-free music", "free music for videos", "no credit needed"].join(", "),
    isAccessibleForFree: true,
    license: `${SITE}/license`,
    byArtist: { "@type": "MusicGroup", name: "Hidden Track", url: SITE },
    inAlbum: { "@type": "MusicAlbum", name: "Fresh Cuts", url: SITE },
    sameAs: [t.href],
  };
}
