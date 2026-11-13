import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hidden Track",
    short_name: "Hidden Track",
    description: "Fresh Cuts, newest first. Free to use.",
    start_url: "/",
    display: "standalone",
    background_color: "#f0eadb",
    theme_color: "#191719",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
