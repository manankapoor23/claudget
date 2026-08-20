# Changelog

All notable changes to claudget. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/). Downloads for each release are on the
[Releases page](https://github.com/manankapoor23/claudget/releases).

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

[0.2.4]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.4
[0.2.3]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.3
[0.2.2]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.2
[0.2.1]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.1
[0.2.0]: https://github.com/manankapoor23/claudget/releases/tag/v0.2.0
