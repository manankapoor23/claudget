# Claude Usage Widget

A lightweight, always-on-top desktop widget that shows your **Claude Code** usage in
real time — current and remaining plan limits, time until reset, token spend, estimated
cost, burn rate, and recent sessions. Built with Electron + React + TypeScript.

> **Zero setup.** The widget reads the data the Claude Code CLI already stores on your
> machine — including the OAuth token it keeps in the macOS Keychain (or
> `~/.claude/.credentials.json` elsewhere). There is nothing to paste, no API key to manage.
> If you're signed in to Claude Code, the widget just works.

---

## Highlights

- **Live usage %** — your 5-hour and weekly windows as % consumed / % remaining with a live
  countdown to reset, fetched from Anthropic's official usage endpoint using the OAuth token
  Claude Code already stored. On by default; flip it off in Settings to go fully local.
- **Fully local data** — token counts, cost estimates, per-model breakdown, session blocks,
  burn rate, and an activity sparkline are all derived from your local transcripts and work
  **100% offline**, even with plan-limit polling turned off.
- **Stays out of the way** — frameless, translucent, always-on-top, draggable. Toggle
  **compact mode**, **click-through**, opacity, and taskbar visibility. Hides to the system
  tray; global hotkeys to show/hide.
- **Dark / light / system** theming with a clean, modern dashboard aesthetic.
- **Private by design** — the widget is strictly read-only to `~/.claude`, never writes
  there, and never transmits your OAuth token anywhere except `api.anthropic.com`.

## Screenshots

