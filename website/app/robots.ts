import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://claudget.vercel.app/sitemap.xml",
    host: "https://claudget.vercel.app",
  };
}
