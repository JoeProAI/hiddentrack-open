import type { MetadataRoute } from "next";
import { slugs } from "@/lib/fresh-cuts";

const SITE = "https://hiddentrack.fm";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/halloween", "/map", "/license"].map((p) => ({ url: `${SITE}${p}`, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.6 }));
  const songs = slugs.map((s) => ({ url: `${SITE}/song/${s}`, changeFrequency: "weekly" as const, priority: 0.8 }));
  const albums = ["/album/counting-house", "/album/the-back-lot"].map((p) => ({ url: `${SITE}${p}`, changeFrequency: "weekly" as const, priority: 0.9 }));
  return [...pages, ...albums, ...songs];
}
