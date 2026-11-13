import type { Metadata, Viewport } from "next";
import { Anybody, Martian_Mono } from "next/font/google";
import "./globals.css";

// Anybody's width axis is the signature: the hero wordmark stretches with the bass.
const display = Anybody({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"], display: "swap", fallback: ["Impact", "Haettenschweiler", "Arial Narrow Bold", "sans-serif"] });
const mono = Martian_Mono({ variable: "--font-mono", subsets: ["latin"], axes: ["wdth"], display: "swap", fallback: ["Consolas", "Menlo", "monospace"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://hiddentrack.fm"),
  applicationName: "Hidden Track",
  title: { default: "Hidden Track", template: "%s / Hidden Track" },
  description: "Fresh Cuts, newest first. Press play, skip, shuffle, and use any song you love.",
  openGraph: {
    siteName: "Hidden Track",
    title: "Hidden Track",
    description: "Fresh Cuts, newest first. Press play right here.",
    type: "website",
    images: [{ url: "/listen/x-card.png", width: 1200, height: 675, alt: "Hidden Track Fresh Cuts" }],
  },
  twitter: { card: "summary_large_image", images: ["/listen/x-card.png"] },
};

export const viewport: Viewport = { themeColor: "#090808" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
