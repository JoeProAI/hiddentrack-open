import type { Metadata } from "next";
import EmbedPlayer from "./EmbedPlayer";
import { tracks } from "@/lib/fresh-cuts";

export const metadata: Metadata = {
  title: { absolute: "Hidden Track / Fresh Cuts" },
  description: "Play, skip and shuffle the newest Fresh Cuts.",
  openGraph: { title: "Fresh Cuts", description: "Play, skip and shuffle the newest Fresh Cuts.", siteName: "Hidden Track" },
  twitter: { card: "summary", title: "Fresh Cuts", description: "Play, skip and shuffle the newest Fresh Cuts." },
};

export default function EmbedPage() {
  return <EmbedPlayer tracks={tracks} />;
}
