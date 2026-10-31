/**
 * macOS update notice. The Mac builds are ad-hoc signed, and Squirrel.Mac (what
 * electron-updater uses there) only installs an update signed by the same
 * Developer ID, so a Mac can't update itself. Instead claudget asks GitHub for
 * the latest release and points at the right installer.
 */

export interface UpdateInfo {
  /** The newer version, e.g. "0.3.6". */
  version: string;
  /** The version running now. */
  current: string;
  /** This Mac's installer: the arm64 or x64 DMG, the universal one, or the release page. */
  downloadUrl: string;
  /** The installer's SHA-256 as GitHub reports it; null for the release page or an old release. */
  sha256: string | null;
  /** The release notes on GitHub. */
  notesUrl: string;
  /** Installed with Homebrew: `brew upgrade claudget` is the way to update. */
  viaHomebrew: boolean;
}

/** What claudget reads from GitHub's `releases/latest`. */
export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: Array<{ name: string; browser_download_url: string; digest?: string | null }>;
}

export const BREW_UPGRADE = 'brew upgrade claudget';

/** "v0.3.5" or "0.3.5" → [0, 3, 5]; null if it isn't a plain version. */
function parts(v: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(v.trim());
  return m ? m[1]!.split('.').map(Number) : null;
}

/** Negative when `a` is older than `b`, positive when newer, 0 when equal or unreadable. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The update this Mac should be offered, or null when it's up to date. */
export function macUpdateFrom(
  release: GitHubRelease,
  current: string,
  arch: string,
  viaHomebrew: boolean,
): UpdateInfo | null {
  if (release.draft || release.prerelease) return null;
  const version = release.tag_name.replace(/^v/, '');
  if (!parts(version) || compareVersions(version, current) <= 0) return null;
  const asset =
    release.assets.find(
      (a) => a.name === `claudget-${version}-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`,
    ) ?? release.assets.find((a) => a.name === `claudget-${version}-universal.dmg`);
  const sha = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? '');
  return {
    version,
    current,
    downloadUrl: asset?.browser_download_url ?? release.html_url,
    sha256: asset && sha ? sha[1]! : null,
    notesUrl: release.html_url,
    viaHomebrew,
  };
}
