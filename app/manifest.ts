import type { MetadataRoute } from "next";

/* Web app manifest — colors match the app's dark premium theme
   (--background #09090c in app/globals.css). Icons are generated from the
   app's own brand mark (see scripts/gen-icons.mjs). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Live TV — Free Live TV from Every Country",
    short_name: "Live TV",
    description:
      "Watch 16,000+ live TV channels from 182 countries, streaming free in your browser. No sign-up, no cost.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "en",
    dir: "ltr",
    categories: ["entertainment"],
    background_color: "#09090c",
    theme_color: "#09090c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
