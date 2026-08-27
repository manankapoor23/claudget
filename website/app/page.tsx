import Shell from "./components/Shell";
import { AppWindow } from "./components/AppWindow";
import { Architecture } from "./components/Architecture";
import { Changelog } from "./components/Changelog";
import MacArch from "./components/MacArch";
import {
  DownloadCount,
  DownloadCta,
  DownloadGrid,
  DownloadStats,
  ReleaseTag,
  ReleaseVersion,
} from "./components/Download";
import { IconGitHub, IconMail, LogoMark } from "./icons";
import {
  LICENSE_URL,
  MAKER_EMAIL,
  MAKER_NAME,
  MAKER_URL,
  RELEASES_URL,
  REPO_URL,
} from "./constants";

/* ---------- content ------------------------------------------------------ */

/** What the widget actually measures. Values are representative, labels exact. */
const TRACKS = [
  {
    value: "6.9M",
    label: "tokens",
    note: "Input, output and cache, split by block, session, project and model.",
  },
  {
    value: "$17.10",
    label: "est. cost",
    note: "Priced from the model mix found in your own transcripts.",
  },
  {
    value: "42K",
    unit: "/m",
    label: "burn rate",
    note: "Tokens per minute across the active block, with a projection.",
  },
  {
    value: "02:14",
    label: "resets in",
    note: "Countdown to the end of the current ~5-hour window.",
  },
  {
    value: "27%",
    label: "plan used",
    note: "5-hour and weekly limits, when plan tracking is switched on.",
  },
  {
    value: "8",
    label: "sessions",
    note: "Recent sessions with per-project and per-model totals.",
  },
];

const DETAILS = [
  {
    n: "01",
    title: "Local data",
    body: "Usage is read straight from the transcripts Claude Code already writes. No API key, no account, no network required — the local view works fully offline.",
    code: "~/.claude/projects/**/*.jsonl",
  },
  {
    n: "02",
    title: "Plan limits",
    body: "Optionally polls Anthropic's usage endpoint with the OAuth token Claude Code already stored, for 5-hour and weekly percentages and reset times. Off until you enable it, and rate-limited with backoff.",
    code: "api.anthropic.com/api/oauth/usage",
  },
  {
    n: "03",
    title: "Read-only",
    body: "claudget never writes to Claude Code's directory, never logs your OAuth token, and sends nothing anywhere except the Anthropic endpoint above when you turn plan tracking on.",
  },
  {
    n: "04",
    title: "Desktop-native",
    body: "A frameless always-on-top window that follows you across every Space and over fullscreen apps. Tray menu, compact mode, click-through, global hotkeys, and dark/light/system themes.",
    code: "⌘⌥U toggle · ⌘⌥C click-through",
  },
];

/* ---------- page --------------------------------------------------------- */

