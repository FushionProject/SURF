import type { MetadataRoute } from "next";

const SITE = "https://surfodds.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private research, the API surface and per-person pages stay out of search.
      disallow: ["/api/", "/account", "/stats/research", "/eval"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
