<p align="center">
  <img src="claudget-logo.png" alt="claudget" width="120" height="120" />
</p>

<h1 align="center">claudget</h1>

A little always-on-top desktop widget for keeping an eye on your Claude Code usage — plan limits, time till reset, tokens burned, rough cost, burn rate, recent sessions. Electron + React + TS.

> No setup. It just reads what the Claude Code CLI already has sitting on your machine — the OAuth token from the macOS Keychain (or `~/.claude/.credentials.json` on other OSes). Nothing to paste in, no key to generate. If `claude` already works for you, this will too.

I built this because I kept alt-tabbing to a terminal just to run a usage command. Now it's just... there.

---

## What it does

- **Live usage %** for both the 5-hour and weekly windows, with a countdown to reset. Pulled straight from Anthropic's usage endpoint using the token Claude Code already stored — you don't do anything. Can be switched off in Settings if you'd rather it stay fully local.
- **Works offline** for everything else — tokens, cost estimates, per-model breakdown, session blocks, burn rate, an activity sparkline — all computed from your local transcripts. Doesn't need the network at all if you turn polling off.
- **Stays out of your way.** Frameless, translucent, draggable, always on top (optional). Compact mode if you just want the number. Click-through if it's annoying you. Lives in the tray, hotkeys to show/hide.
- Dark/light/system theme, because obviously.
- **Read-only.** It never writes to `~/.claude`, and the OAuth token never goes anywhere except `api.anthropic.com`. More on this below since I know some of you will (rightly) want to check.

## Screenshots

There are three views — full dashboard, compact mode, and settings. Easier to just run it and look (see Quick start below) than for me to describe them badly here.

---

## Download & install

Latest builds are on the [Releases page](https://github.com/manankapoor23/claudget/releases/latest) — `.dmg` for macOS, `Setup.exe`/`Portable.exe` for Windows, `.AppImage` for Linux.

I'm not paying Apple/Microsoft to sign an open-source side project, so your OS will complain the first time you open it. This is normal, not a sign something's wrong:

- **macOS** — right-click → Open (then Open again on the popup). If it says the app "is damaged and can't be opened" (classic Gatekeeper overreaction for unsigned apps), run:
  ```bash
  xattr -cr "/Applications/claudget.app"
  ```
- **Windows** — SmartScreen will throw up a wall, click "More info" → "Run anyway".
- **Linux** — `chmod +x` the AppImage, run it, no complaints.

Auto-update works fine on Windows/Linux. macOS being unsigned means no auto-update — just grab new versions from Releases when you want them.

## Quick start (building from source)

You'll need Node ≥ 20, npm ≥ 9, and the Claude Code CLI already installed and logged in (run `claude` once if you haven't). Works on Mac, Windows, Linux.

```bash
# installs both workspaces
npm install

# dev mode, hot reload on both renderer and main
npm run dev

# or build + run the production bundle
npm run build
npm start
```

### Running the built app without packaging it

`npm run build` spits everything out into `packages/desktop/out`. If you just want to run that without going through electron-builder:

```bash
npm run build
npx electron packages/desktop
```

