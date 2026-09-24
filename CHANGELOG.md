# Changelog

All notable changes to claudget. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/). Downloads for each release are on the
[Releases page](https://github.com/manankapoor23/claudget/releases).

## [0.3.0] — 2026-09-25

### Changed

- **claudget now lives in your menu bar.** On macOS both limits sit next to the
  clock as `62% · 31%`; on Windows and Linux it's a tray icon. Click it for a
  popover with both limits, today's tokens and rate, the last 24 hours, and your
  heaviest sessions. The always-on-top window is gone; everything it did is
  still here, spread over views you can turn on as you need them.

- **Each limit shows when you'll run out.** A tick on the bar marks how much of
  the window has passed. When usage is ahead of it, the row shows the time
  you'll hit the limit at your current pace ("Full by 4:01 PM").

- **Plan limits are on by default.** They come from Anthropic's usage endpoint
  using the login Claude Code already stored. Turn off **Track plan limits** in
  Settings to stay fully local.

### Added

- **Limit alerts:** a notification at 80% and 95% of a limit, once per window.
  Pick your own thresholds in **Settings → Alerts**.
- **Floating pill:** one line above your windows showing the limit closest to
  running out. Its outline turns amber, then red, as you get close.
- **Floating bar:** a resizable strip with both limits and today's activity that
  stays on top beside your editor.
- **Dashboard:** Overview, Activity, Sessions and Insights, including how close
  each recent 5-hour and weekly window came to its limit and how often you hit
  it. It's a normal window now; turn on **Keep on top** in Settings if you
  want it to float.
- **Settings** in its own window (General, Alerts, Data, About), and a short
  welcome card on first launch.
- A new app icon and design, with SF Pro on the Mac.

### Fixed

- The app version and the release tag match again. 0.2.5.1 had to ship as
  0.2.6, because Electron needs three-part versions.

## [0.2.5.1] — 2026-09-09

### Fixed

- **Recent sessions now have useful names.** The widget uses the real working
  directory from Claude Code transcripts, preserves project names containing
  hyphens, and adds a short summary of the first meaningful request. Git
  branches and full session details remain available as fallbacks and tooltips.

## [0.2.5] — 2026-08-27

### Changed

- **The plan-usage panel now says why it has nothing to show, and what fixes
  it.** Signing out of Claude Code produced a bare "No Claude credentials
  found.", which read as though the whole widget had stopped. It now names the
  cause, offers the one command that resolves it, and makes clear that tokens,
  cost and burn rate are unaffected — those come from local transcripts and
  don't need a login at all.

- Causes that need different responses are no longer reported identically.
  Signed out, no Claude directory, a macOS Keychain prompt that was denied,
  unreadable credentials and an expired token are now distinguished — signing in
  again does nothing about a denied Keychain, and neither helps if the Claude
  directory setting points somewhere wrong. An expired token also says whether it
  can refresh itself.

- Status badges name the state — Signed out, Blocked, Not found, Expired,
  Rejected, Offline — rather than a single "Unavailable".

## [0.2.4] — 2026-08-20

### Changed

- **The installed app is roughly half the size.** Two things were paying for
  themselves twice over: Electron ships ~220 Chromium locale bundles (~47 MB)
  for a UI that only exists in English, and the macOS build was universal, which
  puts two copies of the Electron framework on disk when a machine can only ever
  execute one. `app.asar` was 6 MB of a 279 MB install, so none of this was the
  app's own code.

  ```
  installed   486 MB -> 233 MB
  download    205 MB ->  94 MB
  ```

- **macOS now has three downloads:** Universal, Apple Silicon and Intel. The
  per-arch builds are about half the size. Universal remains the safe choice and
  the site's default — macOS reports Apple Silicon Macs as "Intel Mac OS X", so
  the right build can't always be detected, and the site only picks one when it
  can prove which it is.

- Source maps are no longer shipped inside the app, and installers use maximum
  compression.

## [0.2.3] — 2026-08-20

### Fixed

- **Live updates no longer stall while you work (macOS).** The transcript watcher
  combined chokidar's `awaitWriteFinish` with a debounce that restarted on every
  event. An active Claude Code session appends a line every ~250ms, so the file
  never went quiet and the timer never expired — the widget delivered **zero**
  updates for the whole session and only caught up on the 2-minute full rescan.
  It now coalesces into a fixed window and always makes progress.
- **Settings no longer freeze the app (macOS 26).** Every config change re-ran the
  full apply path, including `setLoginItemSettings` (a ~9ms privileged call on
  macOS 26), a tray-menu rebuild, a re-assert of every native window flag, and a
  complete usage-snapshot rebuild pushed over IPC. The opacity slider fires
  ~30–60 changes/second while dragging, which saturated the main process and
  beachballed the window. Each step now runs only when its own field changed
  (~11.5ms → ~0.3ms per event).
- Dropped a pointless privileged `setLoginItemSettings` call on every launch — it
  logged `Operation not permitted` on macOS 26 just to set the default off→off.

## [0.2.2] — 2026-06-20

### Changed

- New claudget app icon and branding across the app (window, tray, installers).

## [0.2.1] — 2026-06-20

### Changed

- Renamed the product to **claudget** — installers are now `claudget-<version>-…`.

## [0.2.0] — 2026-06-20

### Added

- **Glassmorphism redesign** — frosted UI with a single coral accent, light/dark/system.
- **Budgets & alerts** — daily and monthly spend limits with native notifications at 80% and 100%.
- **Spend forecast** ("at this rate"), a **plan-pace badge** (on-track / burning-fast), and an **insights** panel (top project, model split, busiest hour).
- **Auto-update** on Windows & Linux (via GitHub Releases).
- Free cross-platform release pipeline (macOS `.dmg`, Windows `Setup.exe`/Portable, Linux `.AppImage`).

### Fixed

- Stays on top across **every macOS Space** and over fullscreen apps (runs as a menu-bar accessory).
- Guard against an IPC send to a disposed renderer frame on reload/close.

[0.3.0]: https://github.com/manankapoor23/claudget/releases/tag/v0.3.0
[0.2.5]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.5
[0.2.5.1]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.5.1
[0.2.4]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.4
[0.2.3]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.3
[0.2.2]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.2
[0.2.1]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.1
[0.2.0]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.0
