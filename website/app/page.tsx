import type { Metadata } from "next";
import Shell from "./components/Shell";
import Footer from "./components/Footer";
import MacArch from "./components/MacArch";
import { DownloadCta, DownloadGrid, InstallNotes, ReleaseMeta } from "./components/Download";
import { Scene, TerminalWindow } from "./components/ui/Desktop";
import { Popover } from "./components/ui/Popover";
import { FloatBar } from "./components/ui/FloatBar";
import { Pill } from "./components/ui/Pill";
import { Dashboard } from "./components/ui/Dashboard";
import { Notice } from "./components/ui/Notice";
import { NotchMenuBar } from "./components/notch/NotchMenuBar";
import { Notch } from "./components/notch/Notch";
import { WinToast } from "./components/ui/WinToast";
import { TrayDesk } from "./components/home/TrayDesk";
import Alive from "./components/home/Alive";
import FloatingPill from "./components/home/FloatingPill";
import "./components/home/home.css";
import {
  GlyphBattery,
  GlyphChevronUp,
  GlyphTray,
  GlyphVolume,
  GlyphWifi,
  IconApple,
  IconArrowRight,
} from "./icons";
import { REPO_URL } from "./constants";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const NAV = [
  { id: "picture", label: "Features" },
  { id: "private", label: "Privacy" },
];

