import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ThemeToggle from "../../components/ThemeToggle";
import StartDownload from "../../components/StartDownload";
import { Command, PLATFORMS, XATTR } from "../../components/Download";
import { IconArrowRight } from "../../icons";
import { BUILDS, downloadHref, getLatestRelease, type Build } from "../../lib/release";

/* /get/<build>: one page per installer the site offers. Every download button
   links here rather than to the file, so that this page's view, which Vercel
   Web Analytics counts on the Hobby plan, is the click count (custom events
   are not on Hobby). The page then starts the download itself and stays up
   with the first-launch steps. Not indexed, and not in the sitemap. */

export const dynamicParams = false;

export function generateStaticParams() {
  return BUILDS.map((b) => ({ build: b.slug }));
}

function findBuild(slug: string): Build | undefined {
  return BUILDS.find((b) => b.slug === slug);
}

type Props = { params: Promise<{ build: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const build = findBuild((await params).build);
  if (!build) return {};
  return {
    title: `Download claudget for ${build.label}`,
    robots: { index: false, follow: true },
  };
}

const SMARTSCREEN = PLATFORMS.find((p) => p.key === "win")?.unblock ?? "";
const MAC_UNBLOCK = PLATFORMS.find((p) => p.key === "mac")?.unblock ?? "";

/** The first launch, for this build only. Commands name the actual file. */
function FirstLaunch({ build, filename }: { build: Build; filename: string | null }) {
  if (build.os === "mac") {
    return (
      <>
        <p>{MAC_UNBLOCK}</p>
        <Command text={XATTR} what="Terminal command" />
      </>
    );
  }
  if (build.os === "win") {
    return <p>{SMARTSCREEN}</p>;
  }
  if (build.key === "linuxDeb") {
    return (
      <>
        <p>Install it with apt, from the folder you saved it to:</p>
        <Command
          text={`sudo apt install ./${filename ?? "claudget-*-amd64.deb"}`}
          what="Install command"
        />
      </>
    );
  }
  const file = filename ?? "claudget-*.AppImage";
  return (
    <>
      <p>Make the AppImage executable, then run it, from the folder you saved it to:</p>
      <Command text={`chmod +x ./${file} && ./${file}`} what="Terminal command" />
    </>
  );
}

export default async function GetPage({ params }: Props) {
  const build = findBuild((await params).build);
  if (!build) notFound();

  const release = await getLatestRelease();
  const asset = release.assets[build.key];
  // Without the file (an older release, or GitHub unreadable at build time)
  // this is the releases page, which always has something to download.
  const href = downloadHref(release, build.key);

  return (
    <div className="shell">
      {/* With JS off, the browser starts the download itself, a beat later. */}
      <noscript>
        <meta httpEquiv="refresh" content={`2;url=${href}`} />
      </noscript>
      <StartDownload href={href} />

      <header className="header">
        <div className="wrap header__inner get__bar">
          <a href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="" width={26} height={26} />
            claudget
          </a>
          <div className="header__right get__theme">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="wrap get">
        <div className="get__head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="get__icon"
            src="/app-icon.png"
            srcSet="/app-icon.png 1x, /app-icon-192.png 2x"
            alt=""
            width={64}
            height={64}
          />
          <h1 className="get__title">
            {asset ? (
              <>Downloading claudget for {build.label}…</>
            ) : (
              <>Opening the latest claudget release…</>
            )}
          </h1>
          {asset ? (
            <p className="get__file">
              <code>{asset.filename}</code>
              <span aria-hidden="true"> · </span>
              <span>{asset.size}</span>
            </p>
          ) : (
            <p className="get__file">
              The {build.label} build is on the release page on GitHub.
            </p>
          )}
          <p className="get__direct">
            {asset ? "Didn’t start? " : "Didn’t open? "}
            <a href={href}>{asset ? "Download directly" : "Go to the release"}</a>
          </p>
        </div>

        <section className="get__steps" aria-labelledby="first-launch">
          <h2 id="first-launch" className="get__steps-title">
            First launch
          </h2>
          <FirstLaunch build={build} filename={asset?.filename ?? null} />
        </section>

        <a className="more get__back" href="/">
          <IconArrowRight />
          Back to claudget
        </a>
      </main>
    </div>
  );
}
