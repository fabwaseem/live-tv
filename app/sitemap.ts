import type { MetadataRoute } from "next";

const SITE_URL = "https://livetv.fabwaseem.com";

/* The app is a single-page catalogue — the homepage is the only public
   route. The catalogue refreshes continuously, so it is marked daily. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
