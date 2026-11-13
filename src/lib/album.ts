import { tracks, slugs, indexForSlug } from "@/lib/fresh-cuts";

// Counting House: the debut album. Track order is the album order, slugs match src/lib/fresh-cuts.ts.
export const album = {
  slug: "counting-house",
  title: "Counting House",
  date: "2026-10-30",
  dateLabel: "Oct 30, 2026",
  slugs: [
    "ninety-seconds",
    "with-interest",
    "thirty-and-two",
    "no-comment",
    "boo-me-louder",
    "engine-running",
    "closed-casket",
    "who-wrote-that",
    "box-box",
    "three-fifteen",
    "knock-it-down",
    "fourteen-point-turn",
    "your-version",
    "nobody-clapped",
  ],
};

// Fresh Cuts indexes in album order. A missing slug is dropped rather than breaking the page.
export const albumIndexes = album.slugs.map((s) => indexForSlug(s)).filter((i) => i >= 0);

export const albumTracks = albumIndexes.map((i) => ({ index: i, slug: slugs[i], ...tracks[i] }));
