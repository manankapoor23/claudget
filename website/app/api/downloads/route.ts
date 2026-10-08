import { formatCount, getDownloadCount } from "../../lib/release";

/* The README's downloads badge, as a shields.io endpoint:
   https://img.shields.io/endpoint?url=https%3A%2F%2Fclaudget.vercel.app%2Fapi%2Fdownloads

   shields' own `github/downloads` badge adds up every release asset, so it
   also counts the auto-updater's `latest*.yml` manifests (every install
   fetches one every few hours) and its `.blockmap` delta maps. This is the
   figure the site's header shows instead: installer files only (.dmg, .exe,
   .AppImage, .deb), from the same cached GitHub read.

   Rendered statically and refreshed hourly, like the rest of the site. If
   GitHub can't be read at build time the badge says "–" rather than failing.
   On an hourly refresh in production, release.ts throws instead, which makes
   Next keep serving the last good badge: either way, never an error. */

export const revalidate = 3600;

/** The site's own orange, as on the README's release badge beside it. */
const COLOR = "ff7f57";

export async function GET() {
  const count = await getDownloadCount();
  return Response.json(
    {
      schemaVersion: 1,
      label: "downloads",
      message: count === null ? "–" : formatCount(count),
      color: count === null ? "lightgrey" : COLOR,
      // How long shields keeps its copy before asking again (its minimum is 300).
      cacheSeconds: 3600,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
