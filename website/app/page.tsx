import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Shell from "./components/Shell";
import MacArch from "./components/MacArch";
import SurfacePicker from "./components/SurfacePicker";
import { DownloadCta, DownloadGrid, InstallNotes, ReleaseMeta } from "./components/Download";
import { MenuBar, Scene, Taskbar, TerminalWindow } from "./components/ui/Desktop";
import { Popover } from "./components/ui/Popover";
import { Pill } from "./components/ui/Pill";
import { FloatBar } from "./components/ui/FloatBar";
import { Dashboard } from "./components/ui/Dashboard";
import { Notice } from "./components/ui/Notice";
import { SettingsWindow } from "./components/ui/Settings";
import { Limit } from "./components/ui/Limit";
import { FIVE_HOUR } from "./components/ui/demo";
import { IconArrowRight } from "./icons";
import { LICENSE_URL, MAKER_EMAIL, MAKER_NAME, REPO_URL } from "./constants";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

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
    desc: "Floats above every window and shows the limit you’ve used most.",
    stage: (
      <Scene
        className="scene--stage"
        label="The floating pill: the 5-hour limit at 78% in amber, 1 hour 50 minutes until it resets."
      >
        <div className="stage__pill">
          <Pill label="5-hour" pct={78} reset="1h 50m" />
        </div>
      </Scene>
    ),
  },
  {
    id: "bar",
    name: "Floating bar",
    desc: "A resizable strip that stays on top, next to your editor.",
    stage: (
      <Scene
        className="scene--stage"
        label="The floating bar: the 5-hour limit 62% used and full by 4:01 PM at this pace, the weekly limit 31% used, and 26 million tokens today."
      >
        <div className="stage-fit">
          <div className="stage-fit__inner">
            <FloatBar />
          </div>
        </div>
      </Scene>
    ),
  },
  {
    id: "dashboard",
    name: "Dashboard",
    desc: "Limit history, your heaviest sessions, and what your usage would cost at API prices.",
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
              Built because I kept switching to a terminal to check whether I was near my limit.
              Now it’s just there.
            </p>
          </div>
          <nav className="footer__links" aria-label="Project links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
              Issues
            </a>
            <a href={LICENSE_URL} target="_blank" rel="noreferrer">
              MIT license
            </a>
            <a href={`mailto:${MAKER_EMAIL}`}>Email</a>
          </nav>
        </div>
        <div className="footer__base">
          <span>claudget</span>
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
          <h1 id="hero-title" className="hero__title">
            <span className="sr-only">claudget: </span>
            See your Claude&nbsp;Code limits before you hit&nbsp;them.
          </h1>
          <p className="hero__lede">
            Your 5-hour and weekly limits in the <TrayName />: how much you’ve used, when they
            reset, and when you’ll run out.
          </p>
          <div className="hero__actions">
            <DownloadCta />
            <a className="more" href={REPO_URL} target="_blank" rel="noreferrer">
              View on GitHub
              <IconArrowRight />
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

      {/* ============ PACE + ALERTS ============ */}
      <section id="pace" className="wrap sec" aria-labelledby="pace-title">
        <div className="sec__head">
          <h2 id="pace-title" className="sec__title">
            Know when you’ll run out
          </h2>
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
              <p className="callout callout--tick" aria-hidden>
                Half the window has passed
              </p>
              <p className="callout callout--full" aria-hidden>
                When you’ll hit the limit, at this pace
              </p>
            </div>
          </figure>
          <div className="alerts">
            <Scene
              className="scene--bare"
              label="Two notifications from claudget: 5-hour limit almost gone, 5% left, resets in 38 minutes; and earlier, 5-hour limit at 80%, 20% left."
            >
              <div className="stage__notices">
                <Notice title="5-hour limit almost gone" body="5% left · resets in 38m" when="now" />
                <Notice
                  title="5-hour limit at 80%"
                  body="20% left · resets in 1h 12m"
                  when="34m ago"
                />
              </div>
            </Scene>
            <p className="caption">Alerts at 80% and 95%. Change them in Settings.</p>
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="wrap sec" aria-labelledby="features-title">
        <div className="sec__head sec__head--center">
          <h2 id="features-title" className="sec__title">
            Keep your limits in view
          </h2>
        </div>
        <SurfacePicker surfaces={SURFACES} />
      </section>

      {/* ============ PRIVACY ============ */}
      <section id="privacy" className="wrap sec" aria-labelledby="privacy-title">
        <div className="privacy">
          <h2 id="privacy-title" className="sec__title privacy__title">
            Where the numbers come from
          </h2>
          <dl className="facts">
            <div>
              <dt>Usage</dt>
              <dd>
                Counted from the files Claude&nbsp;Code keeps in <code>~/.claude</code>. Works
                offline.
              </dd>
            </div>
            <div>
              <dt>Limits</dt>
              <dd>
                From Anthropic’s usage endpoint, with the login Claude&nbsp;Code already stored.
                Turn off Track plan limits to stay fully local.
              </dd>
            </div>
            <div>
              <dt>Nothing else</dt>
              <dd>
                claudget never writes to <code>~/.claude</code>, never logs your token, and sends
                no analytics. On Windows and Linux it checks GitHub for updates.
              </dd>
            </div>
          </dl>
          <Scene
            className="scene--bare privacy__mock"
            label="claudget’s Settings, Data tab: Track plan limits is on and checks every 5 minutes; the Claude folder is read only."
          >
            <SettingsWindow />
          </Scene>
        </div>
      </section>

      {/* ============ DOWNLOAD ============ */}
      <section id="download" className="wrap sec" aria-labelledby="download-title">
        <div className="dl-head">
          <h2 id="download-title" className="sec__title">
            Download
          </h2>
          <ReleaseMeta />
        </div>
        <DownloadGrid />
        <InstallNotes />
      </section>
    </Shell>
  );
}
