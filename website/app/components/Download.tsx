import { IconApple, IconWindows, IconLinux, IconDownload } from "../icons";
import { RELEASES_URL } from "../constants";
import {
  downloadHref,
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
  /** Short description of the artifact. */
  file: string;
  requires: string;
  unblock: string;
}

const PLATFORMS: PlatformMeta[] = [
  {
    key: "mac",
    os: "macOS",
    Icon: IconApple,
    file: "Universal .dmg · drag to Applications",
    requires: "11 Big Sur+ · Intel & Apple Silicon",
    unblock:
      "Unsigned, so macOS blocks the first launch. Drag to Applications, then run the xattr command below.",
  },
  {
    key: "win",
    os: "Windows",
    Icon: IconWindows,
    file: "NSIS installer · choose your folder",
    requires: "Windows 10 / 11 · x64",
    unblock: 'First open: SmartScreen → "More info" → "Run anyway".',
  },
  {
    key: "linux",
    os: "Linux",
    Icon: IconLinux,
    file: "AppImage · chmod +x and run",
    requires: "Most modern distros · x64",
    unblock: "No prompt — just chmod +x and run.",
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
                {asset ? ` · ${asset.size}` : ""} · free
              </span>
            </span>
          </a>
        );
      })}

      {/* Fallback when the OS is unknown (JS off, mobile, unrecognised UA). */}
      <a className="btn btn--primary btn--lg dl-cta dl-cta--any" href="#download">
        <IconDownload />
        <span className="dl-cta__text">
          Download free
          <span className="dl-cta__sub">v{release.version} · macOS, Windows, Linux</span>
        </span>
      </a>
    </span>
  );
}

/** Version pill for the Download section header. */
export async function ReleaseTag() {
  const release = await getLatestRelease();
  return (
    <a
      className="box__meta box__meta--link"
      href={RELEASES_URL}
      target="_blank"
      rel="noreferrer"
    >
      v{release.version}
      {release.published ? ` · ${release.published}` : ""} · all releases →
    </a>
  );
}

function Card({ meta, release }: { meta: PlatformMeta; release: Release }) {
  const { key, os, Icon, file, requires, unblock } = meta;
  const asset = release.assets[key];
  const portable = key === "win" ? release.assets.winPortable : undefined;
  // Without a direct asset we link the releases page, which opens in a new tab.
  const external = asset ? {} : { target: "_blank" as const, rel: "noreferrer" };

  return (
    <div className={`dl dl--${key}`}>
      <span className="dl__badge">Your system</span>

      <div className="dl__os">
        <Icon />
        <h3>{os}</h3>
      </div>

      <div className="dl__file">
        {file}
        <br />
        <span style={{ color: "var(--muted)" }}>{requires}</span>
      </div>

      <a className="btn btn--primary" href={downloadHref(release, key)} {...external}>
        <IconDownload />
        Download{asset ? ` · ${asset.size}` : ""}
      </a>

      {asset ? (
        <div className="dl__filename" title={asset.filename}>
          {asset.filename}
        </div>
      ) : null}

      {portable ? (
        <a className="dl__alt" href={portable.url}>
          or portable .exe · {portable.size} — no install
        </a>
      ) : null}

      <div className="dl__unblock">{unblock}</div>
    </div>
  );
}

/** The three platform cards. */
export async function DownloadGrid() {
  const release = await getLatestRelease();
  return (
    <div className="downloads">
      {PLATFORMS.map((meta) => (
        <Card key={meta.key} meta={meta} release={release} />
      ))}
    </div>
  );
}
