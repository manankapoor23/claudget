import { REPO_URL, RELEASES_URL } from "../constants";

/* One GitHub call serves both the download links and the download counts: the
   release list carries per-asset `download_count`. Revalidated hourly, and both
   readers below hit the same cached fetch, so a visit costs nothing and a new
   release shows up within the hour without a redeploy. Reading one source also
   means the version and the counts can never disagree with each other. */
const API = "https://api.github.com/repos/manankapoor23/claudget/releases?per_page=100";
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

export interface DownloadStats {
  /** Installer downloads across every published release. */
  total: number;
  byPlatform: { mac: number; win: number; linux: number };
  /** True when GitHub couldn't be read, so the count must not be shown. */
  unavailable: boolean;
}

interface ApiAsset {
  name?: unknown;
  size?: unknown;
  download_count?: unknown;
  browser_download_url?: unknown;
}

interface ApiRelease {
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}

/**
 * Last-known-good values. Only rendered if GitHub is unreachable or rate-limited
 * at build/revalidate time — every link still points at the releases page, which
 * always resolves to something downloadable.
 */
const FALLBACK: Release = {
  version: "0.2.3",
  published: null,
  assets: {},
  stale: true,
};

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/**
 * Maps an asset filename onto the platform it installs, or null if it isn't a
 * thing a person downloads.
 *
 * The exclusions carry weight: electron-builder also uploads `latest*.yml`
 * update manifests and `.blockmap` delta maps, which the auto-updater fetches on
 * a schedule. Those currently account for 104 of 128 asset downloads — counting
 * them would report five times the real number and call the updater a user.
 */
function classify(name: string): PlatformKey | null {
  if (name.endsWith(".blockmap") || name.endsWith(".yml")) return null;
  if (name.endsWith(".dmg")) return "mac";
  if (name.endsWith(".AppImage")) return "linux";
  if (name.endsWith(".exe")) {
    if (name.includes("Portable")) return "winPortable";
    return "win";
  }
  return null;
}

/** Fetches the release list. Returns [] on any failure. */
async function fetchReleases(): Promise<ApiRelease[]> {
  try {
    const res = await fetch(API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as ApiRelease[]) : [];
  } catch {
    return [];
  }
}

/** A release a visitor can actually download: published, not a preview. */
function isPublished(r: ApiRelease): boolean {
  return r.draft !== true && r.prerelease !== true;
}

function versionOf(r: ApiRelease): string {
  const tag =
    typeof r.tag_name === "string"
      ? r.tag_name
      : typeof r.name === "string"
        ? r.name
        : "";
  return tag.replace(/^v/, "").trim();
}

/**
 * Reads the newest published release. Never throws and never returns null — a
 * failure degrades to {@link FALLBACK} so the download section always renders.
 */
export async function getLatestRelease(): Promise<Release> {
  const releases = await fetchReleases();
  // GitHub returns newest first, so the first publishable entry is the latest.
  const latest = releases.find((r) => isPublished(r) && versionOf(r));
  if (!latest) return FALLBACK;

  const version = versionOf(latest);
  const assets: Partial<Record<PlatformKey, ReleaseAsset>> = {};
  if (Array.isArray(latest.assets)) {
    for (const raw of latest.assets as ApiAsset[]) {
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
  if (typeof latest.published_at === "string") {
    const d = new Date(latest.published_at);
    if (!Number.isNaN(d.getTime())) {
      published = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
  }

  return { version, published, assets, stale: false };
}

/**
 * Totals installer downloads across every published release — the closest thing
 * to "how many people installed this" that GitHub exposes. Update manifests and
 * delta maps are excluded; see {@link classify}.
 */
export async function getDownloadStats(): Promise<DownloadStats> {
  const releases = await fetchReleases();
  if (releases.length === 0) {
    return { total: 0, byPlatform: { mac: 0, win: 0, linux: 0 }, unavailable: true };
  }

  const byPlatform = { mac: 0, win: 0, linux: 0 };
  for (const release of releases) {
    if (!isPublished(release) || !Array.isArray(release.assets)) continue;
    for (const raw of release.assets as ApiAsset[]) {
      const name = typeof raw.name === "string" ? raw.name : "";
      const count = typeof raw.download_count === "number" ? raw.download_count : 0;
      if (!name || count <= 0) continue;

      const key = classify(name);
      if (key === "mac") byPlatform.mac += count;
      // The installer and the portable build are both "someone got it on Windows".
      else if (key === "win" || key === "winPortable") byPlatform.win += count;
      else if (key === "linux") byPlatform.linux += count;
    }
  }

  const total = byPlatform.mac + byPlatform.win + byPlatform.linux;
  return { total, byPlatform, unavailable: false };
}

/** 1234 → "1,234". */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Compares two dotted version strings. Negative if `a` sorts before `b`, 0 if
 * equal, positive if after. Missing or non-numeric parts count as 0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i] ?? 0);
    const y = Number(pb[i] ?? 0);
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Direct asset URL when we have one, else the releases page (always works). */
export function downloadHref(release: Release, key: PlatformKey): string {
  return release.assets[key]?.url ?? RELEASES_URL;
}

export { REPO_URL, RELEASES_URL };
