import type { MetadataRoute } from "next";
import { withBase } from "@/lib/base";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orkin Proposal Studio",
    short_name: "Proposal Studio",
    description: "Commercial pest-management estimating, pricing and proposal generation.",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "any",
    background_color: "#0A0A0C",
    theme_color: "#0A0A0C",
    categories: ["business", "productivity"],
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
      { src: withBase("/icons/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
