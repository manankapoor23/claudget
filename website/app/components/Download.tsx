import { IconApple, IconWindows, IconLinux, IconDownload } from "../icons";
import {
  downloadHref,
  formatCount,
  getDownloadStats,
  getLatestRelease,
  type PlatformKey,
  type Release,
} from "../lib/release";

/* Everything here is server-rendered: all three platforms are always in the DOM
   (good for SEO, works with JS off). The visitor's own platform is promoted
   purely in CSS via the `data-os` hint that layout.tsx sets before first paint,
   so there is no spinner, no hydration swap and no layout jank. */

interface PlatformMeta {
  key: PlatformKey;
  os: string;
  Icon: typeof IconApple;
  /** What the artifact is. */
  file: string;
  requires: string;
  unblock: string;
}

const PLATFORMS: PlatformMeta[] = [
  {
    key: "mac",
    os: "macOS",
    Icon: IconApple,
    file: "Universal .dmg",
    requires: "11 Big Sur+ · Apple Silicon + Intel",
    unblock:
      "Unsigned, so the first launch is blocked. Drag to Applications, then run:",
  },
  {
    key: "win",
    os: "Windows",
    Icon: IconWindows,
    file: "NSIS installer",
    requires: "Windows 10 / 11 · x64",
    unblock: 'First open: SmartScreen → "More info" → "Run anyway".',
  },
  {
    key: "linux",
    os: "Linux",
    Icon: IconLinux,
    file: "AppImage",
    requires: "Most modern distros · x64",
    unblock: "No prompt — chmod +x and run.",
  },
];

/** "Download for macOS" etc., shown only on the matching OS. */
export async function DownloadCta() {
  const release = await getLatestRelease();

  return (
    <span className="dl-cta-group">
      {PLATFORMS.map(({ key, os }) => {
        const asset = release.assets[key];
        return (
          <a
            key={key}
            className={`btn btn--primary btn--lg dl-cta dl-cta--${key}`}
            href={downloadHref(release, key)}
            {...(asset ? {} : { target: "_blank", rel: "noreferrer" })}
          >
            <IconDownload />
            <span className="dl-cta__text">
              Download for {os}
              <span className="dl-cta__sub">
                v{release.version}
                {asset ? ` · ${asset.size}` : ""}
              </span>
            </span>
          </a>
        );
      })}

      {/* Fallback when the OS is unknown (JS off, mobile, unrecognised UA). */}
      <a className="btn btn--primary btn--lg dl-cta dl-cta--any" href="#download">
        <IconDownload />
        <span className="dl-cta__text">
          Download
          <span className="dl-cta__sub">v{release.version} · mac · win · linux</span>
        </span>
      </a>
    </span>
  );
}

/** Version + publish date, for a section label. */
export async function ReleaseTag() {
  const release = await getLatestRelease();
  return (
    <>
      v{release.version}
      {release.published ? ` · ${release.published}` : ""}
    </>
  );
}

/** Bare version string, for the footer metadata block. */
export async function ReleaseVersion() {
  const { version } = await getLatestRelease();
  return <>{version}</>;
}

/**
 * Installer downloads across every release. Rendered only when GitHub actually
 * answered — a zero from a failed fetch would read as "nobody wants this", which
 * is a worse lie than showing nothing.
 */
export async function DownloadStats() {
  const { total, byPlatform, unavailable, partial } = await getDownloadStats();
  if (unavailable || total === 0) return null;

  return (
    <div className="dl-stats">
      <span className="dl-stats__total">
        <b>
          {formatCount(total)}
          {partial ? "+" : ""}
        </b>
        <span className="lbl">installer download{total === 1 ? "" : "s"}</span>
      </span>
      <span className="dl-stats__split">
        <span>macOS {formatCount(byPlatform.mac)}</span>
        <span>Windows {formatCount(byPlatform.win)}</span>
        <span>Linux {formatCount(byPlatform.linux)}</span>
      </span>
    </div>
  );
}

/** Compact total for the hero metadata strip. Renders nothing if unavailable. */
export async function DownloadCount() {
  const { total, unavailable, partial } = await getDownloadStats();
  if (unavailable || total === 0) return null;
  return (
    <span>
      <b>
        {formatCount(total)}
        {partial ? "+" : ""}
      </b>{" "}
      downloads
    </span>
  );
}

function Row({ meta, release }: { meta: PlatformMeta; release: Release }) {
  const { key, os, Icon, file, requires } = meta;
  const asset = release.assets[key];
  const portable = key === "win" ? release.assets.winPortable : undefined;
  // Without a direct asset we link the releases page, which opens in a new tab.
  const external = asset ? {} : { target: "_blank" as const, rel: "noreferrer" };

  return (
    <div className={`dl dl--${key}`}>
      <div className="dl__os">
        <Icon />
        <h3>{os}</h3>
      </div>

      <div className="dl__file">
        {file} · {requires}
        <span>{asset ? `${asset.filename} · ${asset.size}` : "see releases"}</span>
      </div>

      <div className="dl__actions">
        <span className="dl__badge">Your system</span>
        {portable ? (
          <a className="dl__alt" href={portable.url}>
            portable .exe
          </a>
        ) : null}
        <a className="btn" href={downloadHref(release, key)} {...external}>
          <IconDownload />
          Download
        </a>
      </div>
    </div>
  );
}

/** The three platform rows, plus the first-launch notes. */
export async function DownloadGrid() {
  const release = await getLatestRelease();
  return (
    <>
      <div className="downloads">
        {PLATFORMS.map((meta) => (
          <Row key={meta.key} meta={meta} release={release} />
        ))}
      </div>

      <div className="notes">
        {PLATFORMS.map(({ key, os, unblock }) => (
          <div className="note" key={key}>
            <span className="lbl">{os}</span>
            <p>
              {unblock}
              {key === "mac" ? (
                <>
                  {" "}
                  <code>xattr -dr com.apple.quarantine /Applications/claudget.app</code>
                </>
              ) : null}
            </p>
          </div>
        ))}
        <div className="note">
          <span className="lbl">Why</span>
          <p>
            The builds aren&apos;t paid-signed by Apple or Microsoft — claudget is
            free and open source. The override is one-time, and the source is on
            GitHub to read.
          </p>
        </div>
      </div>
    </>
  );
}
