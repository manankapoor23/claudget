import Shell from "./components/Shell";
import {
  LogoMark,
  IconOffline,
  IconGauge,
  IconLayers,
  IconLock,
  IconGitHub,
  IconApple,
  IconWindows,
  IconLinux,
  IconDownload,
  IconMail,
} from "./icons";
import {
  REPO_URL,
  RELEASES_URL,
  MAKER_NAME,
  MAKER_URL,
  MAKER_EMAIL,
} from "./constants";

/* ---------- content data ------------------------------------------------ */

const FEATURES = [
  {
    Icon: IconOffline,
    title: "Local by default",
    body: "Tokens, cost, per-model breakdown, session blocks and burn rate — all read from the transcripts Claude Code already stores. 100% offline, no API key.",
  },
  {
    Icon: IconGauge,
    title: "Optional plan limits",
    body: "Switch on plan tracking to see your 5-hour and weekly windows, percent remaining and a live reset countdown from Anthropic's usage endpoint. Off by default.",
  },
  {
    Icon: IconLock,
    title: "Private by design",
    body: "Strictly read-only to ~/.claude — it never writes there, never logs your OAuth token, and sends nothing anywhere except api.anthropic.com.",
  },
  {
    Icon: IconLayers,
    title: "Stays out of the way",
    body: "Frameless, translucent and always-on-top, with a compact mode, click-through, tray hiding and global hotkeys. Dark, light or system theme, updating in real time.",
  },
];

const PLATFORMS = [
  {
    Icon: IconApple,
    os: "macOS",
    file: "Universal .dmg · drag to Applications",
    note: "11 Big Sur or later · Intel + Apple Silicon",
    unblock:
      "Unsigned, so macOS blocks first launch. After dragging to Applications, run: xattr -dr com.apple.quarantine /Applications/claudget.app  (details below).",
  },
  {
    Icon: IconWindows,
    os: "Windows",
    file: "NSIS Setup-x64.exe · or Portable-x64.exe",
    note: "Windows 10 / 11 · x64",
    unblock: 'First open: SmartScreen → "More info" → "Run anyway".',
  },
  {
    Icon: IconLinux,
    os: "Linux",
    file: "AppImage-x64 · chmod +x and run",
    note: "Most modern distros · x64",
    unblock: "No prompt — just chmod +x and run.",
  },
];

/* ---------- page -------------------------------------------------------- */

