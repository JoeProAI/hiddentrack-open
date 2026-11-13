import { tracks, slugs, indexForSlug } from "@/lib/fresh-cuts";
import { artFor } from "@/lib/song-art";

// The Back Lot: six songs, in set order. Slugs match src/lib/fresh-cuts.ts.
// A missing slug is dropped rather than breaking the page.
export const backLot = {
  slug: "the-back-lot",
  title: "The Back Lot",
  intro: "Six songs from the places nobody films.",
  hero: "/art/the-back-lot/hero.webp",
  heroAlt: 'Stacked wrecked cars and a red-lit booth in a scrapyard at night, title "The Back Lot". The title and intro text are baked in.',
  og: "/art/the-back-lot/og.jpg",
  slugs: [
    "square-him-up",
    "heavy-lifting",
    "grease-pen",
    "dish-pit",
    "five-gallon",
    "brownout",
  ],
};

export const backLotIndexes = backLot.slugs.map((s) => indexForSlug(s)).filter((i) => i >= 0);

export const backLotMissing = backLot.slugs.filter((s) => indexForSlug(s) < 0);

export const backLotTracks = backLotIndexes.map((i) => {
  const slug = slugs[i];
  const art = artFor(slug);
  return {
    index: i,
    slug,
    ...tracks[i],
    art: art ? { src: art.square, alt: art.alt } : undefined,
  };
});
