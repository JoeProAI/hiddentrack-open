import type { Metadata } from "next";
import { tracks, slugs, indexForSlug, songId } from "@/lib/fresh-cuts";
import { OG_SIZE, artFor } from "@/lib/song-art";

const TITLE = "Hidden Track";
const DESC = "Fresh Cuts, newest first. Press play, skip, shuffle, and use any song you love.";
const SITE = "https://hiddentrack.fm";
const CARD_TITLE = "Hidden Track LIVE: the song paints the screen";
const CARD_DESC = "Live AI visuals painted to the beat. Type an idea and it takes over.";
const CARD_IMAGE = { url: `${SITE}/listen/x-card-live.png`, width: 1200, height: 628, alt: "Live Lantern Slide frames with a LIVE / TAP TO STEER badge" };

// Songs with art use that JPEG. Everything else keeps the shared live card.
const cardImage = (slug?: string) => {
  const art = artFor(slug);
  return art ? { url: `${SITE}${art.og}`, ...OG_SIZE, alt: art.alt } : CARD_IMAGE;
};

// X player card: the post plays the live card inline (falls back to the image where X doesn't show players).
// playerUrl and streamUrl stay on /embed so existing posts keep the inline player.
const playerCard = (title: string, description: string, song?: string, image: string = CARD_IMAGE.url): Metadata["twitter"] => ({
  card: "player", title, description, images: [image],
  players: [{ playerUrl: song ? `${SITE}/embed?song=${song}` : `${SITE}/embed`, streamUrl: song ? `${SITE}/embed?song=${song}` : `${SITE}/embed`, width: 480, height: 270 }],
});

export async function listenMetadata(
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>,
  path: string,
): Promise<Metadata> {
  const raw = (await searchParams).t;
  const i = indexForSlug(Array.isArray(raw) ? raw[0] : raw);
  if (i >= 0) {
    const t = tracks[i];
    const title = `${t.title} / Hidden Track`;
    const image = cardImage(slugs[i]);
    return {
      title: { absolute: title },
      description: t.hook,
      alternates: { canonical: path },
      openGraph: { title, description: t.hook, siteName: TITLE, type: "music.song", url: `${path}?t=${encodeURIComponent(String(raw))}`, images: [image] },
      twitter: playerCard(title, t.hook, songId(t.href), image.url),
    };
  }
  return {
    title: { absolute: `${TITLE} / Fresh Cuts` },
    description: DESC,
    alternates: { canonical: path },
    openGraph: { title: CARD_TITLE, description: CARD_DESC, siteName: TITLE, type: "website", url: path, images: [CARD_IMAGE] },
    twitter: playerCard(CARD_TITLE, CARD_DESC),
  };
}
