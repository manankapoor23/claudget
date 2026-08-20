import { REPO_URL, RELEASES_URL } from "../constants";

/* GitHub's "latest release" API. Revalidated hourly, so a visit costs nothing
   and a new release appears on the site within the hour without a redeploy. */
const API = "https://api.github.com/repos/manankapoor23/claudget/releases/latest";
const REVALIDATE_SECONDS = 3600;

export type PlatformKey = "mac" | "win" | "winPortable" | "linux";

export interface ReleaseAsset {
  /** Direct download URL for the installer itself. */
  url: string;
  filename: string;
  /** Human-readable size, e.g. "205 MB". */
  size: string;
}

export interface Release {
  /** Version without the leading "v", e.g. "0.2.3". */
  version: string;
  /** e.g. "Aug 2026", or null when the date is missing/unparseable. */
  published: string | null;
  assets: Partial<Record<PlatformKey, ReleaseAsset>>;
  /** True when the data is a hardcoded fallback rather than live from GitHub. */
  stale: boolean;
}

interface ApiAsset {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
}

/**
 * Last-known-good values. Only rendered if GitHub is unreachable or rate-limited
 * at build/revalidate time — every link still points at the releases page, which
 * always resolves to something downloadable.
 */
const FALLBACK: Release = {
  version: "0.2.2",
  published: null,
  assets: {},
  stale: true,
};

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Maps an asset filename onto the platform it installs, or null to ignore it. */
function classify(name: string): PlatformKey | null {
  // electron-builder also uploads update manifests and delta maps — not downloads.
  if (name.endsWith(".blockmap") || name.endsWith(".yml")) return null;
  if (name.endsWith(".dmg")) return "mac";
  if (name.endsWith(".AppImage")) return "linux";
  if (name.endsWith(".exe")) {
    if (name.includes("Portable")) return "winPortable";
    return "win";
  }
  return null;
}

/**
 * Reads the latest published release. Never throws and never returns null — a
 * failure degrades to {@link FALLBACK} so the download section always renders.
 */
export async function getLatestRelease(): Promise<Release> {
  try {
    const res = await fetch(API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return FALLBACK;

    const data = (await res.json()) as {
      tag_name?: unknown;
      name?: unknown;
      published_at?: unknown;
      assets?: unknown;
    };

    const tag =
      typeof data.tag_name === "string"
        ? data.tag_name
        : typeof data.name === "string"
          ? data.name
          : "";
    const version = tag.replace(/^v/, "").trim();
    if (!version) return FALLBACK;

    const assets: Partial<Record<PlatformKey, ReleaseAsset>> = {};
    if (Array.isArray(data.assets)) {
      for (const raw of data.assets as ApiAsset[]) {
        const name = typeof raw.name === "string" ? raw.name : "";
        const url =
          typeof raw.browser_download_url === "string" ? raw.browser_download_url : "";
        const size = typeof raw.size === "number" ? raw.size : 0;
        if (!name || !url) continue;

        const key = classify(name);
        // First match wins — the API lists one asset per target.
        if (key && !assets[key]) {
          assets[key] = { url, filename: name, size: formatSize(size) };
        }
      }
    }

    let published: string | null = null;
    if (typeof data.published_at === "string") {
      const d = new Date(data.published_at);
      if (!Number.isNaN(d.getTime())) {
        published = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
    }

    return { version, published, assets, stale: false };
  } catch {
    return FALLBACK;
  }
}

/** Direct asset URL when we have one, else the releases page (always works). */
export function downloadHref(release: Release, key: PlatformKey): string {
  return release.assets[key]?.url ?? RELEASES_URL;
}

export { REPO_URL, RELEASES_URL };
