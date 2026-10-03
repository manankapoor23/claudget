import { IconApple, IconWindows, IconLinux, IconDownload, IconArrowRight } from "../icons";
import CopyButton from "./CopyButton";
import {
  MAC_VARIANTS,
  REPO_URL,
  downloadHref,
  getLatestRelease,
  type PlatformKey,
  type Release,
} from "../lib/release";

/* Everything here is server-rendered: all three platforms are always in the DOM
   (good for SEO, works with JS off). The visitor's own platform is promoted
   purely in CSS via the `data-os` hint that layout.tsx sets before first paint,
   so there is no spinner, no hydration swap and no layout jank. */

type Os = "mac" | "win" | "linux";

interface PlatformMeta {
  key: Os;
  os: string;
  Icon: typeof IconApple;
  requires: string;
  /** What the first launch asks of you, on this platform. */
  unblock: string;
}

const XATTR = "xattr -dr com.apple.quarantine /Applications/claudget.app";
const ALL_RELEASES_URL = `${REPO_URL}/releases`;
const BUILD_URL = `${REPO_URL}#building-from-source`;

const PLATFORMS: PlatformMeta[] = [
  {
    key: "mac",
    os: "macOS",
    Icon: IconApple,
    requires: "macOS 12 or later",
    unblock:
      "macOS blocks apps that Apple hasn’t notarized. Move claudget to Applications, then run this in Terminal:",
  },
  {
    key: "win",
    os: "Windows",
    Icon: IconWindows,
    requires: "Windows 10 or 11, x64",
    unblock: "SmartScreen warns you once. Choose More info, then Run anyway.",
  },
  {
    key: "linux",
    os: "Linux",
    Icon: IconLinux,
    requires: "AppImage · x64",
    unblock: "Make the AppImage executable (chmod +x), then run it.",
  },
];

/**
 * macOS ships three builds. The universal one is rendered — always correct, and
 * correct with JS off — and MacArch swaps in the smaller per-arch build (href
 * and size label) only when it can prove which arch this is.
 */
function archSwap(release: Release, key: Os) {
  const arm = key === "mac" ? release.assets.macArm64 : undefined;
  const x64 = key === "mac" ? release.assets.macX64 : undefined;
  return arm && x64
    ? {
        "data-arch-swap": "",
        "data-href-arm64": arm.url,
        "data-size-arm64": arm.size,
        "data-href-x64": x64.url,
        "data-size-x64": x64.size,
      }
    : {};
}

/** Without a direct asset the link goes to the releases page, in a new tab. */
function external(release: Release, key: PlatformKey) {
  return release.assets[key] ? {} : { target: "_blank", rel: "noreferrer" };
}

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
            {...external(release, key)}
            {...archSwap(release, key)}
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
      </a>
    </span>
  );
}

/** Version and date, then what the release is about, for the section head. */
export async function ReleaseMeta() {
  const release = await getLatestRelease();
  return (
    <div className="dl-meta">
      <p>
        v{release.version}
        {release.published ? ` · ${release.published}` : ""}
      </p>
      <p>
        {release.title ? (
          <>
            New:{" "}
            <a href={release.url} target="_blank" rel="noreferrer">
              {release.title}
            </a>{" "}
            ·{" "}
          </>
        ) : null}
        <a className="more" href={ALL_RELEASES_URL} target="_blank" rel="noreferrer">
          All releases
          <IconArrowRight />
        </a>
      </p>
    </div>
  );
}

/** One row per platform. The visitor's own gets the filled ink button (CSS, data-os). */
function Row({ meta, release }: { meta: PlatformMeta; release: Release }) {
  const { key, os, Icon, requires } = meta;
  const asset = release.assets[key];
  const portable = key === "win" ? release.assets.winPortable : undefined;
  const macBuilds =
    key === "mac" && release.assets.macArm64 && release.assets.macX64 ? MAC_VARIANTS : [];

  return (
    <div className={`dl dl--${key}`}>
      <div className="dl__os">
        <Icon />
        <h3>{os}</h3>
      </div>
      <p className="dl__req">{requires}</p>
      <div className="dl__actions">
        {/* Every row's visible label is just "Download", so without this a
            screen reader reading the link list can't tell the platforms apart. */}
        <a
          className="btn dl__get"
          href={downloadHref(release, key)}
          aria-label={`Download claudget ${release.version} for ${os}`}
          {...external(release, key)}
          {...archSwap(release, key)}
        >
          <IconDownload />
          Download
          {asset ? (
            <span className="dl-cta__size" data-arch-size="">
              {asset.size}
            </span>
          ) : null}
        </a>
        {macBuilds.length > 0 || portable ? (
          <p className="dl__alts">
            {macBuilds.map((v, i) => (
              <span key={v.key}>
                {i > 0 ? " · " : ""}
                <a
                  href={downloadHref(release, v.key)}
                  aria-label={`Download the ${v.label} build for macOS`}
                >
                  {v.label}
                </a>
              </span>
            ))}
            {portable ? (
              <a href={portable.url} aria-label="Download the portable .exe for Windows">
                Portable .exe
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The platform rows. */
export async function DownloadGrid() {
  const release = await getLatestRelease();
  return (
    <div className="downloads">
      {PLATFORMS.map((meta) => (
        <Row key={meta.key} meta={meta} release={release} />
      ))}
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
 * the why behind one disclosure.
 */
export function InstallNotes() {
  return (
    <div className="install">
      <h3 className="install__title">First launch</h3>
      {PLATFORMS.map(({ key, os, unblock }) => (
        <div key={key} className={`install__note install__note--${key}`}>
          <h4 className="install__os">{os}</h4>
          <p>{unblock}</p>
          {key === "mac" ? <Command text={XATTR} what="Terminal command" /> : null}
        </div>
      ))}

      <details className="install__more">
        <summary>Unsigned builds and updates</summary>
        <p>
          claudget isn’t signed because Apple and Microsoft charge a yearly fee for it. Every
          release is built from the public source by GitHub Actions.
        </p>
        <p>
          The Windows installer and the Linux AppImage update themselves. On a Mac, or with the
          Portable .exe, download new versions here.
        </p>
        <a className="more" href={BUILD_URL} target="_blank" rel="noreferrer">
          Build from source on GitHub
          <IconArrowRight />
        </a>
      </details>
    </div>
  );
}
