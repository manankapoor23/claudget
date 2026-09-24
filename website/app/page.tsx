import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Shell from "./components/Shell";
import { Changelog } from "./components/Changelog";
import MacArch from "./components/MacArch";
import SurfacePicker from "./components/SurfacePicker";
import {
  DownloadCta,
  DownloadGrid,
  DownloadStats,
  InstallNotes,
  ReleaseTag,
  ReleaseVersion,
} from "./components/Download";
import { MenuBar, Scene, Taskbar, TerminalWindow } from "./components/ui/Desktop";
import { Popover } from "./components/ui/Popover";
import { Pill } from "./components/ui/Pill";
import { FloatBar } from "./components/ui/FloatBar";
import { Dashboard } from "./components/ui/Dashboard";
import { Notice } from "./components/ui/Notice";
import { SettingsWindow } from "./components/ui/Settings";
import { Limit } from "./components/ui/Limit";
import { FIVE_HOUR } from "./components/ui/demo";
import { IconArrowRight, IconGitHub } from "./icons";
import { LICENSE_URL, MAKER_EMAIL, MAKER_NAME, MAKER_URL, REPO_URL } from "./constants";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const ALL_RELEASES_URL = `${REPO_URL}/releases`;

/**
 * "menu bar" on a Mac, "system tray" on Windows and Linux, and both when the
 * platform is unknown (phones, crawlers) — switched by the data-os hint.
 */
function TrayName() {
  return (
    <>
      <span className="tray-mac">menu bar</span>
      <span className="tray-or"> or </span>
      <span className="tray-other">system tray</span>
    </>
  );
}

