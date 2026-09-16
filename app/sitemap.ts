import type { MetadataRoute } from "next";

const SITE = "https://surfodds.com";

/** Public pages only. Signals is gated, the watchlist is per-person, and the
 *  research preview is development-only. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/games`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/stats`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/how-to-use`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
