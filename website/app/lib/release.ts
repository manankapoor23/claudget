import { REPO_URL, RELEASES_URL } from "../constants";

/* One GitHub call serves both the download links and the download counts: the
   release list carries per-asset `download_count`. Revalidated hourly, and both
   readers below hit the same cached fetch, so a visit costs nothing and a new
   release shows up within the hour without a redeploy. Reading one source also
   means the version and the counts can never disagree with each other. */
const API = "https://api.github.com/repos/manankapoor23/claudget/releases?per_page=100";
const REVALIDATE_SECONDS = 3600;
/**
 * Safety ceiling on pagination — 100 releases per page, so 1000 releases.
 * Deliberately not higher: unauthenticated GitHub allows 60 requests an hour, so
 * an unbounded loop could exhaust the budget for the whole site. Reaching this
 * reports the total as partial rather than pretending it is final.
 */
const MAX_RELEASE_PAGES = 10;

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
  /**
   * True when releases were left unread (a failed page, or the page cap), making
   * `total` a lower bound. Rendered as "1,234+" so it never overstates itself.
   */
  partial: boolean;
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

interface ReleasePage {
  releases: ApiRelease[];
  /** Absolute URL of the next page, or null when this is the last one. */
  next: string | null;
  ok: boolean;
}

/**
 * Pulls the `rel="next"` URL out of a Link header.
 *
 * The host is re-checked because this URL comes from a response header rather
 * than from our own code — a paginating loop should not follow it somewhere else.
 */
function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(header);
  const url = match?.[1];
  if (!url) return null;
  try {
    if (new URL(url).host !== "api.github.com") return null;
  } catch {
    return null;
  }
  return url;
}

/** Fetches one page of releases. Never throws. */
async function fetchReleasePage(url: string): Promise<ReleasePage> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return { releases: [], next: null, ok: false };
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return { releases: [], next: null, ok: false };
    return {
      releases: data as ApiRelease[],
      next: parseNextLink(res.headers.get("link")),
      ok: true,
    };
  } catch {
    return { releases: [], next: null, ok: false };
  }
}

/**
 * Releases are newest-first, so the first page is all the download links need.
 * Returns [] on failure.
 */
async function fetchReleases(): Promise<ApiRelease[]> {
  return (await fetchReleasePage(API)).releases;
}

/**
 * Walks every page of releases by following the Link header.
 *
 * `complete` is the honest part: a total that silently drops older releases
 * still looks like a total, so anything short of exhausting the pages — a failed
 * page or the safety cap — has to say so rather than pass itself off as final.
 * With one release page this loop makes exactly one request and exits.
 */
async function fetchAllReleases(): Promise<{ releases: ApiRelease[]; complete: boolean }> {
  const all: ApiRelease[] = [];
  let url: string | null = API;

  for (let page = 0; page < MAX_RELEASE_PAGES; page++) {
    const { releases, next, ok } = await fetchReleasePage(url);
    if (!ok) return { releases: all, complete: false };
    all.push(...releases);
    if (!next) return { releases: all, complete: true };
    url = next;
  }
  // Ran out of allowed pages with more still to come.
  return { releases: all, complete: false };
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
 * delta maps are excluded; see {@link classify}. Every page of releases is read,
 * and if any is missed the result is flagged `partial` rather than under-reported
 * as final.
 */
export async function getDownloadStats(): Promise<DownloadStats> {
  const { releases, complete } = await fetchAllReleases();
  if (releases.length === 0) {
    return {
      total: 0,
      byPlatform: { mac: 0, win: 0, linux: 0 },
      unavailable: true,
      partial: false,
    };
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
  return { total, byPlatform, unavailable: false, partial: !complete };
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
