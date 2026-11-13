import { ImageResponse } from "next/og";
import { tracks, slugs, indexForSlug } from "@/lib/fresh-cuts";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Hidden Track song card";

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const i = Math.max(0, indexForSlug((await params).slug));
  const t = tracks[i];
  const big = t.title.length > 18 ? 104 : 148;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#191719", color: "#f0eadb", padding: "64px 72px", fontFamily: "serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, letterSpacing: 6 }}>
          <span>HIDDEN <span style={{ color: "#de4b2e", marginLeft: 12 }}>TRACK</span></span>
          <span style={{ color: "#d5de37" }}>FREE TO USE</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 26, letterSpacing: 5, color: "#de4b2e", textTransform: "uppercase", marginBottom: 18 }}>{t.lane}</span>
          <span style={{ fontSize: big, lineHeight: 0.9, letterSpacing: -4 }}>{t.title}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 22, letterSpacing: 3, color: "#b9b1a3" }}>
          <span>ROYALTY-FREE / NO CREDIT NEEDED</span>
          <span style={{ fontSize: 120, color: "#d5de37", letterSpacing: -6, lineHeight: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: "#de4b2e", display: "flex" }} />
      </div>
    ),
    size,
  );
}
