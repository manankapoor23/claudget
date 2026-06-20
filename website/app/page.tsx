import Shell from "./components/Shell";
import {
  LogoMark,
  IconOffline,
  IconGauge,
  IconLayers,
  IconLock,
  IconTheme,
  IconBell,
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
  ARCH_URL,
  LICENSE_URL,
  README_URL,
  MAKER_NAME,
  MAKER_URL,
  MAKER_EMAIL,
} from "./constants";

/* ---------- content data ------------------------------------------------ */

const FEATURES = [
  {
    Icon: IconOffline,
    title: "Local by default",
    body: "Token counts, cost estimates, per-model breakdown, session blocks, burn rate and an activity sparkline are all derived from the transcripts Claude Code already stores on your machine. Works 100% offline. No API key, nothing to paste.",
  },
  {
    Icon: IconGauge,
    title: "Optional plan limits",
    body: "Flip on plan-limit tracking to add your 5-hour and weekly windows — percent consumed, percent remaining, and a live reset countdown — read from Anthropic's official usage endpoint. Off by default.",
  },
  {
    Icon: IconLayers,
    title: "Stays out of the way",
    body: "Frameless, translucent, always-on-top and draggable. Toggle compact mode, click-through, opacity and taskbar visibility. Hides to the system tray with global hotkeys to show or hide.",
  },
  {
    Icon: IconTheme,
    title: "Dark · light · system",
    body: "A clean dashboard that respects your OS theme. Compact at-a-glance layout when you want less, the full ledger when you want more.",
  },
  {
    Icon: IconLock,
    title: "Private by design",
    body: "Strictly read-only to ~/.claude — it never writes there. The OAuth token is never logged and never sent anywhere except api.anthropic.com. All app state lives in the app's own data directory.",
  },
  {
    Icon: IconBell,
    title: "Real-time, no noise",
    body: "File-watch on your transcripts coalesces changes within ~1s, with a periodic full rescan to catch new projects. The reset countdown, burn rate and projected usage update as you work.",
  },
];

const SECTIONS = [
  {
    n: "01",
    name: "Current Block",
    items: "Reset timer · elapsed time · burn rate",
  },
  {
    n: "02",
    name: "Usage Metrics",
    items: "Tokens · requests · cost · projected usage",
  },
  {
    n: "03",
    name: "Historical Usage",
    items: "Daily · weekly · monthly timelines",
  },
  {
    n: "04",
    name: "Session Activity",
    items: "Active sessions · average burn rate · peak usage",
  },
  {
    n: "05",
    name: "System Summary",
    items: "Total tokens · total cost · lifetime statistics",
  },
];

const PLATFORMS = [
  {
    Icon: IconApple,
    os: "macOS",
    file: "Universal .dmg · drag to Applications",
    note: "11 Big Sur or later · Intel + Apple Silicon",
    unblock: "First open: right-click the app → Open. (Or run xattr -cr on it.)",
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
              <LogoMark style={{ width: 14, height: 14 }} />
              claudget · open source · MIT · macOS / Windows / Linux
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
            <div className="hero__stats">
              <div>
                <div className="metric">0</div>
                <div className="label">API keys needed</div>
              </div>
              <div>
                <div className="metric">100%</div>
                <div className="label">Local &amp; offline</div>
              </div>
              <div>
                <div className="metric">3</div>
                <div className="label">Platforms</div>
              </div>
            </div>
          </div>

          {/* ---- widget mockup ---- */}
          <WidgetMock />
        </section>

        {/* ============ METRIC CARD ROW ============ */}
        <div className="rule">
          <span>Sample readout</span>
        </div>
        <div className="cards">
          <div className="card">
            <span className="label">Block Tokens</span>
            <span className="metric">6.9M</span>
            <span className="meta">$17.10 est.</span>
          </div>
          <div className="card">
            <span className="label">Requests</span>
            <span className="metric">1,284</span>
            <span className="meta">this block</span>
          </div>
          <div className="card">
            <span className="label">Burn Rate</span>
            <span className="metric">42K</span>
            <span className="meta">tokens / min</span>
          </div>
          <div className="card">
            <span className="label">Resets In</span>
            <span className="metric">02:14</span>
            <span className="meta delta">on track</span>
          </div>
        </div>

        {/* ============ FEATURES ============ */}
        <section id="features" className="box">
          <div className="box__head">
            <h2 className="section-header">Specifications</h2>
            <span className="section-num">§ FEATURES</span>
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
            <span className="section-num">§ DATA SOURCES</span>
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

        {/* ============ DASHBOARD SECTIONS LEDGER ============ */}
        <section className="box">
          <div className="box__head">
            <h2 className="section-header">What it tracks</h2>
            <span className="section-num">§ DASHBOARD</span>
          </div>
          <div className="box__body">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Reports</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => (
                  <tr key={s.n}>
                    <td>
                      <span className="num">{s.n}</span>
                      {s.name}
                    </td>
                    <td>{s.items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ============ DOWNLOAD ============ */}
        <section id="download" className="box">
          <div className="box__head">
            <h2 className="section-header">Download</h2>
            <span className="section-num">§ RELEASES · v0.1.0</span>
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
              <strong style={{ color: "var(--ink)" }}>
                Why does my OS warn me?
              </strong>{" "}
              claudget is free and open source, so the builds aren&apos;t paid-signed by
              Apple/Microsoft. The one-time step above is all it takes — the code is on
              GitHub for anyone to read. Nothing is sent anywhere except{" "}
              <code>api.anthropic.com</code>.
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

        {/* ============ PRIVACY CALLOUT ============ */}
        <div className="callout">
          <IconLock />
          <p>
            <strong>Private by design.</strong> The widget is strictly read-only to{" "}
            <code>~/.claude</code> — it never writes there, never logs your OAuth token, and
            never transmits it anywhere except <code>api.anthropic.com</code>. Only
            non-secret fields ever appear in snapshots or logs.
          </p>
        </div>

        {/* ============ MAKER ============ */}
        <section id="maker" className="box">
          <div className="box__head">
            <h2 className="section-header">Maker</h2>
            <span className="section-num">§ ABOUT</span>
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
            <div className="header__title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <LogoMark style={{ width: 18, height: 18, color: "var(--action-orange)" }} />
              claudget
            </div>
            <p>
              A premium engineering notebook for your Claude&nbsp;Code usage. Built with
              Electron, React and TypeScript by {MAKER_NAME}. MIT licensed.
            </p>
          </div>
          <div className="footer__col">
            <h4>Product</h4>
            <a href="#features">Specifications</a>
            <a href="#how">How it works</a>
            <a href="#download">Download</a>
            <a href="#maker">Maker</a>
          </div>
          <div className="footer__col">
            <h4>Project</h4>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub repository
            </a>
            <a href={README_URL} target="_blank" rel="noreferrer">
              README
            </a>
            <a href={ARCH_URL} target="_blank" rel="noreferrer">
              Architecture
            </a>
            <a href={LICENSE_URL} target="_blank" rel="noreferrer">
              MIT License
            </a>
          </div>
          <div className="footer__col">
            <h4>Resources</h4>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">
              Latest release
            </a>
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
              Report an issue
            </a>
          </div>
        </div>
        <div className="footer__bar">
          © 2026 claudget · Built by {MAKER_NAME} · Not affiliated with Anthropic · Reads
          only what Claude&nbsp;Code already stores
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
          <div className="gauge" style={{ marginTop: "var(--s2)" }}>
            ████████<span className="dim">░░░░░░░░░░░░░░░░░░░░</span>
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