export default function Home() {
  return (
    <Shell footer={<Footer />} nav={NAV} headerClass="home-header">
      <div id="top" />
      <MacArch />

      {/* ============ HERO: the page wears the product ============
          On a Mac (and when the platform is unknown) the notch hangs from the
          header; on Windows and Linux the tray and its popover. One heading,
          its words switched by platform (globals.css, .os-mac/.os-other). */}
      <Alive>
        <div className="home-copy">
          <h1 id="hero-title" className="home-title">
            <span className="sr-only">claudget: </span>
            <span className="os-mac">The notch, now with your Claude&nbsp;Code&nbsp;limit.</span>
            <span className="os-other">
              Your Claude&nbsp;Code limit, one click from the&nbsp;tray.
            </span>
          </h1>
          <p className="home-lede os-mac">
            A line round your MacBook’s notch grows as you use your 5-hour limit.{" "}
            <span className="on-hover">Hover</span>
            <span className="on-touch">Tap</span> it for the details, click for everything.
          </p>
          <p className="home-lede os-other">
            Click claudget’s tray icon for both limits, when they reset and when you’ll run out.
            Alerts at 80% and 95%, and an optional pill or bar that stays on top.
          </p>
          <div className="home-actions">
            <DownloadCta />
            <a className="more" href={REPO_URL} target="_blank" rel="noreferrer">
              View on GitHub
              <IconArrowRight />
            </a>
          </div>
          <p className="home-meta">Free and open source · macOS, Windows and Linux</p>
          <p className="home-meta home-meta--note os-mac">
            The line needs a MacBook with a notch. On other Macs, both limits sit in the menu bar.
          </p>
        </div>
      </Alive>

      {/* ============ ON EVERY DESKTOP ============
          The visitor's own platform first (home.css, by data-os). */}
      <section id="desktops" className="home-sec home-desktops" aria-labelledby="desktops-title">
        <div className="wrap home-head" data-reveal="rise">
          <h2 id="desktops-title" className="home-h2">
            On every desktop.
          </h2>
        </div>
        <div className="wrap home-panes" data-reveal="">
          <figure className="home-pane home-pane--notch">
            <div
              className="home-pane__shot ui-dark"
              role="img"
              aria-label="A MacBook’s notch with an orange line 62% of the way round it."
            >
              <span className="home-pane__notch" aria-hidden="true">
                <Notch id="pane-notch" pct={62} estimated />
              </span>
            </div>
            <figcaption>
              <b>MacBook with a notch.</b> The line round the notch. Hover for the card, click for
              everything.
            </figcaption>
          </figure>
          <figure className="home-pane home-pane--mac">
            <div
              className="home-pane__shot ui-dark"
              role="img"
              aria-label="A Mac menu bar with claudget’s item: ~62% · 31%."
            >
              <span className="home-pane__menubar" aria-hidden="true">
                <IconApple width={13} height={13} />
                <span className="home-pane__spacer" />
                <span className="home-pane__item">
                  <GlyphTray width={15} height={15} />
                  ~62% · 31%
                </span>
                <GlyphWifi width={15} height={15} />
                <GlyphBattery width={23} height={12} />
                <span>Thu 2:30 PM</span>
              </span>
            </div>
            <figcaption>
              <b>Any Mac.</b> Both limits in the menu bar. Click for the popover.
            </figcaption>
          </figure>
          <figure className="home-pane home-pane--tray">
            <div
              className="home-pane__shot ui-dark"
              role="img"
              aria-label="A Windows taskbar tray with claudget’s icon, and the floating pill above it: 5-hour about 62%, 2 hours 30 minutes until it resets."
            >
              <span className="home-pane__pill" aria-hidden="true">
                <Pill label="5-hour" pct={62} estimated reset="2h 30m" />
              </span>
              <span className="home-pane__tray" aria-hidden="true">
                <GlyphChevronUp width={13} height={13} />
                <span className="tbi tbi--claudget">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/tray-logo.png" alt="" width={16} height={16} loading="lazy" />
                </span>
                <GlyphWifi width={14} height={14} />
                <GlyphVolume width={14} height={14} />
                <span className="home-pane__clock">
                  <span>2:30 PM</span>
                  <span>9/24/2026</span>
                </span>
              </span>
            </div>
            <figcaption>
              <b>Windows and Linux.</b> Click the tray icon for the popover. Turn on the pill or bar
              to keep your limit on top.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ============ THE WHOLE PICTURE ============ */}
      <section id="picture" className="home-sec" aria-labelledby="picture-title">
        <div className="wrap home-head" data-reveal="rise">
          <h2 id="picture-title" className="home-h2">
            Click for everything.
          </h2>
          <p className="home-sub os-mac">
            The card opens claudget: both limits against the clock, the last 24 hours hour by hour,
            and your busiest sessions.
          </p>
          <p className="home-sub os-other">
            Click the tray icon: both limits against the clock, the last 24 hours hour by hour, and
            your busiest sessions.
          </p>
        </div>
        <div className="wrap" data-reveal="rise">
          <TrayDesk
            className="home-screen home-screen--tray os-other"
            label="claudget’s tray icon pressed on a Windows or Linux taskbar and its popover open above it: the 5-hour limit about 62 percent used, estimated, and full by 4:01 PM at this pace; the weekly limit 31 percent used; 26 million tokens today, the last 24 hours hour by hour, and the busiest sessions."
          />
          <Scene
            className="home-screen home-screen--pop os-mac"
            label="A notched MacBook’s menu bar with claudget’s item pressed and its popover open: the 5-hour limit about 62 percent used, estimated, and full by 4:01 PM at this pace; the weekly limit 31 percent used; 26 million tokens today, the last 24 hours hour by hour, and the busiest sessions."
          >
            <div className="home-screen__bar">
              <NotchMenuBar id="home-pop" pressed still />
            </div>
            <TerminalWindow className="home-screen__term" />
            <div className="home-screen__pop">
              <Popover />
            </div>
          </Scene>
        </div>
      </section>

      {/* ============ STAYS ON TOP ============ */}
      <section id="on-top" className="home-sec" aria-labelledby="ontop-title">
        <div className="wrap home-head" data-reveal="rise">
          <h2 id="ontop-title" className="home-h2">
            Floats above your work.
          </h2>
          <p className="home-sub">
            A pill or a slim bar, on top of every window. It’s the same number — look, it’s floating
            over this page. On Windows and Linux, turn one on to keep your limit in view.
          </p>
        </div>
        <div className="wrap" data-reveal="rise">
          <Scene
            className="home-screen home-screen--top"
            label="A Claude Code session in the terminal with claudget’s floating bar pinned above it: 5-hour about 62 percent used, estimated, and full by 4:01 PM; weekly 31 percent used; 26 million tokens today. In the corner, the floating pill: 5-hour about 62%, 2 hours 30 minutes until it resets."
          >
            <TerminalWindow className="home-top__term" />
            <div className="home-top__bar">
              <FloatBar />
            </div>
            <div className="home-top__pill">
              <Pill label="5-hour" pct={62} estimated reset="2h 30m" />
            </div>
          </Scene>
        </div>
        <FloatingPill target="on-top" />
      </section>

      {/* ============ WARNS YOU ============ */}
      <section id="alerts" className="home-sec" aria-labelledby="alerts-title">
        <div className="wrap home-head" data-reveal="rise">
          <h2 id="alerts-title" className="home-h2">
            Speaks up at 80% and 95%.
          </h2>
          <p className="home-sub os-mac">
            The line turns amber at 70% and red at 90%, and a notification arrives before you hit
            the wall. Drag the slider up top and this page will tell you too.
          </p>
          <p className="home-sub os-other">
            The pill turns amber at 70% and red at 90%, and a notification arrives before you hit
            the wall. Drag the slider up top and this page will tell you too.
          </p>
        </div>
        <div className="wrap home-alerts os-other" data-reveal="">
          <figure
            className="home-alert"
            role="img"
            aria-label="The floating pill at 82% in amber, and a Windows notification from claudget: 5-hour limit at 80%, 18% left, resets in 1 hour 42 minutes."
          >
            <div className="home-alert__screen ui-dark" aria-hidden="true">
              <div className="home-alert__pill">
                <Pill label="5-hour" pct={82} estimated reset="1h 42m" />
              </div>
              <div className="home-alert__toast">
                <WinToast title="5-hour limit at 80%" body="18% left · resets in 1h 42m" />
              </div>
              <div className="home-alert__taskbar" />
            </div>
          </figure>
          <figure
            className="home-alert"
            role="img"
            aria-label="The floating pill at 96% in red, and a Windows notification from claudget: 5-hour limit almost gone, 4% left, resets in 1 hour 8 minutes."
          >
            <div className="home-alert__screen ui-dark" aria-hidden="true">
              <div className="home-alert__pill">
                <Pill label="5-hour" pct={96} estimated reset="1h 8m" />
              </div>
              <div className="home-alert__toast">
                <WinToast title="5-hour limit almost gone" body="4% left · resets in 1h 8m" />
              </div>
              <div className="home-alert__taskbar" />
            </div>
          </figure>
        </div>
        <div className="wrap home-alerts os-mac" data-reveal="">
          <figure
            className="home-alert"
            role="img"
            aria-label="The notch line at 82% in amber, with the notification: 5-hour limit at 80%, 18% left, resets in 1 hour 42 minutes."
          >
            <div className="home-alert__screen ui-dark" aria-hidden="true">
              <div className="home-alert__bar">
                <NotchMenuBar id="home-warn" pct={82} weekly={33} />
              </div>
              <div className="home-alert__notice">
                <Notice title="5-hour limit at 80%" body="18% left · resets in 1h 42m" when="now" />
              </div>
            </div>
          </figure>
          <figure
            className="home-alert"
            role="img"
            aria-label="The notch line at 96% in red, with the notification: 5-hour limit almost gone, 4% left, resets in 1 hour 8 minutes."
          >
            <div className="home-alert__screen ui-dark" aria-hidden="true">
              <div className="home-alert__bar">
                <NotchMenuBar id="home-bad" pct={96} weekly={34} />
              </div>
              <div className="home-alert__notice">
                <Notice
                  title="5-hour limit almost gone"
                  body="4% left · resets in 1h 8m"
                  when="now"
                />
              </div>
            </div>
          </figure>
        </div>
      </section>

      {/* ============ REMEMBERS ============ */}
      <section id="history" className="home-sec" aria-labelledby="hist-title">
        <div className="wrap home-head" data-reveal="rise">
          <h2 id="hist-title" className="home-h2">
            Remembers how close you came.
          </h2>
          <p className="home-sub">
            The dashboard keeps your limit history while claudget runs, your heaviest sessions, and
            what it would all have cost at API prices.
          </p>
        </div>
        <div className="wrap" data-reveal="rise">
          <Scene
            className="home-screen home-screen--dash"
            label="The claudget dashboard’s Overview: both limits, tokens per hour for the last 24 hours, the top sessions and the limit history, with the weekly limit hit once in six weeks."
          >
            <div className="home-dash">
              <Dashboard />
            </div>
          </Scene>
        </div>
      </section>

      {/* ============ PRIVATE ============ */}
      <section id="private" className="home-sec home-priv" aria-labelledby="priv-title">
        <div className="wrap home-priv__grid">
          <h2 id="priv-title" className="home-h2" data-reveal="rise">
            Stays on your machine.
          </h2>
          <div className="home-priv__facts" data-reveal="rise">
            <p>
              <b>
                Reads <code>~/.claude</code>, never writes to it.
              </b>{" "}
              Usage is counted from the files Claude&nbsp;Code already keeps, and works offline.
            </p>
            <p>
              <b>Limits come from Anthropic</b>, with the login Claude&nbsp;Code already stored.
              Turn that off and claudget only counts from your files, without the line or the
              limits.
            </p>
            <p>
              <b>Nothing else leaves</b>, apart from a check for new versions on GitHub.
              The app has no analytics, no account, and never logs your token.
            </p>
          </div>
        </div>
      </section>

      {/* ============ DOWNLOAD ============ */}
      <section id="download" className="home-sec" aria-labelledby="download-title">
        <div className="wrap">
          <div className="dl-head">
            <h2 id="download-title" className="home-h2">
              Free and open source.
            </h2>
            <ReleaseMeta />
          </div>
          <DownloadGrid />
          <InstallNotes />
        </div>
      </section>
    </Shell>
  );
}