export default function Home() {
  return (
    <Shell>
      <div className="content stack">
        {/* ============ HERO / OVERVIEW ============ */}
        <section id="overview" className="hero">
          <div>
            <span className="hero__eyebrow">
              open source · MIT · macOS / Windows / Linux
            </span>
            <h1>
              Your Claude&nbsp;Code usage, <mark>on the desk</mark> in real time.
            </h1>
            <p className="hero__lede">
              A lightweight, always-on-top desktop widget that reads the transcripts
              Claude&nbsp;Code already stores — and turns them into a live ledger of tokens,
              cost, burn rate, plan limits and recent sessions. Zero setup. Fully local.
            </p>
            <div className="hero__actions">
              <a className="btn btn--primary btn--lg" href="#download">
                <IconDownload />
                Download free
              </a>
              <a
                className="btn btn--lg"
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                <IconGitHub />
                View source
              </a>
            </div>
          </div>

          {/* ---- widget mockup ---- */}
          <WidgetMock />
        </section>

        {/* ============ FEATURES ============ */}
        <section id="features" className="box">
          <div className="box__head">
            <h2 className="section-header">Features</h2>
          </div>
          <div className="features">
            {FEATURES.map(({ Icon, title, body }) => (
              <article className="feature" key={title}>
                <div className="feature__icon">
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section id="how" className="box">
          <div className="box__head">
            <h2 className="section-header">How it works</h2>
          </div>
          <div className="box__body">
            <p className="meta" style={{ marginBottom: "var(--s4)" }}>
              The widget combines two independent sources into one snapshot. If the network
              source is unavailable, it shows the last known values marked{" "}
              <strong style={{ color: "var(--ink)" }}>Cached</strong> and keeps local data
              flowing.
            </p>
            <div className="steps">
              <div className="step">
                <div className="step__num">01</div>
                <h3>Local transcripts</h3>
                <p>
                  <code>~/.claude/projects/**/*.jsonl</code> is parsed and aggregated into
                  token counts, cost estimates, a per-model breakdown, ~5-hour blocks, burn
                  rate and an hourly activity series. This is the source of truth for spend —
                  and it works entirely offline.
                </p>
              </div>
              <div className="step">
                <div className="step__num">02</div>
                <h3>Official usage endpoint</h3>
                <p>
                  Optionally, <code>api.anthropic.com</code> is read with the OAuth token
                  Claude&nbsp;Code already stored — the source of truth for plan limits
                  (percent used, percent remaining, reset time). Polled no more than every
                  180s with backoff. Off until you enable it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ DOWNLOAD ============ */}
        <section id="download" className="box">
          <div className="box__head">
            <h2 className="section-header">Download</h2>
            <span className="box__meta">Latest release</span>
          </div>
          <div className="downloads">
            {PLATFORMS.map(({ Icon, os, file, note, unblock }) => (
              <div className="dl" key={os}>
                <div className="dl__os">
                  <Icon />
                  <h3>{os}</h3>
                </div>
                <div className="dl__file">
                  {file}
                  <br />
                  <span style={{ color: "var(--muted)" }}>{note}</span>
                </div>
                <a
                  className="btn btn--primary"
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconDownload />
                  Get for {os}
                </a>
                <div className="dl__unblock">{unblock}</div>
              </div>
            ))}
          </div>
          <div className="box__body" style={{ borderTop: "var(--border)" }}>
            <p className="meta" style={{ marginBottom: "var(--s3)" }}>
              <strong style={{ color: "var(--ink)" }}>Why does my OS warn me?</strong>{" "}
              claudget is free and open source, so the builds aren&apos;t paid-signed by
              Apple/Microsoft. The override below is one-time — the code is on GitHub for
              anyone to read.
            </p>
            <p className="meta" style={{ marginBottom: "var(--s2)" }}>
              <strong style={{ color: "var(--ink)" }}>macOS</strong> (Sequoia blocks
              unsigned apps and may move them to Trash). Drag claudget to Applications, then
              in Terminal:
            </p>
            <pre
              style={{
                background: "var(--glass-3)",
                border: "var(--rim-dim)",
                borderRadius: "var(--radius-3)",
                padding: "var(--s2) var(--s3)",
                overflowX: "auto",
                marginBottom: "var(--s3)",
              }}
            >
              <code>xattr -dr com.apple.quarantine /Applications/claudget.app</code>
            </pre>
            <p className="meta" style={{ marginBottom: "var(--s3)" }}>
              Then open it. (Or: System Settings → Privacy &amp; Security → “claudget was
              blocked” → <strong style={{ color: "var(--ink)" }}>Open Anyway</strong>.) On{" "}
              <strong style={{ color: "var(--ink)" }}>Windows</strong>, SmartScreen → “More
              info” → “Run anyway”.
            </p>
            <p className="meta">
              Prefer to build it yourself? Clone the repo, run{" "}
              <code
                style={{
                  background: "var(--paper-border-bg)",
                  border: "1px solid var(--ink)",
                  padding: "0 4px",
                }}
              >
                npm install &amp;&amp; npm run package
              </code>{" "}
              and find the installer in <code>packages/desktop/release</code>. Requires
              Node.js ≥ 20.
            </p>
          </div>
        </section>

        {/* ============ MAKER ============ */}
        <section id="maker" className="box">
          <div className="box__head">
            <h2 className="section-header">Maker</h2>
          </div>
          <div className="maker">
            <div className="maker__mark" aria-hidden>
              MK
            </div>
            <div className="maker__body">
              <div className="maker__name">
                {MAKER_NAME}
                <span className="maker__role">Engineer · maintainer</span>
              </div>
              <p>
                I built <strong>claudget</strong> because I wanted a calmer, always-on way to
                keep an eye on Claude&nbsp;Code spend without leaving the editor or pasting an
                API key anywhere. It reads only what the CLI already stores on your machine,
                stays out of the way, and is free and open source under the MIT license.
              </p>
              <p className="meta">
                Issues, ideas and pull requests are genuinely welcome — the whole thing is
                built in the open.
              </p>
              <div className="maker__links">
                <a className="btn" href={MAKER_URL} target="_blank" rel="noreferrer">
                  <IconGitHub style={{ width: 16, height: 16 }} />
                  @manankapoor23
                </a>
                <a className="btn" href={`mailto:${MAKER_EMAIL}`}>
                  <IconMail style={{ width: 16, height: 16 }} />
                  Email
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ============ FOOTER ============ */}
      <footer id="footer" className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <span className="footer__logo">
              <LogoMark style={{ width: 28, height: 28 }} />
              claudget
            </span>
            <span className="footer__line">Built by {MAKER_NAME} · MIT</span>
          </div>
          <nav className="footer__links">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">
              Latest release
            </a>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
              Report an issue
            </a>
          </nav>
        </div>
        <div className="footer__bar">
          Not affiliated with Anthropic · reads only what Claude&nbsp;Code stores
        </div>
      </footer>
    </Shell>
  );
}

/* ---------- widget mockup (printed-report rendering) -------------------- */

function WidgetMock() {
  // deterministic bar heights for the activity sparkline
  const bars = [38, 52, 30, 64, 80, 46, 58, 72, 90, 60, 44, 76];
  return (
    <div className="mock" aria-hidden>
      <div className="mock__bar">
        <span className="mock__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="mock__title">Current Block · 5h window</span>
      </div>
      <div className="mock__body">
        <div className="bigmetric">
          <div className="mock__row">
            <span className="label">Block Tokens</span>
            <span className="label">Consumed 27%</span>
          </div>
          <div className="mock__row" style={{ alignItems: "flex-end" }}>
            <span className="metric">6.9M</span>
            <span className="meta">/ 26M</span>
          </div>
          <div className="mock__gauge" style={{ marginTop: "var(--s2)" }}>
            <div className="gauge">
              <i style={{ width: "27%" }} />
            </div>
            <span className="meta">27%</span>
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: "var(--s2)" }}>
            Activity · last 12h
          </div>
          <div className="spark">
            {bars.map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        <div className="mock__grid">
          <div className="mock__cell">
            <span className="label">Est. Cost</span>
            <div className="metric">$17.10</div>
          </div>
          <div className="mock__cell">
            <span className="label">Burn Rate</span>
            <div className="metric">42K/m</div>
          </div>
          <div className="mock__cell">
            <span className="label">Resets In</span>
            <div className="metric">02:14</div>
          </div>
          <div className="mock__cell">
            <span className="label">Sessions</span>
            <div className="metric">8</div>
          </div>
        </div>
      </div>
    </div>
  );
}