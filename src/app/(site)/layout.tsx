import PlayerProvider from "@/components/player/PlayerProvider";
import { tracks } from "@/lib/fresh-cuts";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <PlayerProvider tracks={tracks}>{children}</PlayerProvider>;
}