export default function Home() {
  return (
    <Shell>
      <div id="top" />
      <MacArch />

      {/* ============ HERO ============ */}
      <section className="wrap hero">
        <div>
          {/* The brand belongs inside the h1: it is the term people search for,
              and it was previously in a sibling div, so the page's primary
              heading never mentioned the product by name. Rendered as a block
              span so this is identical visually to the two-element version. */}
          <h1>
            <span className="hero__name">claudget</span>
            A small desktop monitor for Claude&nbsp;Code.
          </h1>
          <p className="hero__lede">
            Reads usage from Claude&nbsp;Code&apos;s local transcripts and keeps
            tokens, cost, burn rate and plan limits on your desktop. Local-first
            and read-only by default.
          </p>

          <div className="hero__actions">
            <DownloadCta />
            <a className="btn btn--lg" href={REPO_URL} target="_blank" rel="noreferrer">
              <IconGitHub />
              GitHub
            </a>
          </div>

          <div className="hero__meta">
            <span>
              <b>
                <ReleaseTag />
              </b>
            </span>
            <span>MIT</span>
            <span>macOS · Windows · Linux</span>
            <DownloadCount />
          </div>
        </div>

        <AppWindow />
      </section>

      {/* ============ WHAT IT TRACKS ============ */}
      <section id="app" className="wrap sec">
        <div className="sec__grid">
          <div className="sec__label">
            <b>—</b> What it tracks
          </div>
          <div>
            <h2 className="sec__title">Telemetry, not dashboards.</h2>
            <p className="sec__lede">
              Everything below is derived on your machine from files
              Claude&nbsp;Code has already written. Figures shown are
              representative.
            </p>
          </div>
        </div>

        <div className="tracks" style={{ marginTop: "var(--s6)" }}>
          {TRACKS.map(({ value, unit, label, note }) => (
            <div className="track" key={label}>
              <div className="track__val">
                {value}
                {unit ? <span>{unit}</span> : null}
              </div>
              <span className="lbl">{label}</span>
              <p className="track__note">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="wrap sec">
        <div className="sec__grid">
          <div className="sec__label">
            <b>—</b> How it works
          </div>
          <div>
            <h2 className="sec__title">Two sources, one snapshot.</h2>
            <p className="sec__lede">
              A file watcher and an optional HTTP poll feed a single aggregator.
              The widget renders whatever the latest snapshot says.
            </p>
          </div>
        </div>

        <div className="sec__grid">
          <div />
          <Architecture />
        </div>
      </section>

      {/* ============ DETAIL ROWS ============ */}
      <section className="wrap sec">
        <div className="rows">
          {DETAILS.map(({ n, title, body, code }) => (
            <div className="row" key={n}>
              <div className="sec__label">
                <b>{n}</b> {title}
              </div>
              <div className="row__body">
                <h3>{title}</h3>
                <p>{body}</p>
                {code ? <div className="row__code">{code}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ DOWNLOAD ============ */}
      <section id="download" className="wrap sec">
        <div className="sec__grid">
          <div className="sec__label">
            <b>—</b> Download
          </div>
          <div>
            <h2 className="sec__title">
              Free and open source · <ReleaseTag />
            </h2>
            <p className="sec__lede">
              Direct downloads from GitHub Releases. No sign-up, no installer
              telemetry.
            </p>
          </div>
        </div>

        <div style={{ marginTop: "var(--s6)" }}>
          <DownloadStats />
          <DownloadGrid />
        </div>

        <div className="sec__grid" style={{ marginTop: "var(--s7)" }}>
          <div className="sec__label">
            <b>—</b> From source
          </div>
          <div>
            <p className="sec__lede" style={{ marginBottom: "var(--s3)" }}>
              Requires Node.js ≥ 20. The installer lands in{" "}
              <span className="mono">packages/desktop/release</span>.
            </p>
            <code className="cmd">{`npm install\nnpm run package`}</code>
          </div>
        </div>
      </section>

      {/* ============ CHANGELOG ============ */}
      <section id="changelog" className="wrap sec">
        <div className="sec__grid">
          <div className="sec__label">
            <b>—</b> Changelog
          </div>
          <div>
            <h2 className="sec__title">Release history</h2>
            <p className="sec__lede">
              <a
                className="tlink"
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
              >
                All releases on GitHub
              </a>
            </p>
          </div>
        </div>

        <div style={{ marginTop: "var(--s6)" }}>
          <Changelog />
        </div>
      </section>

      {/* ============ MAKER ============ */}
      <section className="wrap sec">
        <div className="sec__grid">
          <div className="sec__label">
            <b>—</b> Made by
          </div>
          <div className="maker">
            <div className="maker__name">{MAKER_NAME}</div>
            <p>
              Built because I wanted a simple way to see how much
              Claude&nbsp;Code I was actually using without keeping another
              browser tab open. It reads only what the CLI already stores on this
              machine, and stays out of the way.
            </p>
            <p>
              MIT licensed and developed in the open. Issues and pull requests
              are genuinely welcome.
            </p>
            <div className="maker__links">
              <a className="btn" href={MAKER_URL} target="_blank" rel="noreferrer">
                <IconGitHub />
                @manankapoor23
              </a>
              <a
                className="btn"
                href={`${REPO_URL}/issues`}
                target="_blank"
                rel="noreferrer"
              >
                Issues
              </a>
              <a className="btn" href={`mailto:${MAKER_EMAIL}`}>
                <IconMail />
                Email
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer__meta">
            <div>
              <span className="lbl">Version</span>
              <span className="num">
                <ReleaseVersion />
              </span>
            </div>
            <div>
              <span className="lbl">License</span>
              <a href={LICENSE_URL} target="_blank" rel="noreferrer">
                MIT
              </a>
            </div>
            <div>
              <span className="lbl">Platforms</span>
              <span className="num">macOS · Windows · Linux</span>
            </div>
            <div>
              <span className="lbl">Source</span>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </div>

          <div className="footer__bar">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--s2)",
              }}
            >
              <LogoMark style={{ width: 15, height: 15 }} />
              claudget · built by {MAKER_NAME}
            </span>
            <span>Not affiliated with Anthropic</span>
          </div>
        </div>
      </footer>
    </Shell>
  );
}
