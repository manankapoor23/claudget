import { IconApple, IconWindows, IconLinux, IconDownload } from "../icons";
import CopyButton from "./CopyButton";
import {
  MAC_VARIANTS,
  REPO_URL,
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
  /** What the first launch asks of you, on this platform. */
  unblock: string;
}

const XATTR = "xattr -dr com.apple.quarantine /Applications/claudget.app";
const BUILD = `git clone ${REPO_URL}\ncd claudget\nnpm install\nnpm run package`;

const PLATFORMS: PlatformMeta[] = [
  {
    key: "mac",
    os: "macOS",
    Icon: IconApple,
    file: "Universal .dmg",
    requires: "macOS 12 Monterey or later",
    unblock:
      "The app isn’t signed or notarized by Apple, so the first launch is blocked. Drag it to Applications, then run this in Terminal:",
  },
  {
    key: "win",
    os: "Windows",
    Icon: IconWindows,
    file: "Installer",
    requires: "Windows 10 or 11, x64",
    unblock: "SmartScreen warns you the first time. Choose “More info”, then “Run anyway”.",
  },
  {
    key: "linux",
    os: "Linux",
    Icon: IconLinux,
    file: "AppImage",
    requires: "x64, most distributions",
    unblock: "There’s no prompt. Make the AppImage executable (chmod +x) and run it.",
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
            Download for {os}
            {/* MacArch rewrites this when it swaps in a per-arch build. */}
            {asset ? (
              <span className="dl-cta__size" data-arch-size="">
                {asset.size}
              </span>
            ) : null}
          </a>
        );
      })}

      {/* Fallback when the OS is unknown (JS off, mobile, unrecognised UA). */}
      <a className="btn btn--primary btn--lg dl-cta dl-cta--any" href="#download">
        <IconDownload />
        Download
        <span className="dl-cta__size">macOS, Windows, Linux</span>
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

/** Bare version string. */
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

  // Each figure stays with its platform when the line wraps.
  return (
    <p className="dl-stats">
      <span>
        <b>
          {formatCount(total)}
          {partial ? "+" : ""}
        </b>{" "}
        installer download{total === 1 ? "" : "s"}
      </span>
      <span>macOS {formatCount(byPlatform.mac)}</span>
      <span>Windows {formatCount(byPlatform.win)}</span>
      <span>Linux {formatCount(byPlatform.linux)}</span>
    </p>
  );
}

/** Compact total for the hero line. Renders nothing if unavailable. */
export async function DownloadCount() {
  const { total, unavailable, partial } = await getDownloadStats();
  if (unavailable || total === 0) return null;
  return (
    <span>
      {formatCount(total)}
      {partial ? "+" : ""} downloads
    </span>
  );
}

/**
 * One row per downloadable artifact. macOS contributes three (universal +
 * per-arch); `variant` carries the sub-label and suppresses the repeated OS name
 * so the group reads as one block rather than "macOS" three times.
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
            {variant.lead ? `, ${requires}` : ""}
          </>
        ) : (
          <>
            <b>{file}</b> · {requires}
          </>
        )}
        <span>{asset ? `${asset.filename} · ${asset.size}` : "See the releases page"}</span>
      </div>

      <div className="dl__actions">
        <span className="dl__badge">For this computer</span>
        {portable ? (
          <a
            className="dl__alt"
            href={portable.url}
            aria-label={`Download the portable .exe for ${os}`}
          >
            Portable .exe
          </a>
        ) : null}
        {/* Every row's visible label is just "Download", so without this a
            screen reader reading the link list hears the same name five times
            and can't tell the platforms apart. */}
        <a
          className="btn btn--sm dl__get"
          href={downloadHref(release, key)}
          aria-label={`Download claudget ${release.version} for ${os}${
            variant ? ` — ${variant.label}` : ""
          }`}
          {...external}
        >
          <IconDownload />
          Download
        </a>
      </div>
    </div>
  );
}

/** The platform rows. */
export async function DownloadGrid() {
  const release = await getLatestRelease();
  return (
    <div className="downloads">
      {PLATFORMS.map((meta) => {
        // Older releases only shipped the universal dmg — fall back to a
        // single row rather than rendering rows with no asset behind them.
        const macSplit =
          meta.key === "mac" && release.assets.macArm64 && release.assets.macX64;

        if (!macSplit) return <Row key={meta.key} meta={meta} release={release} />;

        return MAC_VARIANTS.map((v, i) => (
          <Row key={v.key} meta={meta} release={release} variant={{ ...v, lead: i === 0 }} />
        ));
      })}
    </div>
  );
}

/** A shell command, selectable as one piece, with a copy button. */
function Command({ text, what }: { text: string; what: string }) {
  return (
    <div className="cmd">
      {/* A named region: focusable so the keyboard can scroll a long line. */}
      <pre tabIndex={0} role="region" aria-label={what}>
        <code>{text}</code>
      </pre>
      <CopyButton text={text} what={what} />
    </div>
  );
}

/**
 * What the first launch asks of you — only your own platform's step when the
 * page knows it (data-os, set before paint), all three when it doesn't — then
 * everything else behind one disclosure.
 */
export function InstallNotes() {
  return (
    <div className="install">
      <h3 className="install__title">First launch</h3>
      {PLATFORMS.map(({ key, os, unblock }) => (
        <div key={key} className={`install__note install__note--${key}`}>
          <p>
            <b>{os}.</b> {unblock}
          </p>
          {key === "mac" ? <Command text={XATTR} what="Terminal command" /> : null}
        </div>
      ))}

      <details className="install__more">
        <summary>Which Mac build, why it isn’t signed, updates, and building from source</summary>
        <dl className="notes">
          <dt>Which Mac</dt>
          <dd>
            Universal runs on any Mac with macOS 12 or later. The chip-specific builds are about
            half the size: Apple Silicon for M1 and later, Intel for Macs with an Intel processor.
            If you’re not sure, take Universal.
          </dd>
          <dt>Why it isn’t signed</dt>
          <dd>
            Code signing costs money every year on both platforms: Apple’s developer program on
            the Mac, a signing certificate on Windows. claudget is free, so you allow it once per
            download instead. The source is on GitHub, and every release is built from it by
            GitHub Actions.
          </dd>
          <dt>Updates</dt>
          <dd>
            Windows and Linux builds update themselves. On a Mac, download new versions from this
            page.
          </dd>
          <dt>Build from source</dt>
          <dd>
            Needs Node.js 20 or later. The installer lands in <code>packages/desktop/release</code>.
            <Command text={BUILD} what="build commands" />
          </dd>
        </dl>
      </details>
    </div>
  );
}