const SURFACES = [
  {
    id: "pill",
    name: "Floating pill",
    desc: "One line that floats above your windows: the limit you’ve used most and the time until it resets. Its ring turns amber, then red, as you get close.",
    stage: (
      <Scene
        className="scene--stage scene--over"
        label="The floating pill over a terminal: the 5-hour limit at 78% in amber, 1 hour 50 minutes until it resets."
      >
        <div className="stage__window">
          <TerminalWindow className="term--backdrop" />
          <div className="stage__float stage__float--pill">
            <Pill label="5-hour" pct={78} reset="1h 50m" />
          </div>
        </div>
      </Scene>
    ),
  },
  {
    id: "bar",
    name: "Floating bar",
    desc: "Both limits with their pace ticks, plus today’s tokens, in a resizable strip that stays on top next to your editor.",
    stage: (
      <Scene
        className="scene--stage scene--over"
        label="The floating bar above a terminal: the 5-hour limit 62% used and full by 4:01 PM at this pace, the weekly limit 31% used, and 26 million tokens today."
      >
        <div className="stage__window">
          <TerminalWindow className="term--backdrop" />
          <div className="stage__float stage__float--bar">
            <div className="stage-fit">
              <div className="stage-fit__inner">
                <FloatBar />
              </div>
            </div>
          </div>
        </div>
      </Scene>
    ),
  },
  {
    id: "dashboard",
    name: "Dashboard",
    desc: "How close each recent window came to the limit, how often you hit it, and your heaviest sessions, plus an estimate at API prices.",
    stage: (
      <Scene
        className="scene--stage"
        label="The claudget dashboard’s Overview: both limits, tokens per hour for the last 24 hours, the top sessions and the limit history."
      >
        <div className="stage-fit">
          <div className="stage-fit__inner">
            <Dashboard />
          </div>
        </div>
      </Scene>
    ),
  },
];

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div className="maker">
            <h2>Made by {MAKER_NAME}</h2>
            <p>
              Built because I kept alt-tabbing to a terminal just to check whether I was about
              to hit my limit. Now it’s just there.
            </p>
            <p>MIT licensed and developed in the open. Issues and pull requests are welcome.</p>
          </div>
          <nav className="footer__links" aria-label="Project links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={ALL_RELEASES_URL} target="_blank" rel="noreferrer">
              Releases
            </a>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
              Issues
            </a>
            <a href={LICENSE_URL} target="_blank" rel="noreferrer">
              MIT license
            </a>
            <a href={MAKER_URL} target="_blank" rel="noreferrer">
              @manankapoor23
            </a>
            <a href={`mailto:${MAKER_EMAIL}`}>Email</a>
          </nav>
        </div>
        <div className="footer__base">
          <span className="footer__brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="" width={18} height={18} />
            claudget <ReleaseVersion />
          </span>
          <span>Not affiliated with Anthropic.</span>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <Shell footer={<Footer />}>
      <div id="top" />
      <MacArch />

      {/* ============ HERO ============ */}
      <section className="wrap hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          {/* The name stays inside the h1: it's the term people search for. */}
          <h1 id="hero-title">
            <span className="hero__app">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-icon.png" alt="" width={44} height={44} />
              claudget<span className="sr-only">:</span>
            </span>
            <span className="hero__title">
              See your Claude&nbsp;Code limits before you hit&nbsp;them.
            </span>
          </h1>
          <p className="hero__lede">
            claudget lives in your <TrayName />. Open it to see how much of your 5-hour and
            weekly limits you’ve used, when they reset, and when you’ll run out at this pace.
          </p>
          <div className="hero__actions">
            <DownloadCta />
            <a className="btn btn--lg" href={REPO_URL} target="_blank" rel="noreferrer">
              <IconGitHub />
              View on GitHub
            </a>
          </div>
          <p className="hero__meta">Free and open source · macOS, Windows and Linux</p>
        </div>

        <div className="hero__stage">
          <Scene
            className="scene--hero"
            label="claudget’s popover, opened from the menu bar or system tray: the 5-hour limit is 62% used and full by 4:01 PM at this pace, and the weekly limit is 31% used."
          >
            <MenuBar live />
            <Taskbar />
            <TerminalWindow />
            <div className="scene__pop">
              <Popover live />
            </div>
          </Scene>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="wrap sec" aria-labelledby="features-title">
        <div className="sec__head">
          <h2 id="features-title" className="sec__title">
            Keep as much on screen as you like
          </h2>
          <p className="sec__lede">Every view shows the same live numbers. Use one or all of them.</p>
        </div>
        <SurfacePicker surfaces={SURFACES} />
      </section>

      {/* ============ PACE + ALERTS ============ */}
      <section id="pace" className="wrap sec" aria-labelledby="pace-title">
        <div className="sec__head">
          <h2 id="pace-title" className="sec__title">
            Know when you’ll run out
          </h2>
          <p className="sec__lede">
            Each limit bar has a tick that marks how much of the window has passed. If your usage
            is past the tick, you’re ahead of pace, and claudget shows when you’ll hit the limit.
          </p>
        </div>
        <div className="pace">
          <figure className="anatomy">
            <figcaption className="sr-only">
              The 5-hour limit bar: 62% used, half of the window gone, 2 hours 30 minutes left,
              and full by {FIVE_HOUR.fullBy} at the pace so far.
            </figcaption>
            <div
              className="anatomy__row"
              style={{ "--tick": `${FIVE_HOUR.tick}%` } as CSSProperties}
            >
              <div className="ui" aria-hidden data-nosnippet="">
                <Limit limit={FIVE_HOUR} className="lim--xl" />
              </div>
              <p className="callout callout--used" aria-hidden>
                <b>62%</b> of your 5-hour limit used
              </p>
              <p className="callout callout--tick" aria-hidden>
                <b>Half</b> the window has passed
              </p>
              <p className="callout callout--full" aria-hidden>
                <b>When you’ll hit it</b>, at your pace so far
              </p>
            </div>
          </figure>
          <div className="alerts">
            <Scene
              className="scene--stage scene--alerts"
              label="Two notifications from claudget: 5-hour limit almost gone, 5% left, resets in 38 minutes; and earlier, 5-hour limit at 80%, 20% left."
            >
              <MenuBar compact />
              <Taskbar compact />
              <div className="stage__notices">
                <Notice title="5-hour limit almost gone" body="5% left · resets in 38m" when="now" />
                <Notice
                  title="5-hour limit at 80%"
                  body="20% left · resets in 1h 12m"
                  when="34m ago"
                />
              </div>
              <p className="stage__caption">Alerts at 80% and 95% by default. Change them in Settings.</p>
            </Scene>
          </div>
        </div>
      </section>

      {/* ============ PRIVACY ============ */}
      <section id="privacy" className="wrap sec" aria-labelledby="privacy-title">
        <div className="privacy">
          <div className="privacy__copy">
            <h2 id="privacy-title" className="sec__title">
              Where the numbers come from
            </h2>
            <p className="sec__lede">
              claudget reads two things, and you can switch one of them off.
            </p>
            <dl className="facts">
              <div>
                <dt>Your transcripts</dt>
                <dd>
                  Tokens, sessions and hourly activity are counted from the files Claude&nbsp;Code
                  writes in <code>~/.claude</code>. This part works offline.
                </dd>
              </div>
              <div>
                <dt>Your plan</dt>
                <dd>
                  Limits and reset times come from Anthropic’s usage endpoint, with the login
                  Claude&nbsp;Code already stored, every 5 minutes by default. Turn off “Track
                  plan limits” and claudget stops contacting Anthropic, though the limit bars and
                  alerts go with it.
                </dd>
              </div>
              <div>
                <dt>Read-only</dt>
                <dd>
                  It never writes to Claude&nbsp;Code’s folder or logs your token. The only other
                  connection is on Windows and Linux: an update check against GitHub Releases
                  every 6 hours, installed when you quit.
                </dd>
              </div>
            </dl>
          </div>
          <Scene
            className="scene--stage scene--settings"
            label="claudget’s Settings, Data tab: Track plan limits is on and checks every 5 minutes; the Claude folder is read only."
          >
            <SettingsWindow />
          </Scene>
        </div>
      </section>

      {/* ============ DOWNLOAD ============ */}
      <section id="download" className="wrap sec" aria-labelledby="download-title">
        <div className="dl-head">
          <div className="sec__head">
            <h2 id="download-title" className="sec__title sec__title--sm">
              Download
            </h2>
            <p className="sec__lede">Free under the MIT license, straight from GitHub Releases.</p>
          </div>
          <div className="dl-meta">
            <p className="dl-meta__ver">
              <ReleaseTag />
            </p>
            <DownloadStats />
          </div>
        </div>
        <DownloadGrid />
        <InstallNotes />
      </section>

      {/* ============ CHANGELOG ============ */}
      <section id="changelog" className="wrap sec" aria-labelledby="changelog-title">
        <div className="sec__head sec__head--row">
          <h2 id="changelog-title" className="sec__title sec__title--sm">
            Changelog
          </h2>
          <a className="more" href={ALL_RELEASES_URL} target="_blank" rel="noreferrer">
            All releases on GitHub
            <IconArrowRight />
          </a>
        </div>
        <Changelog />
      </section>
    </Shell>
  );
}
