import type { MetadataRoute } from "next";

const SITE_URL = "https://livetv.fabwaseem.com";

/* Every crawler is welcome on the site itself; the JSON/stream APIs are
   machine endpoints, not pages, so they stay out of the index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
