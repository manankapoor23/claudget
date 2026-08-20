import { IconApple, IconWindows, IconLinux, IconDownload } from "../icons";
import {
  MAC_VARIANTS,
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
        // macOS ships three builds. Render the universal one — always correct,
        // and correct with JS off — and let MacArch swap in the smaller
        // per-arch build only when it can prove which arch this is.
        const arm = key === "mac" ? release.assets.macArm64 : undefined;
        const x64 = key === "mac" ? release.assets.macX64 : undefined;
        const archData =
          arm && x64
            ? {
                "data-arch-swap": "",
                "data-href-arm64": arm.url,
                "data-size-arm64": arm.size,
                "data-href-x64": x64.url,
                "data-size-x64": x64.size,
              }
            : {};

        return (
          <a
            key={key}
            className={`btn btn--primary btn--lg dl-cta dl-cta--${key}`}
            href={downloadHref(release, key)}
            {...(asset ? {} : { target: "_blank", rel: "noreferrer" })}
            {...archData}
          >
            <IconDownload />
            <span className="dl-cta__text">
              Download for {os}
              <span className="dl-cta__sub">
                v{release.version}
                {asset ? " · " : ""}
                {asset ? <span data-arch-size="">{asset.size}</span> : null}
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

/**
 * One row per downloadable artifact. macOS contributes three (universal +
 * per-arch); `variant` carries the sub-label and suppresses the repeated OS name
 * so the group reads as an indented block rather than "macOS" three times.
 */
function Row({
  meta,
  release,
  variant,
}: {
  meta: PlatformMeta;
  release: Release;
  variant?: { key: PlatformKey; label: string; hint: string; lead: boolean };
}) {
  const { os, Icon, file, requires } = meta;
  const key = variant ? variant.key : meta.key;
  const asset = release.assets[key];
  const portable = key === "win" ? release.assets.winPortable : undefined;
  // Without a direct asset we link the releases page, which opens in a new tab.
  const external = asset ? {} : { target: "_blank" as const, rel: "noreferrer" };

  return (
    <div className={`dl dl--${key}${variant && !variant.lead ? " dl--sub" : ""}`}>
      <div className="dl__os">
        {!variant || variant.lead ? (
          <>
            <Icon />
            <h3>{os}</h3>
          </>
        ) : null}
      </div>

      <div className="dl__file">
        {variant ? (
          <>
            <b>{variant.label}</b> · {variant.hint}
          </>
        ) : (
          <>
            {file} · {requires}
          </>
        )}
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
        {PLATFORMS.map((meta) => {
          // Older releases only shipped the universal dmg — fall back to a
          // single row rather than rendering rows with no asset behind them.
          const macSplit =
            meta.key === "mac" && release.assets.macArm64 && release.assets.macX64;

          if (!macSplit) return <Row key={meta.key} meta={meta} release={release} />;

          return MAC_VARIANTS.map((v, i) => (
            <Row
              key={v.key}
              meta={meta}
              release={release}
              variant={{ ...v, lead: i === 0 }}
            />
          ));
        })}
      </div>

      <div className="notes">
        <div className="note">
          <span className="lbl">Which Mac</span>
          <p>
            Universal runs on any Mac. The per-arch builds are about half the
            size — Apple Silicon for M1 and later, Intel for pre-2020 machines.
            If you&apos;re unsure, take Universal.
          </p>
        </div>
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
