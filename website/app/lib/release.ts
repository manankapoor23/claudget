import { REPO_URL, RELEASES_URL } from "../constants";

/* The newest release, read from GitHub: its version, date, title and installer
   links. Revalidated hourly, so a new release shows up within the hour without
   a redeploy, and every reader shares the one cached fetch. */
const API = "https://api.github.com/repos/manankapoor23/claudget/releases?per_page=100";
const REVALIDATE_SECONDS = 3600;

export type PlatformKey =
  | "mac"
  | "macArm64"
  | "macX64"
  | "win"
  | "winPortable"
  | "linux"
  | "linuxDeb";

/** macOS builds, in the order the download row lists them. */
export const MAC_VARIANTS = [
  { key: "macArm64", label: "Apple Silicon" },
  { key: "macX64", label: "Intel" },
  { key: "mac", label: "Universal" },
] as const satisfies readonly { key: PlatformKey; label: string }[];

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
  /** Raw ISO timestamp of the release, for sitemap lastmod. */
  publishedAt: string | null;
  /** What this release is about, e.g. "A steadier floating pill". */
  title: string | null;
  /** This release's page on GitHub. */
  url: string;
  assets: Partial<Record<PlatformKey, ReleaseAsset>>;
  /** True when the data is a hardcoded fallback rather than live from GitHub. */
  stale: boolean;
}

interface ApiAsset {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
  download_count?: unknown;
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
 * Hand-written titles for releases whose GitHub name leads with the bug rather
 * than the fix. Used in place of the GitHub title for these versions, and for
 * the fallback when GitHub can't be read. Newer releases need nothing here.
 */
const CURATED: Record<string, { title: string; date: string }> = {
  "0.3.1": { title: "A steadier floating pill", date: "Oct 2026" },
  "0.3.0": { title: "Now in your menu bar", date: "Sep 2026" },
  "0.2.5.1": { title: "Improved session names", date: "Sep 2026" },
  "0.2.5": { title: "Plan limits explain themselves", date: "Aug 2026" },
  "0.2.4": { title: "Half the size on disk", date: "Aug 2026" },
  "0.2.3": { title: "macOS reliability", date: "Aug 2026" },
  "0.2.2": { title: "A new icon", date: "Jun 2026" },
};

const tagUrl = (version: string) => `${REPO_URL}/releases/tag/v${version}`;

/**
 * Last-known-good values. Only rendered if GitHub is unreachable or rate-limited
 * at build/revalidate time — every link still points at the releases page, which
 * always resolves to something downloadable.
 */
const FALLBACK_VERSION = "0.3.1";
const FALLBACK: Release = {
  version: FALLBACK_VERSION,
  published: CURATED[FALLBACK_VERSION]?.date ?? null,
  publishedAt: null,
  title: CURATED[FALLBACK_VERSION]?.title ?? null,
  url: tagUrl(FALLBACK_VERSION),
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
 * thing a person downloads. electron-builder also uploads `latest*.yml` update
 * manifests and `.blockmap` delta maps for the auto-updater; those are skipped.
 */
function classify(name: string): PlatformKey | null {
  if (name.endsWith(".blockmap") || name.endsWith(".yml")) return null;
  if (name.endsWith(".dmg")) {
    // Arch lives in the filename; anything else is the universal build. This
    // sits before the .exe branch so "-x64.dmg" can never be read as Windows.
    if (name.includes("-arm64")) return "macArm64";
    if (name.includes("-x64")) return "macX64";
    return "mac";
  }
  if (name.endsWith(".AppImage")) return "linux";
  if (name.endsWith(".deb")) return "linuxDeb";
  if (name.endsWith(".exe")) {
    if (name.includes("Portable")) return "winPortable";
    return "win";
  }
  return null;
}

/**
 * Whether a failed GitHub read should fail the render instead of falling back.
 * At build time and in dev the fallback keeps the site buildable offline. On an
 * hourly refresh in production, throwing is what makes Next keep serving the
 * last good page — falling back there would cache a degraded page (old
 * version, no direct links) for the next hour.
 */
function degradeOrThrow(): void {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("GitHub releases unavailable; keeping the last good render.");
  }
}

/** Unauthenticated calls share 60 an hour per IP; a token lifts that when set. */
function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Releases, newest first. Never throws; an empty list means GitHub didn't answer. */
async function fetchReleases(): Promise<ApiRelease[]> {
  try {
    const res = await fetch(API, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (res.ok) {
      const data: unknown = await res.json();
      if (Array.isArray(data)) return data as ApiRelease[];
    }
  } catch {
    // Network error or timeout: fall through to the fallback.
  }
  degradeOrThrow();
  return [];
}

/** A release a visitor can actually download: published, not a preview. */
function isPublished(r: ApiRelease): boolean {
  return r.draft !== true && r.prerelease !== true;
}

function versionOf(r: ApiRelease): string {
  const tag =
    typeof r.tag_name === "string" ? r.tag_name : typeof r.name === "string" ? r.name : "";
  return tag.replace(/^v/, "").trim();
}

function releaseUrl(r: ApiRelease, version: string): string {
  const tag = typeof r.tag_name === "string" ? r.tag_name : "v" + version;
  return REPO_URL + "/releases/tag/" + encodeURIComponent(tag);
}

/**
 * "0.2.4 — half the size on disk" → "Half the size on disk". Only a plain
 * lower-case first word is capitalised, so "macOS reliability" stays as is.
 */
function releaseTitle(r: ApiRelease, version: string): string | null {
  const curated = CURATED[version]?.title;
  if (curated) return curated;
  const name = typeof r.name === "string" ? r.name : "";
  const rest = name
    .replace(/^v?\d+(?:\.\d+)+(?:\s*[—–-]\s*)?/, "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest) return null;
  return /^[a-z]+(?:\s|$)/.test(rest) ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
}

/**
 * Reads the newest published release. Never throws during a build and never
 * returns null — a failure degrades to {@link FALLBACK} so the download section
 * always renders.
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
      const url = typeof raw.browser_download_url === "string" ? raw.browser_download_url : "";
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
  let publishedAt: string | null = null;
  if (typeof latest.published_at === "string") {
    const d = new Date(latest.published_at);
    if (!Number.isNaN(d.getTime())) {
      published = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      publishedAt = latest.published_at;
    }
  }

  return {
    version,
    published,
    publishedAt,
    title: releaseTitle(latest, version),
    url: releaseUrl(latest, version),
    assets,
    stale: false,
  };
}

/**
 * Every installer download across every published release, as GitHub counts
 * them. Update manifests and delta maps (fetched by the auto-updater, not by
 * people) are left out. Null when GitHub can't be read: the page then shows no
 * figure rather than a made-up one.
 */
export async function getDownloadCount(): Promise<number | null> {
  const releases = await fetchReleases();
  const published = releases.filter(isPublished);
  if (published.length === 0) return null;
  let total = 0;
  for (const r of published) {
    if (!Array.isArray(r.assets)) continue;
    for (const raw of r.assets as ApiAsset[]) {
      const name = typeof raw.name === "string" ? raw.name : "";
      if (name && classify(name) && typeof raw.download_count === "number") {
        total += raw.download_count;
      }
    }
  }
  return total;
}

/** "118", "1,240", then "12.4k" once the full figure stops being useful. */
export function formatCount(n: number): string {
  if (n < 10000) return n.toLocaleString("en-US");
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** Direct asset URL when we have one, else the releases page (always works). */
export function downloadHref(release: Release, key: PlatformKey): string {
  return release.assets[key]?.url ?? RELEASES_URL;
}

export { REPO_URL, RELEASES_URL };
