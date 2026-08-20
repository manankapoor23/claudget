import type { MetadataRoute } from "next";
import { getLatestRelease } from "./lib/release";

/**
 * `lastModified: new Date()` would stamp "changed just now" on every build, even
 * a rebuild that altered nothing — crawlers learn to distrust a lastmod that is
 * always current. The newest release is the honest signal: it is when the thing
 * this page is about actually changed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { publishedAt } = await getLatestRelease();
  return [
    {
      url: "https://claudget.vercel.app",
      lastModified: publishedAt ? new Date(publishedAt) : undefined,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
