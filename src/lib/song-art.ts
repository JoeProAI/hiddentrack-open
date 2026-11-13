// Optional cover art, keyed by Fresh Cuts slug (see src/lib/fresh-cuts.ts).
// Add a slug here when a song gets art. Pages and share cards pick it up.
// Squares and heroes are WebP for the page. og is JPEG so social crawlers
// that mishandle WebP still get a preview.

export type SongArt = {
  alt: string;
  /** 1200x1200 WebP for the song page and collection rows. */
  square: string;
  /** 1200x630 JPEG for openGraph images and the twitter image fallback. */
  og: string;
  /** Optional 1920x1080 WebP banner. */
  hero?: string;
};

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const songArt: Record<string, SongArt> = {
  "last-one-off": {
    alt: "Bus driver in a hi-vis vest at the wheel at night, rain on the windshield, tower blocks and orange streetlights ahead",
    square: "/art/last-one-off/square.webp",
    og: "/art/last-one-off/og.jpg",
    hero: "/art/last-one-off/hero.webp",
  },
  "square-him-up": {
    alt: "A man stands in front of a car lifted in a car crusher at a scrapyard at night under a green floodlight",
    square: "/art/square-him-up/square.webp",
    og: "/art/square-him-up/og.jpg",
  },
  "heavy-lifting": {
    alt: "A man with a bad back bends beside a rusty red car under stacked wrecks in a scrapyard",
    square: "/art/heavy-lifting/square.webp",
    og: "/art/heavy-lifting/og.jpg",
  },
  "grease-pen": {
    alt: "An old sedan on a used-car lot at night, a red-lit sales office and string lights behind it",
    square: "/art/grease-pen/square.webp",
    og: "/art/grease-pen/og.jpg",
  },
  "dish-pit": {
    alt: "A dishwasher works at a steaming steel sink in a cramped restaurant kitchen",
    square: "/art/dish-pit/square.webp",
    og: "/art/dish-pit/og.jpg",
  },
  "five-gallon": {
    alt: "A white five-gallon bucket with two red drumsticks on top, on a wet street under a lamp",
    square: "/art/five-gallon/square.webp",
    og: "/art/five-gallon/og.jpg",
  },
  brownout: {
    alt: "A cramped rehearsal space with amps, keyboards and a drum kit lit by one bulb",
    square: "/art/brownout/square.webp",
    og: "/art/brownout/og.jpg",
  },
  "stamp-says-paid": {
    alt: 'A hand holds up a payment slip at a clerk\'s counter, a red stamp reading "PAID" beside a desk bell and an ink pad',
    square: "/art/stamp-says-paid/square.webp",
    og: "/art/stamp-says-paid/og.jpg",
  },
  "name-on-the-lid": {
    alt: "A plastic lunch tub taped shut with masking tape and a marker on top, in an office break room by a microwave",
    square: "/art/name-on-the-lid/square.webp",
    og: "/art/name-on-the-lid/og.jpg",
  },
};

export const artFor = (slug: string | null | undefined) => (slug ? songArt[slug] : undefined);