The widget has three layouts: the full dashboard, **compact mode**, and the **settings**
panel. (Run it to see them — see [Quick start](#quick-start).)

---

## Download & install

Grab the latest build from the [**Releases page**](https://github.com/manankapoor23/claudget/releases/latest) — macOS `.dmg`, Windows `Setup.exe`/`Portable.exe`, Linux `.AppImage`.

claudget is free and open source, so the builds aren't paid-signed by Apple/Microsoft. Your OS shows a one-time warning the first time you open it — that's expected for unsigned open-source apps, not a problem with the app:

- **macOS** — right-click the app → **Open** (then **Open** again). If you see *"is damaged and can't be opened"*, clear the download quarantine once:
  ```bash
  xattr -cr "/Applications/Claude Usage Widget.app"
  ```
- **Windows** — on the SmartScreen prompt, click **More info → Run anyway**.
- **Linux** — `chmod +x` the AppImage and run it. No prompt.

> Auto-update works on Windows and Linux. On macOS (unsigned) you re-download new versions from Releases manually.

## Quick start (build from source)

**Requirements:** Node.js ≥ 20, npm ≥ 9, and the Claude Code CLI installed and signed in
(run `claude` once if you haven't). Windows, macOS, and Linux are supported.

```bash
# 1. Install dependencies (installs both workspaces)
npm install

# 2. Run in development (hot-reloading renderer + main)
npm run dev

# 3. …or build and run the production bundle
npm run build
npm start            # see "Running the built app" below
```

### Running the built app

`npm run build` compiles everything into `packages/desktop/out`. To launch that bundle
without packaging an installer:

```bash
npm run build
npx electron packages/desktop      # launches the built main process
```

To produce a distributable installer instead, see [Packaging](#packaging).

---

## Scripts

All scripts run from the repository root.

| Script                | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | Build `core`, then start the desktop app with hot reload.        |
| `npm run build`       | Build `core` (tsup) and the desktop app (electron-vite).         |
| `npm run package`     | Build, then produce an installer/binary via electron-builder.    |
| `npm run package:dir` | Build an unpacked app directory (fast, for local smoke testing). |
| `npm run typecheck`   | Strict `tsc --noEmit` across both workspaces.                    |
| `npm test`            | Run the `core` unit tests (vitest).                              |
| `npm run lint`        | ESLint across the repo.                                          |
| `npm run format`      | Prettier write. `format:check` to verify only.                   |

---

## Configuration

Settings live in a JSON file in the app's user-data directory and can be edited from the
in-app **Settings** screen (recommended) or by hand. Open the file via
**Settings → About → Config file**. Locations:

| OS      | Path                                                               |
| ------- | ------------------------------------------------------------------ |
| Windows | `%APPDATA%\@claude-widget\desktop\config.json`                     |
| macOS   | `~/Library/Application Support/@claude-widget/desktop/config.json` |
| Linux   | `~/.config/@claude-widget/desktop/config.json`                     |

Invalid individual fields fall back to their default (a single bad value never bricks the
widget). Full schema:

| Key                      | Type / range                           | Default    | Meaning                                                                       |
| ------------------------ | -------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `enableOfficial`         | boolean                                | `true`     | Poll Anthropic for plan limits (the usage-% gauges). When `false`, the widget is 100% local. |
| `officialPollIntervalMs` | int, 180 000–3 600 000                 | `300000`   | Time between plan-limit polls. **Floor is 180 s** (endpoint is rate-limited). |
| `localDebounceMs`        | int, 200–10 000                        | `1000`     | Debounce for coalescing transcript file-change events.                        |
| `fullRescanIntervalMs`   | int, 10 000–3 600 000                  | `120000`   | Periodic full rescan to catch new projects / missed FS events.                |
| `recentSessionLimit`     | int, 1–100                             | `8`        | Max recent sessions listed.                                                   |
| `historyWindowHours`     | int, 1–168                             | `24`       | Span of the activity sparkline.                                               |
| `blockHours`             | number, 1–24                           | `5`        | Length of a usage "block" (Claude's session window is ~5 h).                  |
| `currency`               | ISO 4217 string                        | `"USD"`    | Display currency for cost estimates.                                          |
| `claudeDir`              | string \| null                         | `null`     | Override the `~/.claude` directory. `null` = auto-detect.                     |
| `pricingOverridePath`    | string \| null                         | `null`     | Path to a JSON pricing-override file. `null` = bundled defaults.              |
| `theme`                  | `system` \| `dark` \| `light`          | `"system"` | Color theme.                                                                  |
| `alwaysOnTop`            | boolean                                | `true`     | Keep the window above others.                                                 |
| `clickThrough`           | boolean                                | `false`    | Pass mouse clicks to windows beneath the widget.                              |
| `compact`                | boolean                                | `false`    | Minimal at-a-glance layout.                                                   |
| `opacity`                | number, 0.3–1                          | `1`        | Window opacity.                                                               |
| `showInTaskbar`          | boolean                                | `true`     | Show in the taskbar/dock.                                                     |
| `launchOnLogin`          | boolean                                | `false`    | Start the widget at login.                                                    |
| `logLevel`               | `error` \| `warn` \| `info` \| `debug` | `"info"`   | File/console log verbosity.                                                   |

### Environment overrides

- `CLAUDE_CONFIG_DIR` — if set, used as the Claude data directory (the `claudeDir` config
  field takes precedence over it).

---

## Keyboard shortcuts

| Shortcut         | Action                  |
| ---------------- | ----------------------- |
| `Ctrl/Cmd+Alt+U` | Show / hide the widget. |
| `Ctrl/Cmd+Alt+C` | Toggle click-through.   |

The system-tray icon offers the same toggles plus **Refresh**, **Open logs**, **Open
config**, and **Quit**.

---

## How it works (data sources)

The widget combines two independent sources into one snapshot:

1. **Local transcripts** (`~/.claude/projects/**/*.jsonl`) — parsed and aggregated into
   token counts, cost estimates, per-model breakdown, ~5-hour blocks, burn rate, and an
   hourly activity series. This is the source of truth for _spend_ and works offline.
2. **Official usage endpoint** (`api.anthropic.com/api/oauth/usage`) — read using the
   OAuth access token in `~/.claude/.credentials.json` (the same token the CLI uses),
   with a `claude-code/<version>` User-Agent. This is the source of truth for _plan
   limits_ (% used, % remaining, reset time). Polled no more often than every 180 s,
   with exponential backoff on HTTP 429.

If the endpoint is unavailable (offline, expired login, rate-limited), the widget shows
the last known values marked **Cached** and keeps local data flowing. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full pipeline.

### Security & privacy

- The OAuth access token is **never logged** and **never sent anywhere except
  `api.anthropic.com`**. Only non-secret fields (subscription type, rate-limit tier,
  scopes, org UUID) ever appear in snapshots or logs.
- The widget **only ever reads** `~/.claude`. It never writes to it.
- All app state (config, window position, logs) lives in the app's own user-data dir.

---

## Packaging

`electron-builder` config lives in [`packages/desktop/electron-builder.yml`](packages/desktop/electron-builder.yml).

```bash
npm run package        # full installer for the current OS
npm run package:dir    # unpacked app dir (no installer) — quick local test
```

Targets: **Windows** NSIS installer (`…-Setup-x64.exe`) + portable (`…-Portable-x64.exe`);
**macOS** `.dmg`; **Linux** `AppImage`. Output lands in `packages/desktop/release`.

> On Windows, electron-builder downloads a `winCodeSign` bundle that contains macOS
> symlinks; extracting it can fail with _"A required privilege is not held by the client"_
> unless you enable **Developer Mode** (Settings → System → For developers) or run the build
> from an elevated shell. The macOS files inside are irrelevant to a Windows build.

---

## Troubleshooting

- **"No usage data is available yet."** — You haven't used Claude Code on this machine, or
  `~/.claude/projects` is empty. Run a Claude Code session and the widget updates within a
  second or two.
- **Plan limits show "Sign in…" / "login expired".** — Run `claude` once to refresh your
  credentials; the widget picks up the new token on the next poll.
- **Plan limits show "Cached" / "rate-limited".** — Anthropic throttles the usage endpoint.
  The widget backs off automatically; local data keeps updating. Increase
  `officialPollIntervalMs` if it persists.
- **Wrong cost estimates.** — Costs are _estimates_ from a bundled price table; point
  `pricingOverridePath` at your own JSON to override. Plan-limit percentages come straight
  from Anthropic and are authoritative.
- **`Electron failed to install correctly`.** — Electron's binary download was interrupted.
  Fix with `node node_modules/electron/install.js`, or remove `node_modules` and re-run
  `npm install`.
- **Logs.** — Open via the tray or **Settings → Logs**. Raise `logLevel` to `debug` for
  detail.

---

## Project layout

```
packages/
  core/        Framework-agnostic data layer (parsing, aggregation, official client,
               engine). No Electron, no React. Unit-tested with vitest.
  desktop/     Electron shell: main process (windowing, tray, IPC, config), preload
               bridge, and the React renderer (UI).
docs/
  ARCHITECTURE.md   Design, data flow, and module reference.
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture.

## License

MIT — see [LICENSE](LICENSE).
