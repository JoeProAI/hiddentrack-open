import type { Metadata } from "next";
import FolderPlayer from "./FolderPlayer";

export const metadata: Metadata = {
  title: { absolute: "Hidden Track / Cathedral Live: play my folder" },
  description: "Play your own music folder inside the Hidden Track cathedral. Live AI visuals dreamed on a GPU from your song's beat map; your audio never leaves your device.",
  robots: { index: false },
};

export default function LanternPage() {
  return <FolderPlayer />;
}