For an actual installer, skip to [Packaging](#packaging).

---

## Scripts

Run these from the repo root.

| Script | Does what |
| --- | --- |
| `npm run dev` | builds `core`, launches desktop app with hot reload |
| `npm run build` | builds `core` (tsup) + desktop (electron-vite) |
| `npm run package` | full build → installer via electron-builder |
| `npm run package:dir` | unpacked app dir, no installer — good for quick local testing |
| `npm run typecheck` | `tsc --noEmit`, strict, both workspaces |
| `npm test` | vitest, `core` package only |
| `npm run lint` | eslint, whole repo |
| `npm run format` | prettier write (`format:check` to just check) |

---

## Configuration

Lives in a JSON file in the app's user-data dir. Easiest way to edit it: Settings screen in the app. You can also open the raw file directly from Settings → About → Config file, or find it yourself:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\claudget\config.json` |
| macOS | `~/Library/Application Support/claudget/config.json` |
| Linux | `~/.config/claudget/config.json` |

If you hand-edit it and mess up a field, that one field just falls back to default — won't brick the whole app. Full list of what you can set:

| Key | Type / range | Default | What it does |
| --- | --- | --- | --- |
| `enableOfficial` | boolean | `true` | poll Anthropic for the plan-limit gauges. `false` = fully local. |
| `officialPollIntervalMs` | int, 180000–3600000 | `300000` | how often to poll. **Can't go below 180s** — the endpoint will rate-limit you. |
| `localDebounceMs` | int, 200–10000 | `1000` | debounce for transcript file-change events |
| `fullRescanIntervalMs` | int, 10000–3600000 | `120000` | periodic full rescan, catches new projects/missed FS events |
| `recentSessionLimit` | int, 1–100 | `8` | how many recent sessions to list |
| `historyWindowHours` | int, 1–168 | `24` | how far back the sparkline goes |
| `blockHours` | number, 1–24 | `5` | length of a usage "block" (Claude's session window is ~5h) |
| `currency` | ISO 4217 | `"USD"` | display currency for costs |
| `claudeDir` | string \| null | `null` | override `~/.claude` location, `null` = auto-detect |
| `pricingOverridePath` | string \| null | `null` | point at your own pricing JSON instead of the bundled one |
| `theme` | `system`\|`dark`\|`light` | `"system"` | self-explanatory |
| `alwaysOnTop` | boolean | `true` | keep window above everything |
| `clickThrough` | boolean | `false` | let clicks pass through to whatever's underneath |
| `compact` | boolean | `false` | minimal layout |
| `opacity` | number, 0.3–1 | `1` | window opacity |
| `showInTaskbar` | boolean | `true` | show in taskbar/dock |
| `launchOnLogin` | boolean | `false` | start at login |
| `logLevel` | `error`\|`warn`\|`info`\|`debug` | `"info"` | log verbosity |

### Env var override

`CLAUDE_CONFIG_DIR` — sets the Claude data dir if you've got it somewhere nonstandard. (The `claudeDir` config field wins if both are set.)

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Alt+U` | show/hide |
| `Ctrl/Cmd+Alt+C` | toggle click-through |

Tray icon has the same toggles plus Refresh, Open logs, Open config, Quit.

---

## How it works

Two data sources, combined into one snapshot:

1. **Local transcripts** — `~/.claude/projects/**/*.jsonl`, parsed and aggregated into token counts, cost estimates, per-model breakdown, ~5h blocks, burn rate, hourly activity. This is ground truth for spend, and it's all offline.
2. **Official usage endpoint** — `api.anthropic.com/api/oauth/usage`, hit using the same OAuth token the CLI already has, same `claude-code/<version>` user-agent the CLI sends. This is ground truth for plan limits (% used, % left, reset time). Polled at most every 180s with backoff on 429s.

If the endpoint's unreachable for whatever reason — you're offline, login expired, you got rate-limited — it just shows the last known numbers tagged **Cached** and keeps the local stuff updating like normal. Full pipeline details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) if you're curious.

### Security / privacy, because someone always asks

- The OAuth token is never logged, never sent anywhere except `api.anthropic.com`. The only non-secret stuff (subscription type, rate-limit tier, scopes, org UUID) shows up in snapshots/logs.
- Strictly read-only on `~/.claude`. Never writes there, ever.
- Everything else the app needs (config, window position, logs) stays in its own user-data dir.

---

## Packaging

electron-builder config is at [`packages/desktop/electron-builder.yml`](packages/desktop/electron-builder.yml).

```bash
npm run package        # installer for whatever OS you're on
npm run package:dir    # unpacked dir, no installer, faster for testing
```

Targets: Windows NSIS installer + portable exe, macOS dmg, Linux AppImage. Output goes to `packages/desktop/release`.

> Heads up on Windows: electron-builder pulls down a `winCodeSign` bundle that has macOS symlinks in it, and extracting that can blow up with "A required privilege is not held by the client" unless Developer Mode is on (Settings → System → For developers) or you're running from an elevated shell. The macOS bits in there don't matter for a Windows build, it's just how the bundle ships.

---

## Troubleshooting

- **"No usage data is available yet."** — Either you haven't used Claude Code on this machine yet, or `~/.claude/projects` is empty. Run a session, give it a second or two.
- **Plan limits stuck on "Sign in…" / "login expired".** — Run `claude` once to refresh your credentials. Widget picks it up on the next poll.
- **Plan limits showing "Cached" / rate-limited.** — Anthropic's throttling the usage endpoint, this is expected if you poll a lot. It backs off on its own; local data's unaffected. Bump `officialPollIntervalMs` if it keeps happening.
- **Cost numbers look off.** — They're estimates from a bundled price table, not official. Point `pricingOverridePath` at your own JSON if you want accuracy there. The plan-limit percentages, on the other hand, come straight from Anthropic and are real.
- **"Electron failed to install correctly"** — the Electron binary download got interrupted. Run `node node_modules/electron/install.js`, or just nuke `node_modules` and `npm install` again.
- **Logs** — tray menu or Settings → Logs. Set `logLevel` to `debug` if you need more.

---

## Project layout

```
packages/
  core/        framework-agnostic data layer — parsing, aggregation, the official
               client, the engine. No Electron, no React in here. vitest for tests.
  desktop/     the actual Electron app — main process (windowing, tray, IPC,
               config), preload bridge, React renderer for the UI.
docs/
  ARCHITECTURE.md   how it's all wired together, if you want the long version.
```

## License

MIT, see [LICENSE](LICENSE).
